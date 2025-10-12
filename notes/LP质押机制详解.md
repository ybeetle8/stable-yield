# LP 质押机制详解

## 📋 概述

OLA Staking 系统采用了一种创新的"质押即添加流动性"机制。用户质押 USDT 时，合约会自动将资金用于添加 OLA/USDT 流动性，从而在提供质押收益的同时支撑 OLA 代币的流动性。

**核心特点**:
- ✅ 质押 USDT → 自动添加流动性 → 获得质押收益
- ✅ LP Token 永久销毁，流动性被锁定
- ✅ 解除质押时自动移除流动性并退还 USDT
- ✅ 完善的滑点保护机制

**合约文件**: `othercode/OLA-Staking/src/abstract/StakingBase.sol:1183`

---

## 🔄 LP 质押完整流程

### 阶段一：用户质押 (添加流动性)

当用户调用 `stake(uint160 _amount, uint8 _stakeIndex)` 时，会触发以下流程：

#### 1. 资金流转路径

```
用户钱包 (1000 USDT)
    ↓ transferFrom
Staking 合约 (1000 USDT)
    ↓ 分成两部分
    ├─ 50% (500 USDT) → Swap → OLA (假设得到 5000 OLA)
    └─ 50% (500 USDT) + 5000 OLA → AddLiquidity → LP Token → address(0) (销毁)
```

#### 2. 关键代码解析 (StakingBase.sol:1183)

```solidity
function _swapAndAddLiquidity(uint160 usdtAmount) private {
    // 步骤 1: 从用户转入 USDT
    IERC20(USDT).transferFrom(msg.sender, address(this), usdtAmount);

    // 步骤 2: 准备兑换路径 USDT → OLA
    address[] memory swapPath = new address[](2);
    swapPath[0] = address(USDT);
    swapPath[1] = address(OLA);

    // 步骤 3: 计算要兑换的 USDT 数量 (50%)
    uint256 usdtToSwap = usdtAmount / LIQUIDITY_SPLIT_DIVISOR;  // DIVISOR = 2

    // 步骤 4: 记录 OLA 余额 (用于计算实际收到的 OLA)
    uint256 olaBalanceBefore = OLA.balanceOf(address(this));

    // 步骤 5: 计算最小输出 (滑点保护)
    uint256 minOlaTokensOut = _calculateMinimumOutput(usdtToSwap);

    // 步骤 6: 执行 Swap (支持税费代币)
    ROUTER.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        usdtToSwap,       // 输入: 500 USDT
        minOlaTokensOut,  // 最小输出: ~4250 OLA (考虑滑点和税费)
        swapPath,
        address(this),
        block.timestamp
    );

    // 步骤 7: 计算实际收到的 OLA (扣除了 3% 买入税)
    uint256 olaBalanceAfter = OLA.balanceOf(address(this));
    uint256 olaTokensReceived = olaBalanceAfter - olaBalanceBefore;

    // 步骤 8: 添加流动性
    uint256 remainingUsdt = usdtAmount - usdtToSwap;  // 剩余 500 USDT
    ROUTER.addLiquidity(
        address(USDT),
        address(OLA),
        remainingUsdt,        // 500 USDT
        olaTokensReceived,    // ~4850 OLA (扣税后)
        0,                    // 最小 USDT (0 = 无限制)
        0,                    // 最小 OLA (0 = 无限制)
        address(0),           // LP Token 接收者 = 销毁地址 ⚠️
        block.timestamp
    );
}
```

#### 3. 关键参数说明

| 参数 | 值 | 说明 |
|------|-----|------|
| `LIQUIDITY_SPLIT_DIVISOR` | 2 | 50% 用于 Swap，50% 保留 |
| `OLA_BUY_BURN_FEE_BPS` | 50 | OLA 买入 burn 税 0.5% |
| `OLA_BUY_LIQUIDITY_FEE_BPS` | 250 | OLA 买入 LP 税 2.5% |
| `OLA_TOTAL_BUY_FEE_BPS` | 300 | 总买入税 3% |
| LP Token 接收地址 | `address(0)` | **永久销毁** |

