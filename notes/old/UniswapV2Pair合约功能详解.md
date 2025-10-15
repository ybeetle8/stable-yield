# UniswapV2Pair 合约功能详解

## 概述

`IUniswapV2Pair` 是 Uniswap V2 DEX 的核心合约接口，每个 Pair 合约代表一个交易对（如 OLA/USDT）。它既是 **ERC20 代币**（LP Token），也是 **自动做市商**（AMM），负责维护流动性池和执行交易。

## 核心特性

### 1. ERC20 代币功能
Pair 合约本身是一个 ERC20 代币（LP Token），代表流动性提供者的份额：
- `name()`, `symbol()`, `decimals()`: 代币基本信息
- `totalSupply()`, `balanceOf()`: LP Token 供应量和余额
- `transfer()`, `approve()`, `transferFrom()`: 标准转账功能
- `permit()`: EIP-2612 签名授权，支持无 gas 授权

### 2. 流动性池状态
- `token0()`, `token1()`: 交易对的两个代币地址（按地址排序）
- `getReserves()`: 返回储备量 (reserve0, reserve1) 和最后更新时间
- `price0CumulativeLast()`, `price1CumulativeLast()`: 累计价格，用于 TWAP 预言机
- `kLast()`: 上次手续费计算时的 k 值（k = reserve0 * reserve1）

## 🔑 关键机制：收到转账后会发生什么？

### 重要原理：先转账，后调用

**Uniswap V2 的核心设计模式：Pair 合约不会自动处理收到的代币，需要手动调用特定函数触发操作。**

### 转账后的三种场景

#### 场景 1️⃣：添加流动性（mint）

```solidity
// 用户操作流程
1. token0.transfer(pair, amount0);  // 转入 token0
2. token1.transfer(pair, amount1);  // 转入 token1
3. pair.mint(to);                    // 调用 mint 铸造 LP Token
```

**mint() 函数逻辑：**
```solidity
function mint(address to) external returns (uint liquidity) {
    // 1. 获取当前储备量（上次同步的状态）
    (uint112 _reserve0, uint112 _reserve1,) = getReserves();

    // 2. 获取合约当前实际余额
    uint balance0 = IERC20(token0).balanceOf(address(this));
    uint balance1 = IERC20(token1).balanceOf(address(this));

    // 3. 计算用户新转入的数量
    uint amount0 = balance0 - _reserve0;  // 余额变化 = 新转入的代币
    uint amount1 = balance1 - _reserve1;

    // 4. 计算应铸造的 LP Token 数量
    if (totalSupply == 0) {
        // 首次添加流动性
        liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
    } else {
        // 后续添加，按比例计算
        liquidity = Math.min(
            amount0 * totalSupply / _reserve0,
            amount1 * totalSupply / _reserve1
        );
    }

    // 5. 铸造 LP Token 给接收者
    _mint(to, liquidity);

    // 6. 更新储备量
    _update(balance0, balance1, _reserve0, _reserve1);

    emit Mint(msg.sender, amount0, amount1);
}
```

**关键点：**
- `mint()` 通过 **对比余额和储备量** 来检测新转入的代币
- 如果只转账不调用 `mint()`，代币会留在合约中，但不会铸造 LP Token
- 必须按照当前池子比例添加流动性，否则会有滑点损失

---

#### 场景 2️⃣：交易/兑换（swap）

```solidity
// 用户操作流程（通过 Router）
1. tokenIn.transfer(pair, amountIn);           // 转入要卖出的代币
2. pair.swap(amount0Out, amount1Out, to, "");  // 调用 swap 换出代币
```

