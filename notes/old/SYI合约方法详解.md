# SYI 合约方法详解

## 目录

- [合约架构](#合约架构)
- [核心常量](#核心常量)
- [状态变量](#状态变量)
- [修饰符](#修饰符)
- [构造函数](#构造函数)
- [初始化函数](#初始化函数)
- [配置管理函数](#配置管理函数)
- [核心交易函数](#核心交易函数)
- [外部接口函数](#外部接口函数)
- [查询函数](#查询函数)
- [内部辅助函数](#内部辅助函数)

---

## 合约架构

```
contracts/SYI/
├── abstract/
│   └── SYIBase.sol (1472行)      # 核心业务逻辑
├── mainnet/
│   └── SYI.sol (36行)             # 主网环境配置
└── interfaces/
    └── ISYI.sol                    # SYI 接口定义
```

**继承关系**:
```
SYI (mainnet)
  └── SYIBase (abstract)
       ├── ERC20 (OpenZeppelin)
       └── Ownable (OpenZeppelin)
```

**设计模式**: 抽象基类模式
- `SYIBase.sol`: 所有核心业务逻辑
- `SYI.sol`: 仅配置环境参数（预售期 30 天，延迟购买期 30 天）

---

## 核心常量

### 不可变常量

| 常量名 | 值 | 说明 |
|--------|-----|------|
| `DEAD_ADDRESS` | `0x000000000000000000000000000000000000dEaD` | 销毁地址 |
| `BASIS_POINTS` | `10000` | 基点（100% = 10000） |
| `BUY_BURN_FEE` | `100` (1%) | 买入销毁费 |
| `BUY_LIQUIDITY_FEE` | `200` (2%) | 买入 LP 奖励费 |
| `SELL_MARKETING_FEE` | `150` (1.5%) | 卖出营销费 |
| `SELL_LIQUIDITY_ACCUM_FEE` | `150` (1.5%) | 卖出 LP 累积费 |
| `PROFIT_TAX_RATE` | `2500` (25%) | 利润税率 |
| `NO_PROFIT_FEE` | `2500` (25%) | 无利润费（未使用） |
| `LP_HANDLE_FEE` | `250` (2.5%) | LP 处理费（未使用） |

### 不可变地址

| 变量名 | 类型 | 说明 | 在构造函数中设置 |
|--------|------|------|-----------------|
| `USDT` | `address` | USDT 代币地址 | ✅ |
| `uniswapV2Router` | `IUniswapV2Router02` | PancakeRouter 地址 | ✅ |
| `staking` | `IStaking` | SYI-Staking 合约地址 | ✅ |

---

## 状态变量

### 核心合约地址

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `uniswapV2Pair` | `IUniswapV2Pair` | `address(0)` | SYI/USDT 交易对地址 |
| `liquidityStaking` | `ILiquidityStaking` | `address(0)` | LP 质押合约地址 |
| `fundRelay` | `FundRelay` | `address(0)` | 资金中继合约地址 |
| `rootAddress` | `address` | `address(0)` | 根地址（未使用） |
| `marketingAddress` | `address` | 构造函数传入 | 营销地址 |
| `nodeDividendAddress` | `address` | `address(0)` | 节点分红地址 |

### 费用累积

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `amountMarketingFee` | `uint256` | `0` | 累积的营销费用（SYI） |
| `amountLPFee` | `uint256` | `0` | 累积的 LP 费用（SYI） |
| `swapAtAmount` | `uint256` | `10000 ether` | 自动兑换阈值 |

### 预售控制

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `presaleStartTime` | `uint256` | 合约部署时间 | 预售开始时间 |
| `presaleDuration` | `uint256` | `30 days` | 预售持续时间 |
| `presaleActive` | `bool` | `true` | 预售是否激活 |

### 延迟购买

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `delayedBuyEnabled` | `bool` | `false` | 是否启用延迟购买 |
| `contractDeployTime` | `uint256` | 合约部署时间 | 合约部署时间戳 |
| `delayedBuyEnabledTime` | `uint256` | `0` | 延迟购买启用时间 |

### 用户数据

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `userInvestment` | `mapping(address => uint256)` | 用户累积投资成本（USDT） |
| `lastBuyTime` | `mapping(address => uint256)` | 用户最后购买时间 |
| `feeWhitelisted` | `mapping(address => bool)` | 费用白名单 |
| `blacklisted` | `mapping(address => bool)` | 黑名单 |

### 其他参数

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `coldTime` | `uint256` | `10 seconds` | 冷却时间（买卖间隔） |
| `liquidityThreshold` | `uint256` | `1 gwei` | 流动性阈值（未使用） |
| `_whitelistInitialized` | `bool` | `false` | 白名单是否已初始化 |
| `_inSwap` | `bool` | `false` | 是否正在兑换中 |
| `_inRouterSwap` | `bool` | `false` | 是否正在路由兑换中（未使用） |
| `_inLiquidityOperation` | `bool` | `false` | 是否正在流动性操作中（未使用） |

---

## 修饰符

### `notBlacklisted(address account)`
**功能**: 检查地址是否在黑名单中
**使用位置**:
- `_handleBuy()` - 买入时检查买家
- `_handleSell()` - 卖出时检查卖家

**逻辑**:
```solidity
if (blacklisted[account]) revert Blacklisted();
```

---

### `lockSwap()`
**功能**: 防止重入兑换
**使用位置**:
- `_swapTokensForUSDT()` - 兑换代币为 USDT
- `_processFeeDistribution()` - 处理费用分发
- `_processImmediateLiquidityInternal()` - 处理即时流动性

**逻辑**:
```solidity
_inSwap = true;
_;
_inSwap = false;
```

---

### `delayedBuyCheck(address buyer)`
**功能**: 检查是否满足延迟购买条件
**使用位置**:
- `_handleBuy()` - 买入时检查

**逻辑**:
```solidity
if (delayedBuyEnabled && !feeWhitelisted[buyer]) {
    uint256 requiredDelay = 30 days;  // 主网
    uint256 baseTime = delayedBuyEnabledTime > 0
        ? delayedBuyEnabledTime
        : contractDeployTime;
    if (block.timestamp < baseTime + requiredDelay) {
        revert DelayedBuyPeriodNotMet();
    }
}
```

---

## 构造函数

### `constructor(address _usdt, address _router, address _staking, address _marketingAddress)`

**文件**: `SYIBase.sol:285-309`

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_usdt` | `address` | USDT 代币地址 (BSC: `0x55d398326f99059fF775485246999027B3197955`) |
| `_router` | `address` | PancakeRouter 地址 (BSC: `0x10ED43C718714eb63d5aA57B78B54704E256024E`) |
| `_staking` | `address` | SYI-Staking 合约地址 |
| `_marketingAddress` | `address` | 营销地址 |

**功能**:
1. 验证所有地址非零地址
2. 设置不可变变量 (`USDT`, `uniswapV2Router`, `staking`, `marketingAddress`)
3. 铸造 **10,000,000 SYI** (1000万，非1亿) 给 owner
4. 记录合约部署时间
5. 初始化预售参数（开始时间、持续时间、激活状态）

**错误**:
- `ZeroAddress()` - 任何参数为零地址时抛出

**与其他合约的交互**:
- 无（仅设置地址）

**注意事项**:
- ⚠️ 实际铸造量为 **1000万 SYI**，与文档中的 1 亿不符
- 预售期默认为 30 天（主网）或更短（测试网）

---

## 初始化函数

### `initializeWhitelist()`

**文件**: `SYIBase.sol:320-331`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**: 无

**功能**:
1. 检查白名单是否已初始化（只能初始化一次）
2. 将以下地址加入费用白名单:
   - `owner()` - 合约拥有者
   - `address(this)` - SYI 合约自身
   - `address(staking)` - SYI-Staking 合约
   - `marketingAddress` - 营销地址
   - `address(uniswapV2Router)` - PancakeRouter

**错误**:
- `AlreadyInitialized()` - 已经初始化过时抛出

**与其他合约的交互**:
- 无

**使用时机**:
- 部署后立即调用（在 `setPair` 之前）

---

## 配置管理函数

### `setPair(address _pair)`

**文件**: `SYIBase.sol:337-342`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_pair` | `address` | SYI/USDT 交易对地址 |

**功能**:
1. 验证地址非零
2. 验证交易对未设置（只能设置一次）
3. 设置 `uniswapV2Pair`
4. 从 Staking 合约更新预售期

**错误**:
- `ZeroAddress()` - 地址为零时抛出
- `AlreadySet()` - 交易对已设置时抛出

**与其他合约的交互**:
- 无（仅设置地址）

**部署顺序**:
- 在 PancakeFactory 创建 Pair 后调用

---

### `setLiquidityStaking(address _liquidityStaking)`

**文件**: `SYIBase.sol:344-348`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_liquidityStaking` | `address` | LiquidityStaking 合约地址 |

**功能**:
1. 验证地址非零
2. 设置 `liquidityStaking` 合约
3. 将 LiquidityStaking 加入费用白名单

**错误**:
- `ZeroAddress()` - 地址为零时抛出

**与其他合约的交互**:
- 无（仅设置地址）

**部署顺序**:
- 在 LiquidityStaking 部署后调用

---

### `setFundRelay(address _fundRelay)`

**文件**: `SYIBase.sol:350-354`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_fundRelay` | `address` | FundRelay 合约地址 |

**功能**:
1. 验证地址非零
2. 设置 `fundRelay` 合约
3. 将 FundRelay 加入费用白名单

**错误**:
- `ZeroAddress()` - 地址为零时抛出

**与其他合约的交互**:
- 无（仅设置地址）

---

### `setMarketingAddress(address _newAddress)`

**文件**: `SYIBase.sol:356-362`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_newAddress` | `address` | 新的营销地址 |

**功能**:
1. 验证地址非零
2. 记录旧地址
3. 设置新的 `marketingAddress`
4. 将新地址加入费用白名单
5. 触发 `MarketingAddressUpdated` 事件

**错误**:
- `ZeroAddress()` - 地址为零时抛出

**事件**:
```solidity
event MarketingAddressUpdated(address indexed oldAddress, address indexed newAddress);
```

**与其他合约的交互**:
- 无

---

### `setNodeDividendAddress(address _node)`

**文件**: `SYIBase.sol:364-367`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_node` | `address` | 节点分红地址 |

**功能**:
1. 验证地址非零
2. 设置 `nodeDividendAddress`（接收利润税的 60%）

**错误**:
- `ZeroAddress()` - 地址为零时抛出

**与其他合约的交互**:
- 无

**说明**:
- 如果未设置，利润税的 60% 将发送给 `marketingAddress`

---

### `setFeeWhitelisted(address account, bool whitelisted)`

**文件**: `SYIBase.sol:369-374`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `account` | `address` | 要设置的地址 |
| `whitelisted` | `bool` | 是否加入白名单 |

**功能**:
- 设置单个地址的费用白名单状态

**与其他合约的交互**:
- 无

**白名单效果**:
- 免除所有交易费用（买入税、卖出税、利润税）
- 跳过延迟购买检查
- 跳过黑名单检查

---

### `setBatchFeeWhitelisted(address[] memory accounts, bool _whitelisted)`

**文件**: `SYIBase.sol:376-383`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `accounts` | `address[]` | 地址数组 |
| `_whitelisted` | `bool` | 是否加入白名单 |

**功能**:
- 批量设置地址的费用白名单状态

**与其他合约的交互**:
- 无

---

### `setBatchBlacklisted(address[] memory accounts, bool _blacklisted)`

**文件**: `SYIBase.sol:385-392`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `accounts` | `address[]` | 地址数组 |
| `_blacklisted` | `bool` | 是否加入黑名单 |

**功能**:
- 批量设置地址的黑名单状态

**与其他合约的交互**:
- 无

**黑名单效果**:
- 禁止买入 SYI
- 禁止卖出 SYI

---

### `setBlacklisted(address account, bool _blacklisted)`

**文件**: `SYIBase.sol:394-399`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `account` | `address` | 要设置的地址 |
| `_blacklisted` | `bool` | 是否加入黑名单 |

**功能**:
- 设置单个地址的黑名单状态

**与其他合约的交互**:
- 无

---

### `setSwapAtAmount(uint256 _swapAtAmount)`

**文件**: `SYIBase.sol:401-403`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_swapAtAmount` | `uint256` | 新的自动兑换阈值（单位: wei） |

**功能**:
- 设置累积费用达到多少时自动触发兑换和分发

**与其他合约的交互**:
- 无

**默认值**: `10000 ether` (10000 SYI)

---

### `setColdTime(uint256 _coldTime)`

**文件**: `SYIBase.sol:405-407`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_coldTime` | `uint256` | 新的冷却时间（单位: 秒） |

**功能**:
- 设置买入后多久才能卖出

**与其他合约的交互**:
- 无

**默认值**: `10 seconds`

---

### `setLiquidityThreshold(uint256 newThreshold)`

**文件**: `SYIBase.sol:409-411`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `newThreshold` | `uint256` | 新的流动性阈值 |

**功能**:
- 设置流动性阈值（当前代码中未实际使用）

**与其他合约的交互**:
- 无

---

### `setPresaleDuration()`

**文件**: `SYIBase.sol:413-415`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**: 无

**功能**:
- 从 Staking 合约更新预售期（当前实现中实际是使用固定值）

**与其他合约的交互**:
- 无（当前实现中未实际查询 Staking 合约）

---

### `setPresaleActive(bool _active)`

**文件**: `SYIBase.sol:417-425`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_active` | `bool` | 是否激活预售 |

**功能**:
1. 设置预售激活状态
2. 如果激活，重置预售开始时间为当前时间
3. 如果激活，重置预售持续时间为默认值（30天）
4. 触发事件

**事件**:
```solidity
event PresaleDurationUpdated(uint256 newDuration);
event PresaleStatusUpdated(bool active);
```

**与其他合约的交互**:
- 无

**预售效果**:
- 预售期内，所有地址（除白名单外）**禁止**在 PancakeSwap 买入 SYI

---

### `recoverStuckTokens(address token, uint256 amount)`

**文件**: `SYIBase.sol:427-433`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `token` | `address` | 代币地址 |
| `amount` | `uint256` | 提取数量 |

**功能**:
- 提取合约中误转入的代币（不包括 SYI 自身）

**与其他合约的交互**:
- 调用 `IERC20(token).transfer(owner(), amount)`

---

### `setDelayedBuyEnabled(bool _enabled)`

**文件**: `SYIBase.sol:450-460`
**权限**: `onlyOwner`
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `_enabled` | `bool` | 是否启用延迟购买 |

**功能**:
1. 设置延迟购买启用状态
2. 如果启用，记录启用时间
3. 如果禁用，清零启用时间
4. 触发事件

**事件**:
```solidity
event DelayedBuyEnabled(bool enabled);
```

**与其他合约的交互**:
- 无

**延迟购买效果**:
- 启用后，非白名单地址需要等待 30 天（主网）才能购买 SYI

---

## 核心交易函数

### `transfer(address to, uint256 value)`

**文件**: `SYIBase.sol:605-612`
**权限**: 公开
**状态修改**: ✅
**ERC20 标准**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `to` | `address` | 接收地址 |
| `value` | `uint256` | 转账数量 |

**返回值**:
| 类型 | 说明 |
|------|------|
| `bool` | 始终返回 `true` |

**功能**:
- 标准 ERC20 转账函数
- 内部调用 `_update()` 处理实际转账逻辑

**与其他合约的交互**:
- 通过 `_update()` 间接调用其他函数

---

### `transferFrom(address from, address to, uint256 value)`

**文件**: `SYIBase.sol:614-623`
**权限**: 公开
**状态修改**: ✅
**ERC20 标准**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `from` | `address` | 发送地址 |
| `to` | `address` | 接收地址 |
| `value` | `uint256` | 转账数量 |

**返回值**:
| 类型 | 说明 |
|------|------|
| `bool` | 始终返回 `true` |

**功能**:
- 标准 ERC20 授权转账函数
- 检查并扣除授权额度
- 内部调用 `_update()` 处理实际转账逻辑

**与其他合约的交互**:
- 通过 `_update()` 间接调用其他函数

---

### `_update(address from, address to, uint256 value)` ⭐

**文件**: `SYIBase.sol:629-661`
**权限**: 内部函数（`internal override`）
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `from` | `address` | 发送地址 |
| `to` | `address` | 接收地址 |
| `value` | `uint256` | 转账数量 |

**功能**:
**这是 SYI 合约的核心逻辑，所有转账都会经过这个函数**

1. **检查零地址**: 如果是铸造或销毁操作，直接执行
2. **检查白名单**: 如果发送方或接收方在白名单中，免税执行
3. **判断操作类型**:
   - **买入**: `_isBuyOperation()` - 从 Pair 转出到用户
   - **卖出**: `_isSellOperation()` - 从用户转入到 Pair
   - **普通转账**: 其他情况
4. **路由处理**:
   - 买入 → `_handleBuy()`
   - 卖出 → `_handleSell()`
   - 普通转账 → 直接执行 + 尝试触发 FundRelay 分发

**与其他合约的交互**:
- 通过 `_handleBuy()` 和 `_handleSell()` 间接调用
- 调用 `_tryTriggerFundRelayDistribution()`

---

## 外部接口函数

### `recycle(uint256 amount)` ⭐

**文件**: `SYIBase.sol:435-448`
**权限**: **仅 Staking 合约可调用**
**状态修改**: ✅

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `amount` | `uint256` | 请求回收的 SYI 数量 |

**功能**:
1. 验证调用者为 Staking 合约
2. 计算 Pair 中 SYI 余额
3. 计算最大可回收量（Pair 余额的 1/3）
4. 取 `amount` 和最大可回收量的较小值
5. 从 Pair 转移 SYI 到 Staking 合约
6. 调用 `Pair.sync()` 同步储备量

**与其他合约的交互**:
- ✅ **被调用者**: Staking 合约
- ✅ **调用**: `uniswapV2Pair.sync()` - 同步 Pair 储备量
- ✅ **调用**: `super._update()` - 转移代币

**使用场景**:
- Staking 合约需要额外的 SYI 用于奖励分发
- 从 Pair 中"回收"代币而不影响价格（通过 sync 调整）

**安全机制**:
- 限制每次最多回收 Pair 余额的 1/3，防止价格剧烈波动

---

### `triggerFundRelayDistribution()` ⭐

**文件**: `SYIBase.sol:1134-1142`
**权限**: **仅 Staking 或 LiquidityStaking 可调用**
**状态修改**: ✅

**参数**: 无

**功能**:
1. 验证调用者为 Staking 或 LiquidityStaking 合约
2. 尝试触发 FundRelay 分发
3. 尝试处理累积的费用

**与其他合约的交互**:
- ✅ **被调用者**: Staking 或 LiquidityStaking 合约
- ✅ **调用**: `fundRelay.receiveAndForward()` - 转移 USDT
- ✅ **调用**: `_tryProcessAccumulatedFees()` - 处理费用

**使用场景**:
- Staking 或 LiquidityStaking 合约需要 USDT 用于奖励分发
- 手动触发累积费用的兑换和分发

---

### `triggerFeeProcessing()`

**文件**: `SYIBase.sol:1462-1471`
**权限**: **Owner、Staking 或 LiquidityStaking 可调用**
**状态修改**: ✅

**参数**: 无

**功能**:
1. 验证调用者权限
2. 尝试处理累积的费用（兑换 + 分发）

**与其他合约的交互**:
- ✅ **被调用者**: Owner、Staking 或 LiquidityStaking 合约
- ✅ **调用**: `_tryProcessAccumulatedFees()` - 处理费用

**使用场景**:
- 手动触发累积费用的兑换和分发
- 当累积费用接近阈值但未达到时强制触发

---

## 查询函数

### `getAccumulatedFees()`

**文件**: `SYIBase.sol:466-472`
**权限**: 公开（`external view`）
**状态修改**: ❌

**参数**: 无

**返回值**:
| 名称 | 类型 | 说明 |
|------|------|------|
| `marketing` | `uint256` | 累积的营销费用（SYI） |
| `lp` | `uint256` | 累积的 LP 费用（SYI） |
| `threshold` | `uint256` | 自动兑换阈值 |

**功能**:
- 查询当前累积的费用和阈值

---

### `getUserInvestment(address user)`

**文件**: `SYIBase.sol:474-478`
**权限**: 公开（`external view`）
**状态修改**: ❌

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `user` | `address` | 用户地址 |

**返回值**:
| 名称 | 类型 | 说明 |
|------|------|------|
| `investment` | `uint256` | 用户累积投资成本（USDT） |
| `lastBuy` | `uint256` | 最后购买时间戳 |

**功能**:
- 查询用户的投资成本和最后购买时间
- 用于计算利润税

---

### `getUniswapV2Pair()`

**文件**: `SYIBase.sol:480-482`
**权限**: 公开（`external view`）
**状态修改**: ❌

**返回值**: `address` - Pair 地址

---

### `getLiquidityStaking()`

**文件**: `SYIBase.sol:484-486`
**权限**: 公开（`external view`）
**状态修改**: ❌

**返回值**: `address` - LiquidityStaking 地址

---

### `getFundRelay()`

**文件**: `SYIBase.sol:488-490`
**权限**: 公开（`external view`）
**状态修改**: ❌

**返回值**: `address` - FundRelay 地址

---

### `getUSDTReserve()`

**文件**: `SYIBase.sol:492-502`
**权限**: 公开（`external view`）
**状态修改**: ❌

**返回值**: `uint112 usdtReserve` - Pair 中的 USDT 储备量

**功能**:
- 查询 Pair 中 USDT 的储备量
- 如果查询失败返回 0

**与其他合约的交互**:
- ✅ **调用**: `uniswapV2Pair.getReserves()` - 获取储备量
- ✅ **调用**: `uniswapV2Pair.token0()` - 判断 token 顺序

---

### `getDelayedSwapStatus()`

**文件**: `SYIBase.sol:504-510`
**权限**: 公开（`external view`）
**状态修改**: ❌

**返回值**:
| 名称 | 类型 | 说明 |
|------|------|------|
| `pending` | `bool` | 始终为 `false`（已弃用） |
| `totalFees` | `uint256` | 累积的总费用 |

---

### `getPresaleStatus()`

**文件**: `SYIBase.sol:512-536`
**权限**: 公开（`external view`）
**状态修改**: ❌

**返回值**:
| 名称 | 类型 | 说明 |
|------|------|------|
| `active` | `bool` | 预售是否激活 |
| `startTime` | `uint256` | 预售开始时间 |
| `duration` | `uint256` | 预售持续时间 |
| `remainingTime` | `uint256` | 剩余时间 |
| `isInPresale` | `bool` | 当前是否在预售期 |

---

### `getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)`

**文件**: `SYIBase.sol:538-544`
**权限**: 公开（`external pure`）
**状态修改**: ❌

**功能**:
- Uniswap V2 AMM 公式：计算输出数量
- 使用 `Helper.getAmountOut()` 实现

---

### `getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)`

**文件**: `SYIBase.sol:546-552`
**权限**: 公开（`external pure`）
**状态修改**: ❌

**功能**:
- Uniswap V2 AMM 公式：计算输入数量
- 使用 `Helper.getAmountIn()` 实现

---

### `isContract(address account)`

**文件**: `SYIBase.sol:554-556`
**权限**: 公开（`external view`）
**状态修改**: ❌

**功能**:
- 检查地址是否为合约

---

### `getDelayedBuyInfo()`

**文件**: `SYIBase.sol:558-587`
**权限**: 公开（`external view`）
**状态修改**: ❌

**返回值**:
| 名称 | 类型 | 说明 |
|------|------|------|
| `enabled` | `bool` | 是否启用延迟购买 |
| `testModeActive` | `bool` | 始终为 `false`（已弃用） |
| `enabledTime` | `uint256` | 启用时间 |
| `requiredDelay` | `uint256` | 所需延迟时间 |
| `remainingDelay` | `uint256` | 剩余延迟时间 |

---

### `isDelayedBuyPeriodMet(address buyer)`

**文件**: `SYIBase.sol:589-599`
**权限**: 公开（`external view`）
**状态修改**: ❌

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `buyer` | `address` | 买家地址 |

**返回值**: `bool` - 是否满足延迟购买条件

**功能**:
- 如果未启用延迟购买，返回 `true`
- 如果买家在白名单中，返回 `true`
- 否则检查是否已等待足够时间

---

## 内部辅助函数

### `_handleBuy(address from, address to, uint256 amount)` ⭐

**文件**: `SYIBase.sol:716-764`
**权限**: 私有（`private`）
**状态修改**: ✅
**修饰符**: `notBlacklisted(to)`, `delayedBuyCheck(to)`

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `from` | `address` | Pair 地址 |
| `to` | `address` | 买家地址 |
| `amount` | `uint256` | 买入数量 |

**功能**:
**处理用户从 PancakeSwap 买入 SYI 的所有逻辑**

1. **预售检查**: 如果在预售期内，禁止买入（抛出 `NotAllowedBuy()`）
2. **计算费用**:
   - 销毁费: 1%
   - LP 奖励费: 2%
3. **执行转账**:
   - 销毁费 → `DEAD_ADDRESS`
   - LP 奖励费 → 直接存入 LiquidityStaking（SYI 代币）
   - 净数量 → 买家
4. **更新用户数据**:
   - 估算买入成本（USDT）
   - 累加到 `userInvestment[to]`
   - 更新 `lastBuyTime[to]`
5. **触发事件**

**与其他合约的交互**:
- ✅ **调用**: `super._update()` - 转移代币
- ✅ **调用**: `liquidityStaking.depositSYIRewards()` - 存入 LP 奖励

**税费流向**:
```
买入 1000 SYI
├─ 销毁费 10 SYI (1%) → DEAD_ADDRESS
├─ LP 奖励费 20 SYI (2%) → LiquidityStaking (SYI)
└─ 净收到 970 SYI → 买家
```

---

### `_handleSell(address from, address to, uint256 amount)` ⭐

**文件**: `SYIBase.sol:766-871`
**权限**: 私有（`private`）
**状态修改**: ✅
**修饰符**: `notBlacklisted(from)`

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `from` | `address` | 卖家地址 |
| `to` | `address` | Pair 地址 |
| `amount` | `uint256` | 卖出数量 |

**功能**:
**处理用户在 PancakeSwap 卖出 SYI 的所有逻辑**

1. **冷却检查**: 如果距离上次买入不足冷却时间，禁止卖出（抛出 `InColdPeriod()`）

2. **计算基础交易费用**:
   - 营销费: 1.5%
   - LP 累积费: 1.5%
   - 净数量 = 原始数量 - 交易费

3. **估算 USDT 收入**: 根据净数量估算能换到的 USDT

4. **计算利润税**:
   - 如果 `userInvestment[from] > 0` 且有利润
   - 利润 = 估算 USDT - 用户成本
   - 利润税 = 利润 × 25%
   - 转换为 SYI 数量

5. **执行转账**:
   - 营销费 → 合约（累积）
   - LP 累积费 → 合约（累积）
   - 利润税（SYI）→ 兑换为 USDT:
     - 40% → LiquidityStaking
     - 60% → nodeDividendAddress 或 marketingAddress
   - 净数量 → Pair

6. **更新用户成本**: `userInvestment[from]` 减去实际收入

7. **触发事件**

**与其他合约的交互**:
- ✅ **调用**: `super._update()` - 转移代币
- ✅ **调用**: `_swapTokensForUSDT()` - 兑换利润税
- ✅ **调用**: `liquidityStaking.depositRewards()` - 存入 USDT 奖励
- ✅ **调用**: `IERC20(USDT).transfer()` - 转移 USDT

**税费流向（假设有利润）**:
```
卖出 1000 SYI (假设能换 200 USDT，成本 100 USDT)
├─ 营销费 15 SYI (1.5%) → 合约累积
├─ LP 累积费 15 SYI (1.5%) → 合约累积
├─ 净数量 970 SYI → 估算 194 USDT
│
利润: 194 - 100 = 94 USDT
利润税: 94 × 25% = 23.5 USDT (约 121 SYI)
├─ 40% (9.4 USDT) → LiquidityStaking
└─ 60% (14.1 USDT) → nodeDividendAddress

最终净数量: 970 - 121 = 849 SYI → Pair
实际收到 USDT: 194 - 23.5 = 170.5 USDT
```

---

### `_swapTokensForUSDT(uint256 tokenAmount)` ⭐

**文件**: `SYIBase.sol:881-942`
**权限**: 私有（`private`）
**状态修改**: ✅
**修饰符**: `lockSwap`

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `tokenAmount` | `uint256` | 要兑换的 SYI 数量 |

**返回值**: `uint256 usdtReceived` - 实际收到的 USDT

**功能**:
**将 SYI 代币兑换为 USDT**

1. **检查余额**: 如果合约余额不足，返回 0
2. **构建交易路径**: SYI → USDT
3. **授权 Router**: 授权 Router 使用 SYI
4. **确定接收者**:
   - 如果 FundRelay 存在 → FundRelay
   - 否则 → 合约自身
5. **执行兑换**: 调用 `Router.swapExactTokensForTokensSupportingFeeOnTransferTokens()`
6. **处理接收**:
   - 如果使用 FundRelay → 调用 `fundRelay.receiveAndForward()` 转移回合约
   - 否则 → 直接计算余额变化
7. **错误处理**: 如果兑换失败，触发 `SwapFailed` 事件并返回 0

**与其他合约的交互**:
- ✅ **调用**: `_approve()` - 授权 Router
- ✅ **调用**: `uniswapV2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens()` - 兑换
- ✅ **调用**: `fundRelay.receiveAndForward()` - 转移 USDT

**为什么使用 FundRelay?**
- 避免在 swap 过程中触发 Pair → SYI 的转账逻辑
- 隔离 USDT 的接收和转移

---

### `_tryProcessAccumulatedFees()`

**文件**: `SYIBase.sol:1144-1164`
**权限**: 私有（`private`）
**状态修改**: ✅

**功能**:
**自动检查并处理累积费用**

1. **计算总费用**: `amountMarketingFee + amountLPFee`
2. **检查阈值**: 如果总费用 >= `swapAtAmount` 且不在 swap 中
3. **检查流动性**: 调用 `_canProcessFees()` 验证流动性充足
4. **处理费用**: 调用 `_processFeeDistribution()`
5. **触发事件**

**与其他合约的交互**:
- 通过 `_processFeeDistribution()` 间接调用

---

### `_processFeeDistribution()` ⭐

**文件**: `SYIBase.sol:1205-1248`
**权限**: 私有（`private`）
**状态修改**: ✅
**修饰符**: `lockSwap`

**功能**:
**处理累积费用的兑换和分发**

1. **读取累积费用**:
   - `totalMarketingFee` (来自卖出税 1.5%)
   - `totalLPFee` (来自卖出税 1.5%)

2. **清零累积**:
   - `amountMarketingFee = 0`
   - `amountLPFee = 0`

3. **处理营销费**:
   - 兑换 SYI → USDT
   - 转移 USDT → marketingAddress

4. **处理 LP 费**:
   - **直接存入 SYI 代币**到 LiquidityStaking
   - 调用 `liquidityStaking.depositSYIRewards(totalLPFee)`

5. **触发事件**

**与其他合约的交互**:
- ✅ **调用**: `_swapTokensForUSDT()` - 兑换营销费
- ✅ **调用**: `IERC20(USDT).transfer()` - 转移 USDT
- ✅ **调用**: `liquidityStaking.depositSYIRewards()` - 存入 SYI 奖励

**费用流向**:
```
累积的营销费（SYI）→ 兑换为 USDT → marketingAddress
累积的 LP 费（SYI）→ 直接存入 → LiquidityStaking (SYI)
```

---

### `_isBuyOperation(address from, address to)`

**文件**: `SYIBase.sol:686-699`
**权限**: 私有（`private view`）

**功能**:
**判断是否为买入操作**

条件（全部满足）:
- `from == Pair` - 从 Pair 转出
- `to != Pair` - 不是转入 Pair
- `to != Router` - 不是转入 Router
- `msg.sender == Pair` - 调用者是 Pair

---

### `_isSellOperation(address from, address to)`

**文件**: `SYIBase.sol:701-714`
**权限**: 私有（`private view`）

**功能**:
**判断是否为卖出操作**

条件（全部满足）:
- `to == Pair` - 转入 Pair
- `from != Pair` - 不是从 Pair 转出
- `from != Router` - 不是从 Router 转出
- `msg.sender != Pair` - 调用者不是 Pair

---

### `_canProcessFees()`

**文件**: `SYIBase.sol:1166-1203`
**权限**: 私有（`private view`）

**功能**:
**检查是否可以安全处理费用**

检查项:
1. 总费用 > 0
2. 合约余额 >= 总费用
3. Pair 储备量与实际余额一致（95% 阈值）
4. 兑换数量不超过 Pair 储备量的 2%

**目的**: 防止在流动性不足或储备量不同步时进行 swap

---

### `_estimateSwapOutput(uint256 xfAmount)`

**文件**: `SYIBase.sol:945-963`
**权限**: 私有（`private view`）

**功能**:
- 估算卖出指定数量 SYI 能换到的 USDT
- 使用 AMM 公式 `getAmountOut()`

---

### `_estimateBuyUSDTCost(uint256 xfAmount)`

**文件**: `SYIBase.sol:972-993`
**权限**: 私有（`private view`）

**功能**:
- 估算买入指定数量 SYI 需要花费的 USDT
- 考虑买入税费（3%）
- 使用 AMM 公式 `getAmountIn()`

---

### `_updateBuyInvestmentAndEmitEvent()`

**文件**: `SYIBase.sol:995-1042`
**权限**: 私有（`private`）

**功能**:
1. 估算买入成本（USDT）
2. 累加到 `userInvestment[to]`
3. 更新 `lastBuyTime[to]`
4. 触发事件

---

### `_updateInvestmentAfterSell()`

**文件**: `SYIBase.sol:1044-1061`
**权限**: 私有（`private`）

**功能**:
1. 从 `userInvestment[user]` 减去卖出收入
2. 如果成本不足，清零
3. 触发事件

---

### `_emitSellTransactionEvent()`

**文件**: `SYIBase.sol:1063-1117`
**权限**: 私有（`private`）

**功能**:
- 触发详细的卖出交易事件

---

### `_tryTriggerFundRelayDistribution()`

**文件**: `SYIBase.sol:1119-1132`
**权限**: 私有（`private`）

**功能**:
- 尝试从 FundRelay 转移 USDT 回合约
- 如果失败不影响主流程

---

### `_addLiquidity(uint256 tokenAmount, uint256 usdtAmount)`

**文件**: `SYIBase.sol:1250-1268`
**权限**: 私有（`private`）

**功能**:
- 添加流动性到 Pair
- LP 代币发送到 `DEAD_ADDRESS`（销毁）

**与其他合约的交互**:
- ✅ **调用**: `uniswapV2Router.addLiquidity()` - 添加流动性

---

## 事件说明

### 核心事件

#### `TransactionExecuted`
**触发位置**: 买入、卖出时
**参数**: 完整的交易信息（用户、时间、类型、数量、费用、利润等）

#### `FeesProcessed`
**触发位置**: 费用兑换和分发时
**参数**: 费用类型、数量、接收者等

#### `MarketingAddressUpdated`
**触发位置**: 更新营销地址时

#### `TokensBurned`
**触发位置**: 销毁代币时（买入税 1%）

#### `LPRewardDeposited`
**触发位置**: 存入 LP 奖励到 LiquidityStaking 时

#### `InvestmentUpdated`
**触发位置**: 更新用户投资成本时（买入、卖出）

---

## 合约交互流程图

### 买入流程

```
用户在 PancakeSwap 买入 SYI
         ↓
PancakeSwap Router 调用 SYI.transfer()
         ↓
SYI._update() 判断为买入操作
         ↓
SYI._handleBuy()
         ↓
    ┌────┴────┐
    ↓         ↓
销毁 1%    LP 奖励 2%
    ↓         ↓
DEAD    LiquidityStaking.depositSYIRewards()
         ↓
     净数量 97% → 用户
```

### 卖出流程

```
用户在 PancakeSwap 卖出 SYI
         ↓
PancakeSwap Router 调用 SYI.transferFrom()
         ↓
SYI._update() 判断为卖出操作
         ↓
SYI._handleSell()
         ↓
    ┌────┴────┬────────────┐
    ↓         ↓            ↓
营销费 1.5%  LP费 1.5%   利润税 25%
    ↓         ↓            ↓
  累积      累积      兑换为 USDT
                    ┌─────┴─────┐
                    ↓           ↓
                  40%         60%
                    ↓           ↓
            LiquidityStaking  nodeDividendAddress
              .depositRewards()
```

### 费用处理流程

```
累积费用达到阈值 (10000 SYI)
         ↓
SYI._tryProcessAccumulatedFees()
         ↓
SYI._processFeeDistribution()
         ↓
    ┌────┴────┐
    ↓         ↓
营销费    LP 费
    ↓         ↓
兑换 USDT   直接存入 SYI
    ↓         ↓
marketing  LiquidityStaking
  Address   .depositSYIRewards()
```

---

## 重要注意事项

### 1. 总供应量
⚠️ **实际铸造量为 10,000,000 SYI (1000万)**，而不是文档中提到的 1 亿

### 2. LP 奖励机制
- **买入税 2%**: 直接存入 **SYI 代币**到 LiquidityStaking
- **卖出税 1.5%**: 累积后直接存入 **SYI 代币**到 LiquidityStaking
- **利润税 40%**: 兑换为 **USDT** 后存入 LiquidityStaking

### 3. 白名单效果
白名单地址免除:
- ✅ 所有交易税（买入税、卖出税、利润税）
- ✅ 预售期限制
- ✅ 延迟购买限制
- ✅ 黑名单检查
- ✅ 冷却时间限制

### 4. 预售期效果
预售期内（默认 30 天）:
- ❌ **禁止所有非白名单地址买入 SYI**
- ✅ 允许卖出
- ✅ 允许普通转账

### 5. 利润税计算
利润税基于**估算 USDT 收入**和**用户历史成本**:
```
利润 = 本次卖出估算 USDT - userInvestment[seller]
利润税 = 利润 × 25%
```

### 6. FundRelay 的作用
- 在 swap 过程中接收 USDT
- 避免触发 Pair → SYI 的转账逻辑
- 隔离资金流动

### 7. 回收机制
Staking 合约可以从 Pair "回收" SYI:
- 每次最多回收 Pair 余额的 1/3
- 通过 `Pair.sync()` 调整储备量
- 不会直接影响价格

---

## 版本信息

- **Solidity 版本**: 0.8.20+
- **依赖库**:
  - OpenZeppelin Contracts 5.4.0
  - Uniswap V2 接口
- **合约地址** (BSC 主网):
  - SYI Token: `0x9e267C0a277e52180D2CCE40C11FcE61135dDdC6`
  - SYI-Staking: `0xc91Ee7aC88fBfe34ffb5E1b22E611d39DBC8704D`

---

**文档版本**: v1.0
**更新时间**: 2025-10-13
**状态**: SYI Token 已部署并测试通过