---

### 阶段二：滑点保护机制

#### 1. 动态滑点计算 (StakingBase.sol:1260)

```solidity
function _calculateMinimumOutput(uint256 usdtAmountIn)
    private view returns (uint256 minAmountOut)
{
    // 步骤 1: 获取流动性池储备
    address pair = OLA.getUniswapV2Pair();
    (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair).getReserves();

    // 确定 USDT 和 OLA 的储备量
    (uint112 reserveUSDT, uint112 reserveOLA) = ...

    // 步骤 2: 计算预期输出 (基于 AMM 公式)
    uint256 expectedOutput = ROUTER.getAmountOut(
        usdtAmountIn,
        reserveUSDT,
        reserveOLA
    );

    // 步骤 3: 计算价格影响
    uint256 priceImpact = (usdtAmountIn * 10000) / reserveUSDT;

    // 步骤 4: 动态调整滑点容忍度
    uint256 slippageTolerance;
    if (priceImpact <= PRICE_IMPACT_THRESHOLD) {  // <= 2%
        slippageTolerance = BASE_SLIPPAGE_TOLERANCE;  // 15%
    } else {
        // 价格影响大时增加滑点容忍度
        uint256 additionalSlippage = (priceImpact * BASE_SLIPPAGE_TOLERANCE)
                                      / PRICE_IMPACT_THRESHOLD;
        slippageTolerance = BASE_SLIPPAGE_TOLERANCE + additionalSlippage;

        // 上限 20%
        if (slippageTolerance > MAX_SLIPPAGE_TOLERANCE) {
            slippageTolerance = MAX_SLIPPAGE_TOLERANCE;  // 20%
        }
    }

    // 步骤 5: 扣除 OLA 买入税 (3%)
    uint256 expectedOutputAfterFees = (expectedOutput *
        (10000 - OLA_TOTAL_BUY_FEE_BPS)) / 10000;

    // 步骤 6: 应用滑点保护
    minAmountOut = (expectedOutputAfterFees *
        (10000 - slippageTolerance)) / 10000;
}
```

#### 2. 滑点参数配置

| 参数 | 值 | 说明 |
|------|-----|------|
| `BASE_SLIPPAGE_TOLERANCE` | 1500 (15%) | 基础滑点容忍度 |
| `MAX_SLIPPAGE_TOLERANCE` | 2000 (20%) | 最大滑点容忍度 |
| `PRICE_IMPACT_THRESHOLD` | 200 (2%) | 价格影响阈值 |
| `BASIS_POINTS_DENOMINATOR` | 10000 | 基点分母 (100%) |

#### 3. 滑点计算示例

**场景**: 用户质押 1000 USDT，当前流动性池 USDT 储备 = 100,000 USDT

```
步骤 1: 用户质押 1000 USDT
步骤 2: 分配 500 USDT 用于 Swap

步骤 3: 计算价格影响
priceImpact = (500 * 10000) / 100000 = 50 basis points (0.5%)

步骤 4: 判断滑点策略
0.5% <= 2% → 使用基础滑点 15%

步骤 5: 假设 Swap 预期输出 = 5000 OLA
扣除 3% 买入税: 5000 * (10000 - 300) / 10000 = 4850 OLA

步骤 6: 应用滑点保护
minAmountOut = 4850 * (10000 - 1500) / 10000 = 4122.5 OLA

步骤 7: Swap 执行
实际收到 >= 4122.5 OLA 才会成功
```

---

### 阶段三：解除质押 (移除流动性)

当用户调用 `unstake(uint256 stakeIndex)` 时，会触发以下流程：

#### 1. 资金流转路径

```
Staking 合约持有的 OLA
    ↓ Swap (精确输出模式)
获得 USDT (calculatedReward)
    ↓ 分配奖励
    ├─ 5% → 直推奖励
    ├─ 35% → 团队奖励 (最高)
    ├─ 1% → 赎回费用
    └─ 剩余 → 用户
```