**swap() 函数逻辑：**
```solidity
function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external {
    require(amount0Out > 0 || amount1Out > 0, 'INSUFFICIENT_OUTPUT_AMOUNT');

    // 1. 获取当前储备量
    (uint112 _reserve0, uint112 _reserve1,) = getReserves();
    require(amount0Out < _reserve0 && amount1Out < _reserve1, 'INSUFFICIENT_LIQUIDITY');

    // 2. 转出代币给接收者
    if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
    if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);

    // 3. 如果有 data，执行闪电贷回调（Flash Swap）
    if (data.length > 0) IUniswapV2Callee(to).uniswapV2Call(msg.sender, amount0Out, amount1Out, data);

    // 4. 获取转出后的余额
    uint balance0 = IERC20(token0).balanceOf(address(this));
    uint balance1 = IERC20(token1).balanceOf(address(this));

    // 5. 计算转入的数量
    uint amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
    uint amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
    require(amount0In > 0 || amount1In > 0, 'INSUFFICIENT_INPUT_AMOUNT');

    // 6. 验证 k 值（扣除 0.3% 手续费后）
    uint balance0Adjusted = balance0 * 1000 - amount0In * 3;  // 扣除 0.3% 手续费
    uint balance1Adjusted = balance1 * 1000 - amount1In * 3;
    require(balance0Adjusted * balance1Adjusted >= uint(_reserve0) * uint(_reserve1) * (1000**2), 'K');

    // 7. 更新储备量
    _update(balance0, balance1, _reserve0, _reserve1);

    emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
}
```

**关键点：**
- `swap()` 先转出代币，再检查转入的代币是否足够
- 通过 **k 值不变公式** 验证交易合法性：`(x - 0.3%) * y >= k`
- 支持 **闪电贷（Flash Swap）**：可以先拿到代币，在回调中再还款
- 如果只转账不调用 `swap()`，代币会留在合约中，不会自动兑换

---

#### 场景 3️⃣：移除流动性（burn）

```solidity
// 用户操作流程
1. pair.transfer(pair, liquidity);  // 将 LP Token 转给 Pair 合约自己
2. pair.burn(to);                    // 调用 burn 销毁 LP，取回代币
```

**burn() 函数逻辑：**
```solidity
function burn(address to) external returns (uint amount0, uint amount1) {
    // 1. 获取当前储备量
    (uint112 _reserve0, uint112 _reserve1,) = getReserves();
    address _token0 = token0;
    address _token1 = token1;

    // 2. 获取合约的代币余额
    uint balance0 = IERC20(_token0).balanceOf(address(this));
    uint balance1 = IERC20(_token1).balanceOf(address(this));

    // 3. 获取要销毁的 LP Token 数量（通过余额检测）
    uint liquidity = balanceOf[address(this)];

    // 4. 计算应返还的代币数量（按 LP 份额比例）
    uint _totalSupply = totalSupply;
    amount0 = liquidity * balance0 / _totalSupply;
    amount1 = liquidity * balance1 / _totalSupply;
    require(amount0 > 0 && amount1 > 0, 'INSUFFICIENT_LIQUIDITY_BURNED');

    // 5. 销毁 LP Token
    _burn(address(this), liquidity);

    // 6. 转出代币给接收者
    _safeTransfer(_token0, to, amount0);
    _safeTransfer(_token1, to, amount1);

    // 7. 更新储备量
    balance0 = IERC20(_token0).balanceOf(address(this));
    balance1 = IERC20(_token1).balanceOf(address(this));
    _update(balance0, balance1, _reserve0, _reserve1);

    emit Burn(msg.sender, amount0, amount1, to);
}
```

**关键点：**
- `burn()` 检测合约持有的 LP Token 数量来确定要销毁多少
- 按照 LP Token 份额比例返还两种代币
- 必须先将 LP Token 转给合约自己，再调用 `burn()`

---

### 场景 4️⃣：意外转账（skim / sync）

如果有人 **直接转账代币** 到 Pair 合约，但 **没有调用 mint/swap/burn**，会发生什么？

**问题：**
- 代币会留在合约中，造成 `余额 != 储备量`
- 这些代币变成 "捐赠"，无法被转账者取回
- 可能导致价格计算出现偏差

**解决方法：**

1. **skim(address to)**：清除多余代币
```solidity
function skim(address to) external {
    address _token0 = token0;
    address _token1 = token1;

    // 将超出储备量的代币转给指定地址
    _safeTransfer(_token0, to, IERC20(_token0).balanceOf(address(this)) - reserve0);
    _safeTransfer(_token1, to, IERC20(_token1).balanceOf(address(this)) - reserve1);
}
```