#### 2. 关键代码解析 (StakingBase.sol:894)

```solidity
function _swapOLAForReward(uint256 calculatedReward)
    private returns (uint256 usdtReceived, uint256 olaTokensUsed)
{
    // 步骤 1: 记录余额
    uint256 olaBalanceBefore = OLA.balanceOf(address(this));
    uint256 usdtBalanceBefore = IERC20(USDT).balanceOf(address(this));

    // 步骤 2: 准备兑换路径 OLA → USDT
    address[] memory swapPath = new address[](2);
    swapPath[0] = address(OLA);
    swapPath[1] = address(USDT);

    // 步骤 3: 计算最大 OLA 输入 (风控保护)
    uint256 maxXFInput = _calculateMaxOLAInput(
        calculatedReward,    // 需要的 USDT 数量
        olaBalanceBefore     // 可用的 OLA 数量
    );

    // 步骤 4: 执行 Swap (精确输出模式)
    ROUTER.swapTokensForExactTokens(
        calculatedReward,  // 精确输出: 需要获得的 USDT
        maxXFInput,        // 最大输入: 允许消耗的 OLA
        swapPath,
        address(this),
        block.timestamp
    );

    // 步骤 5: 计算实际消耗
    uint256 olaBalanceAfter = OLA.balanceOf(address(this));
    usdtReceived = IERC20(USDT).balanceOf(address(this)) - usdtBalanceBefore;
    olaTokensUsed = olaBalanceBefore - olaBalanceAfter;
}
```

#### 3. 最大输入计算 (StakingBase.sol:924)

```solidity
function _calculateMaxOLAInput(
    uint256 usdtNeeded,
    uint256 availableXF
) private view returns (uint256 maxInput) {
    address pair = OLA.getUniswapV2Pair();
    (uint112 olaReserve, uint112 usdtReserve) = ...

    if (olaReserve > 0 && usdtReserve > 0) {
        // 限制 1: 最多请求池中 50% 的 USDT
        uint256 maxSafeUsdtRequest = usdtReserve / 2;
        uint256 safeUsdtNeeded = min(usdtNeeded, maxSafeUsdtRequest);

        if (safeUsdtNeeded < usdtReserve) {
            // 基于 AMM 公式估算需要的 OLA
            uint256 estimatedXF = (safeUsdtNeeded * olaReserve)
                                  / (usdtReserve - safeUsdtNeeded);

            // 添加 50% 滑点保护
            uint256 withSlippage = (estimatedXF * 150) / 100;

            maxInput = min(withSlippage, availableXF);
        } else {
            maxInput = availableXF / 4;
        }
    } else {
        maxInput = availableXF / 2;
    }

    // 限制 2: 最多使用可用 OLA 的 50%
    uint256 maxAllowedInput = availableXF / 2;
    if (maxInput > maxAllowedInput) {
        maxInput = maxAllowedInput;
    }
}
```

---

## 🎯 LP 质押的关键特性

### 1. LP Token 永久销毁

**代码位置**: `StakingBase.sol:1214`

```solidity
ROUTER.addLiquidity(
    address(USDT),
    address(OLA),
    remainingUsdt,
    olaTokensReceived,
    0,
    0,
    address(0),  // ⚠️ LP Token 发送到 address(0) 销毁
    block.timestamp
);
```

**影响**:
- ✅ 流动性被**永久锁定**在池中
- ✅ 无法通过 LP Token 移除流动性
- ✅ 增强 OLA 代币的价格稳定性
- ⚠️ 合约必须持有足够 OLA 用于解除质押

### 2. 精确输出模式

**代码位置**: `StakingBase.sol:909`

```solidity
ROUTER.swapTokensForExactTokens(
    calculatedReward,  // 精确输出: 用户应得的 USDT
    maxXFInput,        // 最大输入: 允许消耗的 OLA
    swapPath,
    address(this),
    block.timestamp
);
```