2. **sync()**：强制同步储备量
```solidity
function sync() external {
    // 将储备量更新为当前实际余额
    _update(
        IERC20(token0).balanceOf(address(this)),
        IERC20(token1).balanceOf(address(this)),
        reserve0,
        reserve1
    );
}
```

**使用场景：**
- `skim`：有人误转代币，可以调用 skim 将多余代币取出
- `sync`：代币合约有通缩/增发机制（如转账税），用于修正储备量

---

## 安全机制

### 1. 重入保护
Pair 合约使用 `lock` 修饰符防止重入攻击：
```solidity
uint private unlocked = 1;
modifier lock() {
    require(unlocked == 1, 'LOCKED');
    unlocked = 0;
    _;
    unlocked = 1;
}
```

### 2. 最小流动性锁定
首次添加流动性时，会永久锁定 `MINIMUM_LIQUIDITY = 1000` 个 LP Token 到零地址，防止流动性被完全抽干导致除零错误。

### 3. K 值保护
每次 `swap` 都会验证 `k = reserve0 * reserve1` 不减少（扣除手续费后），确保流动性不会因交易而减少。

---

## 事件日志

Pair 合约会发出以下事件供前端和链下服务监听：

```solidity
event Mint(address indexed sender, uint amount0, uint amount1);
event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
event Swap(
    address indexed sender,
    uint amount0In,
    uint amount1In,
    uint amount0Out,
    uint amount1Out,
    address indexed to
);
event Sync(uint112 reserve0, uint112 reserve1);
```

---

## 实际使用建议

### ✅ 正确做法（通过 Router）

不要直接调用 Pair 合约，应该通过 `PancakeRouter` 或 `UniswapV2Router`：

```solidity
// 添加流动性
router.addLiquidity(tokenA, tokenB, amountA, amountB, minA, minB, to, deadline);

// 交易
router.swapExactTokensForTokens(amountIn, minOut, path, to, deadline);

// 移除流动性
router.removeLiquidity(tokenA, tokenB, liquidity, minA, minB, to, deadline);
```

**Router 会帮你：**
- 自动转账代币到 Pair
- 调用正确的函数
- 处理滑点保护
- 支持多跳路由
- 处理原生币（BNB/ETH）包装

### ❌ 错误做法

```solidity
// 不要直接转账代币到 Pair 合约！
token.transfer(pairAddress, amount);  // 代币会被锁在合约中，无法自动处理

// 不要在没有转账的情况下调用 mint/swap/burn！
pair.mint(to);  // 会失败或铸造 0 个 LP Token
```

---

## 总结

### 核心设计哲学：**余额差值检测**

Uniswap V2 Pair 合约的核心机制是 **通过对比合约余额和储备量来检测转账**：

```
转入数量 = 当前余额 - 上次储备量
```

这种设计有以下优点：
1. **简单高效**：不需要复杂的授权和 transferFrom 逻辑
2. **支持税费代币**：可以正确处理带有转账税的代币
3. **支持闪电贷**：可以先借出代币，回调中再检查还款

但也有风险：
- **直接转账会丢失代币**：如果只转账不调用函数，代币会变成"捐赠"
- **需要通过 Router**：普通用户应该使用 Router 合约来确保正确操作

### 工作流程总结

| 操作 | 步骤 1 | 步骤 2 | 结果 |
|------|--------|--------|------|
| 添加流动性 | 转入 token0 + token1 | 调用 `mint()` | 铸造 LP Token |
| 交易兑换 | 转入 tokenIn | 调用 `swap()` | 换出 tokenOut |
| 移除流动性 | 转入 LP Token | 调用 `burn()` | 取回 token0 + token1 |
| 意外转账 | 转入代币但不调用函数 | 调用 `skim()` 或 `sync()` | 清理或同步余额 |

**记住：先转账，后调用！**