**优势**:
- ✅ 保证用户获得准确的收益金额
- ✅ 避免因市场波动导致收益不足
- ✅ 自动调整 OLA 消耗量

### 3. 多重风控机制

#### 风控 1: 动态质押限额 (StakingBase.sol:339)

```solidity
function maxStakeAmount() returns (uint256) {
    // 最近 1 分钟的质押增量
    uint256 recentInflow = ...;

    // 流动性池 USDT 储备
    uint256 poolReserveUsdt = OLA.getUSDTReserve();

    // 1% 的池子储备
    uint256 onePercentOfPool = poolReserveUsdt / 100;

    if (recentInflow > onePercentOfPool) {
        return 0;  // 暂停质押
    } else {
        uint256 availableCapacity = onePercentOfPool - recentInflow;
        return min(availableCapacity, MAX_STAKE_LIMIT);  // 最高 1000 USDT
    }
}
```

#### 风控 2: 单笔和总额度限制

```solidity
MAX_STAKE_LIMIT = 1000 ether        // 单笔最高 1000 USDT
MAX_USER_TOTAL_STAKE = 10000 ether  // 用户总额度 10,000 USDT
```

#### 风控 3: EOA 检查

```solidity
modifier onlyEOA() {
    if (shouldCheckEOA() && tx.origin != msg.sender)
        revert OnlyEOAAllowed();
    _;
}
```

**用途**: 防止合约调用（闪电贷攻击、套利机器人等）

---

## 💰 收益分配示例

假设用户质押 **1000 USDT**，30 天后解除质押，计算收益为 **1563.1 USDT**。

### 步骤 1: 质押阶段

```
用户质押: 1000 USDT
    ↓
合约执行:
├─ 500 USDT → Swap → 4850 OLA (扣除 3% 税费)
└─ 500 USDT + 4850 OLA → AddLiquidity → LP Token (销毁)

结果:
- LP Token 被销毁
- 流动性池增加: 500 USDT + 4850 OLA
- 用户获得 sOLA 代币 (质押凭证)
```

### 步骤 2: 30 天后解除质押

```
计算收益: 1563.1 USDT (本金 1000 + 利息 563.1)

合约持有 OLA → Swap → 1563.1 USDT
消耗 OLA: ~15,000 OLA (取决于价格)

分配奖励:
├─ 直推奖励 (5%):  563.1 * 5% = 28.16 USDT
├─ 团队奖励 (35%): 563.1 * 35% = 197.09 USDT (最高)
├─ 赎回费用 (1%):  1563.1 * 1% = 15.63 USDT
└─ 用户到账:       1563.1 - 28.16 - 197.09 - 15.63 = 1322.22 USDT

利息收益: 563.1 USDT
实际到账: 1322.22 USDT (本金 1000 + 净收益 322.22)
```

### 步骤 3: 奖励分配详情

```
直推奖励 (28.16 USDT):
→ 发送给用户绑定的好友 (或根地址)

团队奖励 (197.09 USDT):
假设推荐链: User → A(V2) → B(V5) → C(V1)

分配逻辑 (差额奖励):
1. B (V5, 25%): 197.09 * 25% = 49.27 USDT
2. A (V2, 10%): 197.09 * (10% - 0%) = 19.71 USDT
3. C (V1, 5%):  不分配 (V1 < V2)
4. 营销地址:    197.09 - 49.27 - 19.71 = 128.11 USDT

赎回费用 (15.63 USDT):
→ 发送给 feeRecipient 地址
```

---

## 🔍 关键事件追踪

### 1. 质押事件

```solidity
event Staked(
    address indexed user,
    uint256 amount,           // 1000 USDT
    uint256 timestamp,
    uint256 index,            // 质押索引
    uint256 stakeTime         // 锁定期 (30天)
);
```

### 2. 提现事件

```solidity
event WithdrawalCompleted(
    address indexed user,
    uint256 indexed stakeIndex,
    uint256 principalAmount,     // 1000 USDT
    uint256 calculatedReward,    // 1563.1 USDT
    uint256 usdtReceived,        // 1563.1 USDT
    uint256 olaTokensUsed,       // ~15,000 OLA
    uint256 referralFee,         // 28.16 USDT
    uint256 teamFee,             // 197.09 USDT
    uint256 userPayout,          // 1322.22 USDT
    uint256 interestEarned,      // 563.1 USDT
    uint40 withdrawalTime
);
```

### 3. 赎回费用事件

```solidity
event RedemptionFeeCollected(
    address indexed user,
    uint256 stakeIndex,
    uint256 olaAmount,           // 消耗的 OLA 数量
    uint256 usdtAmount,          // 15.63 USDT
    address indexed feeRecipient,
    uint256 timestamp
);
```

---

## ⚠️ 重要注意事项

### 用户须知

1. **流动性永久锁定**
   - LP Token 被销毁，无法取回
   - 解除质押依赖合约持有的 OLA 余额
   - 系统必须确保 OLA 充足

2. **滑点风险**
   - 基础滑点: 15%
   - 最大滑点: 20%
   - 大额质押可能触发高滑点

3. **税费成本**
   - OLA 买入税: 3% (burn 0.5% + LP 2.5%)
   - 赎回费用: 1%
   - 奖励分成: 最高 40% (直推 5% + 团队 35%)

4. **市场风险**
   - OLA 价格波动影响解除质押成本
   - 流动性不足可能导致交易失败
   - 需预留足够 OLA 用于解除质押

### 开发者须知

1. **部署依赖**
   - 必须先部署 USDT、OLA、Router
   - 必须创建 OLA/USDT 交易对
   - 必须添加初始流动性

2. **合约配置**
   ```solidity
   // 必须在部署后配置
   staking.setOLA(ola_address);
   usdt.approve(router, type(uint256).max);
   ola.approve(router, type(uint256).max);
   ```

3. **紧急功能**
   ```solidity
   // OLA 余额不足时可紧急提取
   function emergencyWithdrawOLA(address to, uint256 _amount) external onlyOwner;
   function emergencyWithdrawUSDT(address to, uint256 _amount) external onlyOwner;
   ```

---

## 📊 数据流图

### 完整质押-解除流程

```
┌─────────────────────────────────────────────────────────────┐
│                     用户质押 1000 USDT                        │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   500 USDT                  500 USDT
        │                         │
        ↓                         ↓
   Swap → OLA            保留用于添加流动性
   (~4850 OLA)                    │
        │                         │
        └────────────┬────────────┘
                     │
                     ↓
        AddLiquidity (OLA/USDT)
        500 USDT + 4850 OLA
                     │
                     ↓
        LP Token → address(0) (销毁)
        流动性永久锁定
                     │
                     ↓
        铸造 sOLA 代币 (质押凭证)


        [ 等待 30 天 ]


                     │
                     ↓
           用户调用 unstake()
                     │
        ┌────────────┴────────────┐
        │                         │
   计算复利收益              合约持有 OLA
   1563.1 USDT              (~50,000 OLA)
        │                         │
        │                         ↓
        │              Swap (精确输出)
        │              OLA → 1563.1 USDT
        │              消耗 ~15,000 OLA
        │                         │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┬──────────┬──────────┐
        │                         │          │          │
  直推奖励 5%              团队奖励 35%   赎回费 1%   用户
  28.16 USDT              197.09 USDT   15.63    1322.22
        │                         │          │          │
        ↓                         ↓          ↓          ↓
   好友地址              V1-V7 推荐人   费用地址   用户钱包
```

---

## 📚 参考资源

- **合约源码**: `othercode/OLA-Staking/src/abstract/StakingBase.sol`
- **BSC 主网**: https://bscscan.com/address/0x39f403ca78c08317a03401acff4113d992b3c071
- **官方网站**: https://olafi.xyz
- **完整功能说明**: `notes/OLA-Staking功能说明.md`

---

**文档生成时间**: 2025-10-11
**文档作者**: Claude Code
**文档版本**: v1.0
