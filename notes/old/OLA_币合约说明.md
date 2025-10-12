# OLA DeFi 生态系统功能说明

## 项目概述

OLA 是一个完整的 DeFi 生态系统，包含代币、质押、交易所流动性管理等核心功能。系统基于 Uniswap V2 架构，采用抽象基类设计模式，支持主网和测试网环境切换。

**参考项目**: https://olafi.xyz/#/index

---

## 一、OLA 代币系统

### 1.1 核心架构

```
contracts/abstract/OLABase.sol (1472行) - 核心业务逻辑
contracts/mainnet/OLA.sol (35行) - 主网环境配置
contracts/utils/FundRelay.sol - 资金中继合约
contracts/utils/Helper.sol - AMM 计算工具库
```

**设计模式**: 抽象基类模式，将核心逻辑与环境参数分离，便于多环境部署和测试。

### 1.2 税费机制

OLA 实现了完整的 DeFi 税费体系，支持多种交易场景：

#### 1.2.1 买入税费 (总计 3%)
- **Burn 费用**: 1% (100 bps) - 直接销毁至 `0x...dEaD` 地址
- **LP 奖励**: 2% (200 bps) - 直接存入 LiquidityStaking 合约作为 BLA 代币奖励

**实现位置**: `OLABase.sol:_handleBuy()` (716-764行)

```solidity
// 买入时税费计算
uint256 burnFee = (amount * 1%) / 100%;      // 销毁
uint256 liquidityFee = (amount * 2%) / 100%; // LP奖励
```

#### 1.2.2 卖出税费 (总计 3%)
- **Marketing 费用**: 1.5% (150 bps) - 累积后批量处理
- **LP 累积费用**: 1.5% (150 bps) - 累积后存入 LiquidityStaking

**实现位置**: `OLABase.sol:_handleSell()` (766-871行)

```solidity
// 卖出时税费计算
uint256 marketingFee = (amount * 1.5%) / 100%;      // 营销
uint256 liquidityAccumFee = (amount * 1.5%) / 100%; // LP累积
```

#### 1.2.3 利润税 (25%)
这是 OLA 的**创新机制**，对超过初始购买成本的卖出征收利润税：

- **触发条件**: 卖出金额 (USDT) > 用户历史购买成本
- **税率**: 25% (2500 bps)
- **分配方式**:
  - 40% (10/25) → LiquidityStaking 奖励池
  - 60% (15/25) → Node Dividend 地址（或 Marketing）

**实现位置**: `OLABase.sol:_handleSell()` (794-851行)

```solidity
// 利润税计算示例
// 用户历史购买成本: 1000 USDT
// 卖出获得: 1500 USDT
// 利润: 500 USDT
// 利润税: 500 * 25% = 125 USDT
//   - LiquidityStaking: 50 USDT (40%)
//   - Node/Marketing: 75 USDT (60%)
```

#### 1.2.4 流动性操作费 (2.5%)
添加或移除流动性时，向 Marketing 地址收取 2.5% 手续费。

**实现位置**: `OLABase.sol:_handleLiquidityOperation()` (663-684行)

### 1.3 成本追踪系统

OLA 为每个地址维护**历史购买成本**，用于计算利润税：

**状态变量**:
```solidity
mapping(address => uint256) public userInvestment;  // 用户累积购买成本 (USDT)
mapping(address => uint256) public lastBuyTime;     // 最后购买时间
```

**更新逻辑**:
- **买入**: `userInvestment += estimatedUSDTCost` (估算消耗的 USDT)
- **卖出**: `userInvestment -= actualUSDTReceived` (减去获得的 USDT)
- **卖出后归零**: 如果 `actualUSDTReceived >= userInvestment`，则 `userInvestment = 0`

**实现位置**:
- `OLABase.sol:_updateBuyInvestmentAndEmitEvent()` (995-1042行)
- `OLABase.sol:_updateInvestmentAfterSell()` (1044-1061行)

### 1.4 预售期管理

**预售期配置**:
- **主网**: 30 天 (`OLA.sol:getPresaleDuration()`)
- **功能**: 预售期内禁止通过 DEX 买入 OLA（仅允许白名单）

**实现位置**: `OLABase.sol:_handleBuy()` (721-726行)

```solidity
if (presaleActive && block.timestamp < presaleStartTime + presaleDuration) {
    revert NotAllowedBuy();
}
```

**控制函数**:
- `setPresaleActive(bool)`: 启动/关闭预售期
- `setPresaleDuration()`: 同步 Staking 合约的预售期设置

### 1.5 延迟购买机制

防止机器人抢跑的保护机制：

**配置**:
- **延迟期**: 30 天 (`OLA.sol:getDelayedBuyPeriod()`)
- **触发条件**: `delayedBuyEnabled = true` 且非白名单用户

**实现位置**: `OLABase.sol:delayedBuyCheck` modifier (268-279行)

```solidity
// 计算延迟时间
uint256 baseTime = delayedBuyEnabledTime > 0 ? delayedBuyEnabledTime : contractDeployTime;
if (block.timestamp < baseTime + 30 days) {
    revert DelayedBuyPeriodNotMet();
}
```

### 1.6 费用处理和批量 Swap

为降低 gas 成本，OLA 累积税费并批量处理：

**累积变量**:
```solidity
uint256 public amountMarketingFee;  // 累积的 marketing 费用
uint256 public amountLPFee;         // 累积的 LP 费用
uint256 public swapAtAmount;        // 触发阈值 (默认 10000 OLA)
```

**触发条件**:
- 累积费用 >= `swapAtAmount`
- 流动性池健康（储备量 >= 95%，swap 量 <= 池子 2%）

**处理流程**:
1. Marketing 费用 → swap 为 USDT → 转给 marketing 地址
2. LP 费用 → 直接存入 LiquidityStaking 作为 BLA 奖励

**实现位置**:
- `OLABase.sol:_tryProcessAccumulatedFees()` (1144-1164行)
- `OLABase.sol:_processFeeDistribution()` (1205-1248行)

### 1.7 冷却时间保护

防止 MEV 和三明治攻击：

**配置**:
```solidity
uint256 public coldTime = 10 seconds;  // 买入后 10 秒内不能卖出
```

**实现位置**: `OLABase.sol:_handleSell()` (771-772行)

```solidity
if (block.timestamp < lastBuyTime[from] + coldTime) revert InColdPeriod();
```

### 1.8 黑白名单系统

**白名单 (feeWhitelisted)**:
- 免除所有税费
- 不受预售期限制
- 不受延迟购买限制
- 默认白名单: Owner、合约自身、Staking、Marketing、Router

**黑名单 (blacklisted)**:
- 完全禁止买卖

**管理函数**:
- `setFeeWhitelisted(address, bool)`
- `setBatchFeeWhitelisted(address[], bool)`
- `setBlacklisted(address, bool)`
- `setBatchBlacklisted(address[], bool)`

### 1.9 FundRelay 资金中继

**问题**: Uniswap Router 直接 swap 到 OLA 合约可能导致 `INVALID_TO` 错误

**解决方案**: FundRelay 作为中间人接收 USDT，再转发给 OLA 合约

**工作流程**:
```
OLA.swap() → Router.swap(to=FundRelay) → FundRelay接收USDT
         ↓
FundRelay.receiveAndForward() → 转账USDT到OLA合约
```

**合约位置**: `contracts/utils/FundRelay.sol` (195行)

**关键函数**:
- `receiveAndForward()`: 接收并立即转发 USDT
- `withdrawToOLA(uint256)`: OLA 合约主动提取 USDT
- `emergencyWithdraw()`: 紧急提取（仅 owner）

### 1.10 Recycle 回收机制

Staking 合约可以从流动性池中回收部分 OLA 代币：

**限制**: 最多回收池子余额的 1/3

**实现位置**: `OLABase.sol:recycle()` (435-448行)

```solidity
function recycle(uint256 amount) external {
    require(msg.sender == address(staking), "Only staking contract");

    uint256 pairBalance = balanceOf(address(uniswapV2Pair));
    uint256 maxRecyclable = pairBalance / 3;
    uint256 recycleAmount = amount >= maxRecyclable ? maxRecyclable : amount;

    if (recycleAmount > 0) {
        _update(address(uniswapV2Pair), address(staking), recycleAmount);
        uniswapV2Pair.sync();
    }
}
```

---

## 二、Staking 质押系统

### 2.1 核心架构

```
contracts/abstract/StakingBase.sol (1393行) - 核心业务逻辑
contracts/mainnet/Staking.sol (98行) - 主网环境配置
```

**代币**: sOLA (Staked OLA) - 不可转账的权益代币

### 2.2 质押档位和 APY

| 档位 | 锁定期 | 年化收益 (APY) | 日复利率 |
|------|--------|---------------|----------|
| 0    | 1天    | 0.3%          | 1.002999... |
| 1    | 7天    | 4.28%         | 1.006005... |
| 2    | 15天   | 16.1%         | 1.010001... |
| 3    | 30天   | 56.31%        | 1.015000... |

**配置位置**: `Staking.sol:getAPYRate*()` (27-41行)

### 2.3 质押流程

#### 2.3.1 质押 (stake)

**输入参数**:
- `_amount`: USDT 数量 (uint160)
- `_stakeIndex`: 档位索引 (0-3)

**处理流程**:
1. **验证**:
   - 单笔最大值: `maxStakeAmount()` (池子 1% 或 1000 USDT)
   - 用户总限额: 10,000 USDT
   - 网络流入限制: 1 分钟内总质押不超过池子 1%

2. **Swap 和添加流动性**:
   ```
   USDT (100%) → 分为两部分:
     - 50% USDT → Swap → OLA
     - 50% USDT + OLA → 添加流动性到 OLA/USDT 池
   ```

3. **铸造 sOLA**:
   - 铸造等量的 sOLA 代币给用户
   - 记录质押信息（时间、金额、档位）

4. **更新团队业绩**:
   - 将质押金额累加到推荐链所有上级的 `teamTotalInvestValue`

**实现位置**: `StakingBase.sol:stake()` (193-198行)

#### 2.3.2 解除质押 (unstake)

**输入参数**:
- `stakeIndex`: 质押记录索引

**处理流程**:
1. **验证**: 必须满足锁定期要求

2. **计算收益**:
   ```solidity
   // 复利公式
   reward = principal * (1 + rate)^periods
   ```
   - `principal`: 质押本金
   - `rate`: 日复利率
   - `periods`: 质押天数

3. **Swap OLA 为 USDT**:
   - 使用 `swapTokensForExactTokens` 精确获得 `reward` USDT
   - 动态计算最大 OLA 输入量（含 50% 滑点保护）

4. **分配收益**:
   ```
   总收益 (USDT) = 本金 + 利息
     ├─ 好友奖励: 利息 * 5% → 好友地址
     ├─ 团队奖励: 利息 * 35% (最多) → 推荐链分配
     ├─ 赎回费: 用户收益 * 1% → feeRecipient
     └─ 用户收益: 剩余部分 → 用户
   ```

5. **销毁 sOLA**:
   - 销毁对应数量的 sOLA

6. **回收 OLA**:
   - 调用 `OLA.recycle()` 将使用的 OLA 从池子回收

**实现位置**: `StakingBase.sol:unstake()` (200-264行)

### 2.4 复利计算

**公式**:
```
currentReward = principal * (1 + dailyRate)^days
```

**实现**:
- 使用 `@prb/math` 库的 `UD60x18` 高精度浮点数
- 日复利（每 24 小时复利一次）

**实现位置**: `StakingBase.sol:_calculateStakeReward()` (1139-1168行)

```solidity
UD60x18 principalAmount = ud(stakeRecord.amount);
uint40 stakingDuration = uint40(block.timestamp) - stakeStartTime;

// 转换为天数
uint256 compoundPeriods = stakingDuration / 1 days;

UD60x18 compoundedAmount = principalAmount.mul(
    baseInterestRate.powu(compoundPeriods)
);
```

### 2.5 推荐系统

#### 2.5.1 推荐人绑定

**函数**: `lockReferral(address _referrer)`

**规则**:
1. 每个地址只能绑定一次（永久且不可更改）
2. 推荐人必须持有至少 1 OLA（rootAddress 除外）
3. 不能推荐自己
4. 如果传入 `address(0)`，自动绑定到 rootAddress

**绑定后处理**:
- 将用户添加到推荐人的 `_children` 列表
- 如果用户已有质押金额，同步到推荐链的团队业绩

**实现位置**: `StakingBase.sol:lockReferral()` (266-295行)

#### 2.5.2 好友奖励 (5%)

**机制**: 用户可以额外绑定一个"好友"地址

**奖励**: 解质押时，利息收益的 5% 发送给好友地址

**函数**: `lockFriend(address _friend)`

**实现位置**:
- `StakingBase.sol:lockFriend()` (301-311行)
- `StakingBase.sol:_distributeFriendReward()` (971-984行)

### 2.6 团队奖励系统

#### 2.6.1 层级和阈值

OLA 采用**差异化团队奖励**机制，共 7 个层级：

| 层级 | 名称 | 团队业绩阈值 (USDT) | 奖励比例 | 差异奖励 |
|------|------|-------------------|---------|---------|
| V1   | 一级 | 10,000            | 5%      | 5%      |
| V2   | 二级 | 50,000            | 10%     | 5%      |
| V3   | 三级 | 200,000           | 15%     | 5%      |
| V4   | 四级 | 500,000           | 20%     | 5%      |
| V5   | 五级 | 1,000,000         | 25%     | 5%      |
| V6   | 六级 | 2,500,000         | 30%     | 5%      |
| V7   | 七级 | 5,000,000         | 35%     | 5%      |

**配置位置**: `Staking.sol:getTeamThresholdTier*()` (61-87行)

#### 2.6.2 差异化奖励分配

**核心逻辑**: 每个层级只获得与上一层级的**差额奖励**，避免重复分配

**示例**:
```
用户 A 解质押，利息收益 1000 USDT
推荐链: A → B (V2) → C (V5) → D (V1) → ...

分配过程:
1. 遍历推荐链，找到最高层级 V5 (C)
   - C 获得: 1000 * (25% - 0%) = 250 USDT
   - 已分配层级: V5 (25%)

2. 继续遍历，找到 V2 (B)
   - 但 V2 < V5，不分配（防止重复）

3. 继续遍历，找到 V1 (D)
   - 但 V1 < V5，不分配

总分配: 250 USDT
剩余: 1000 * 35% - 250 = 100 USDT → 转给 rootAddress
```

**实现位置**: `StakingBase.sol:_distributeHybridRewards()` (1052-1137行)

#### 2.6.3 Preacher 资格

**定义**: 持有至少 200 sOLA (currentStakeValue >= 200 ether) 的用户

**作用**: 只有 Preacher 才能获得团队奖励

**检查位置**: `StakingBase.sol:isPreacher()` (641-643行)

```solidity
function isPreacher(address user) public view override returns (bool) {
    return currentStakeValue(user) >= 200 ether;
}
```

### 2.7 网络流入控制

**目的**: 防止大额质押冲击流动性池

**限制规则**:
1. **单笔限额**: 最大 1000 USDT
2. **动态限额**: `min(池子 USDT 储备的 1%, 1000 USDT)`
3. **网络流入限制**: 1 分钟内总质押不超过池子 1%

**计算公式**:
```solidity
uint256 recentInflow = getRecentNetworkInflow();  // 1分钟内总质押
uint112 poolReserveUsdt = OLA.getUSDTReserve();
uint256 onePercentOfPool = poolReserveUsdt / 100;

if (recentInflow > onePercentOfPool) {
    maxStakeAmount = 0;  // 暂停质押
} else {
    uint256 availableCapacity = onePercentOfPool - recentInflow;
    maxStakeAmount = min(availableCapacity, 1000 ether);
}
```

**实现位置**: `StakingBase.sol:maxStakeAmount()` (717-728行)

### 2.8 用户总限额

每个用户最多质押 **10,000 USDT**（所有档位总和）

**检查位置**: `StakingBase.sol:_validateStakeParameters()` (1177-1179行)

### 2.9 赎回费 (1%)

**机制**: 解质押时收取用户收益的 1% 作为赎回费

**接收者**: `feeRecipient` 地址

**实现位置**: `StakingBase.sol:unstake()` (224-242行)

```solidity
uint256 expectedRedemptionFeeUSDT = (userPayout * 100) / 10000;  // 1%

if (expectedRedemptionFeeUSDT > 0 && feeRecipient != address(0)) {
    // 将 1% 的 OLA swap 为 USDT，发送给 feeRecipient
    (, uint256 redemptionFeeOLAUsed) = _swapOLAForReward(expectedRedemptionFeeUSDT);

    emit RedemptionFeeCollected(...);
}
```

### 2.10 sOLA 代币

**特性**:
- **名称**: Staked OLA
- **符号**: sOLA
- **小数位**: 18
- **不可转账**: `transfer()` 和 `transferFrom()` 均 revert
- **不可授权**: `approve()` revert，`allowance()` 始终返回 0

**用途**:
- 记录用户的质押份额
- 计算 Preacher 资格
- 查询用户当前总质押价值（含收益）

**实现位置**: `StakingBase.sol` (734-752行)

### 2.11 滑点保护

**Swap 滑点配置**:
- **基础滑点**: 15% (1500 bps)
- **最大滑点**: 20% (2000 bps)
- **价格影响阈值**: 2% (200 bps)

**动态滑点计算**:
```solidity
uint256 priceImpact = (usdtAmountIn * 10000) / reserveUSDT;

if (priceImpact <= 200) {  // <= 2%
    slippage = 1500;  // 15%
} else {
    uint256 additionalSlippage = (priceImpact * 1500) / 200;
    slippage = 1500 + additionalSlippage;
    slippage = min(slippage, 2000);  // 不超过 20%
}
```

**实现位置**: `StakingBase.sol:_calculateMinimumOutput()` (1260-1313行)

---

## 三、合约交互流程

### 3.1 质押完整流程

```
用户 (USDT)
    ↓ approve
Staking.stake(100 USDT, index=3)
    ↓ transferFrom 100 USDT
    ├─ 50 USDT → Router.swap → OLA (约 X OLA)
    └─ 50 USDT + X OLA → Router.addLiquidity → LP Token (销毁到 0x0)
    ↓
Staking._mintStakeRecord
    ├─ 铸造 100 sOLA → 用户
    ├─ 记录质押信息 (时间, 金额, 档位)
    └─ 更新推荐链团队业绩
```

### 3.2 解质押完整流程

```
用户
    ↓
Staking.unstake(stakeIndex)
    ↓
1. _burn → 计算收益 (复利公式)
    ├─ 假设本金 100 USDT, 30天后收益 156.31 USDT
    └─ 利息 = 156.31 - 100 = 56.31 USDT

2. _swapOLAForReward(156.31 USDT)
    ├─ Router.swapTokensForExactTokens
    ├─ Staking 持有的 OLA → Swap → 精确获得 156.31 USDT
    └─ 记录使用的 OLA 数量 (如 200 OLA)

3. 分配收益 (基于利息 56.31 USDT):
    ├─ 好友奖励: 56.31 * 5% = 2.82 USDT → 好友地址
    ├─ 团队奖励: 56.31 * 35% = 19.71 USDT
    │   └─ 差异化分配给推荐链 (V1-V7)
    ├─ 赎回费: (156.31 - 2.82 - 19.71) * 1% = 1.34 USDT → feeRecipient
    └─ 用户收益: 156.31 - 2.82 - 19.71 - 1.34 = 132.44 USDT

4. 转账 132.44 USDT → 用户

5. OLA.recycle(200 OLA) → 从 OLA/USDT 池回收 OLA

6. 销毁 100 sOLA
```

### 3.3 买入 OLA 流程 (DEX)

```
用户 (USDT)
    ↓
Router.swapExactTokensForTokens
    ↓ USDT → OLA/USDT Pair
OLA/USDT Pair
    ↓ transfer OLA → 用户 (触发 _update)
OLA._update (from=Pair, to=用户)
    ↓ _handleBuy
    ├─ 检查: 不在预售期，满足延迟购买，不在黑名单
    ├─ 计算税费:
    │   ├─ Burn: 原始数量 * 1% → 销毁
    │   └─ LP奖励: 原始数量 * 2% → LiquidityStaking
    ├─ 净额: 原始数量 * 97% → 用户
    └─ 更新成本追踪: userInvestment += 估算USDT成本
```

### 3.4 卖出 OLA 流程 (DEX)

```
用户 (OLA)
    ↓
Router.swapExactTokensForTokens
    ↓ transfer OLA → OLA/USDT Pair
OLA._update (from=用户, to=Pair)
    ↓ _handleSell
    ├─ 检查: 冷却时间已过，不在黑名单
    ├─ 计算税费 (基于原始 OLA 数量):
    │   ├─ Marketing: 1.5% → 累积
    │   └─ LP累积: 1.5% → 累积
    ├─ 计算利润税 (如果卖出金额 > 用户成本):
    │   ├─ 利润: 卖出获得 - 用户历史成本
    │   ├─ 利润税: 利润 * 25%
    │   │   ├─ Swap 为 USDT
    │   │   ├─ 40% → LiquidityStaking
    │   │   └─ 60% → Node/Marketing
    │   └─ 从 OLA 中扣除利润税对应的代币
    ├─ 净额: 原始数量 - 税费 - 利润税 → Pair
    ├─ 更新成本追踪: userInvestment -= 实际获得USDT
    └─ 触发批量 swap (如果累积费用 >= swapAtAmount):
        ├─ Marketing费用 → Swap → USDT → Marketing地址
        └─ LP费用 → 存入 LiquidityStaking (BLA代币)
```

---

## 四、关键参数配置

### 4.1 OLA 代币参数

| 参数 | 值 | 说明 |
|------|---|------|
| 名称 | OLA Token | ERC20 代币名称 |
| 符号 | OLA | ERC20 代币符号 |
| 总量 | 10,000,000 OLA | 初始铸造给 owner |
| 小数位 | 18 | ERC20 标准 |
| 买入税 | 3% | 1% burn + 2% LP |
| 卖出税 | 3% | 1.5% marketing + 1.5% LP |
| 利润税 | 25% | 仅对利润部分征收 |
| LP操作费 | 2.5% | 添加/移除流动性 |
| 预售期 | 30天 | 主网配置 |
| 延迟购买 | 30天 | 主网配置 |
| 冷却时间 | 10秒 | 买入后 10 秒才能卖出 |
| Swap阈值 | 10000 OLA | 触发批量处理 |

### 4.2 Staking 参数

| 参数 | 值 | 说明 |
|------|---|------|
| sOLA名称 | Staked OLA | 质押凭证代币 |
| sOLA符号 | sOLA | 质押凭证符号 |
| 单笔限额 | 1000 USDT | 最大单笔质押 |
| 用户总限额 | 10000 USDT | 用户所有质押总和 |
| 网络流入限制 | 池子1% / 分钟 | 防止冲击 |
| Preacher阈值 | 200 sOLA | 团队奖励资格 |
| 好友奖励 | 5% | 基于利息 |
| 团队奖励上限 | 35% | V7 最高 |
| 赎回费 | 1% | 基于用户收益 |
| 复利周期 | 1天 | 主网日复利 |

### 4.3 团队层级参数

| 层级 | 团队业绩 | 奖励比例 | 差异奖励 |
|------|---------|---------|---------|
| V1 | 10,000 USDT | 5% | 5% |
| V2 | 50,000 USDT | 10% | 5% |
| V3 | 200,000 USDT | 15% | 5% |
| V4 | 500,000 USDT | 20% | 5% |
| V5 | 1,000,000 USDT | 25% | 5% |
| V6 | 2,500,000 USDT | 30% | 5% |
| V7 | 5,000,000 USDT | 35% | 5% |

---

## 五、安全机制

### 5.1 重入保护

- **lockSwap** modifier: 防止 swap 过程中重入
- `_inSwap`, `_inRouterSwap`, `_inLiquidityOperation`: 多重锁

### 5.2 滑点保护

- 动态滑点计算（15%-20%）
- 最大 OLA 输入限制（防止过度消耗）

### 5.3 流动性池健康检查

批量 swap 前检查:
- 池子储备 >= 账面储备的 95%
- Swap 量 <= 池子余额的 2%

### 5.4 黑名单和白名单

- 黑名单: 完全禁止交易
- 白名单: 免除税费和限制

### 5.5 紧急功能

- `emergencyWithdrawOLA()`: 提取 OLA
- `emergencyWithdrawUSDT()`: 提取 USDT
- `emergencyWithdraw()`: FundRelay 紧急提取
- `recoverStuckTokens()`: 回收卡住的代币

### 5.6 EOA 检查

主网启用 `shouldCheckEOA()`，仅允许 EOA 地址调用 `stake` 和 `unstake`，防止合约攻击。

---

## 六、事件系统

### 6.1 OLA 核心事件

- **TransactionExecuted**: 完整的交易信息（买入/卖出）
- **FeesProcessed**: 费用处理详情
- **SellTransaction**: 卖出交易详细分解
- **InvestmentUpdated**: 成本追踪更新
- **TokensBurned**: 代币销毁
- **LPRewardDeposited**: LP 奖励存入

### 6.2 Staking 核心事件

- **Staked**: 质押成功
- **RewardPaid**: 奖励支付
- **WithdrawalCompleted**: 解质押完成
- **BindReferral**: 推荐人绑定
- **BindFriend**: 好友绑定
- **TeamRewardDistributionCompleted**: 团队奖励分配完成
- **StrictDifferentialRewardPaid**: 差异化奖励支付
- **RedemptionFeeCollected**: 赎回费收取

---

## 七、合约地址参考

**主网合约 (BSC)**:
- **OLA Token**: `0xfc548e35c4a3603b09204acead0cd16908423eea`
- **Staked OLA**: `0x39f403ca78c08317a03401acff4113d992b3c071`
- **区块链浏览器**: https://bscscan.com

---

## 八、技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| Solidity | 0.8.20 | 智能合约语言 |
| OpenZeppelin | ^5.0.0 | ERC20、Ownable 等基础库 |
| PRB Math | ^4.0.0 | 高精度数学运算（复利） |
| Uniswap V2 | - | DEX 接口和 AMM 算法 |
| Hardhat | ^2.26.3 | 开发和测试框架 |

---

## 九、设计亮点

1. **抽象基类模式**: 分离核心逻辑和环境配置，支持多环境部署
2. **成本追踪系统**: 精确追踪每个用户的购买成本，计算利润税
3. **差异化团队奖励**: 防止重复分配，公平分配团队收益
4. **动态限流机制**: 根据池子状态和网络流入动态调整质押限额
5. **批量费用处理**: 累积税费批量 swap，降低 gas 成本
6. **FundRelay 中继**: 解决 Router swap 的 INVALID_TO 问题
7. **高精度复利计算**: 使用 PRB Math 库保证计算精度
8. **多重安全保护**: 重入锁、滑点保护、流动性检查、黑白名单

---

## 十、合约调用示例

### 10.1 质押 USDT

```solidity
// 1. 用户授权 USDT
IERC20(USDT).approve(stakingAddress, 100 ether);

// 2. 绑定推荐人（仅第一次）
IStaking(stakingAddress).lockReferral(referrerAddress);

// 3. 质押 100 USDT，选择 30 天档位
IStaking(stakingAddress).stake(100 ether, 3);
```

### 10.2 解除质押

```solidity
// 检查是否可以解质押
bool canWithdraw = IStaking(stakingAddress).canWithdrawStake(userAddress, stakeIndex);

// 解质押
if (canWithdraw) {
    uint256 reward = IStaking(stakingAddress).unstake(stakeIndex);
}
```

### 10.3 通过 DEX 买入 OLA

```solidity
// 1. 授权 USDT
IERC20(USDT).approve(routerAddress, 100 ether);

// 2. Swap USDT → OLA
address[] memory path = new address[](2);
path[0] = USDT;
path[1] = olaAddress;

IUniswapV2Router02(routerAddress).swapExactTokensForTokensSupportingFeeOnTransferTokens(
    100 ether,     // USDT 输入
    0,             // 最小 OLA 输出（滑点保护）
    path,
    msg.sender,
    block.timestamp + 300
);
```

### 10.4 通过 DEX 卖出 OLA

```solidity
// 1. 授权 OLA
IERC20(olaAddress).approve(routerAddress, 100 ether);

// 2. Swap OLA → USDT
address[] memory path = new address[](2);
path[0] = olaAddress;
path[1] = USDT;

IUniswapV2Router02(routerAddress).swapExactTokensForTokensSupportingFeeOnTransferTokens(
    100 ether,     // OLA 输入
    0,             // 最小 USDT 输出（滑点保护）
    path,
    msg.sender,
    block.timestamp + 300
);
```

---

## 十一、常见问题

### Q1: 为什么需要 FundRelay？
**A**: Uniswap Router 的 `to` 参数不支持 fee-on-transfer 代币合约地址，直接 swap 到 OLA 合约会报 `INVALID_TO` 错误。FundRelay 作为中间人接收 USDT，再转发给 OLA 合约。

### Q2: sOLA 为什么不可转账？
**A**: sOLA 是质押凭证，代表用户的质押份额和团队业绩。不可转账防止质押份额交易和团队业绩转移。

### Q3: 利润税如何计算？
**A**: 系统追踪每个地址的历史购买成本（USDT）。卖出时，如果获得的 USDT > 历史成本，则对差额（利润）征收 25% 税。

### Q4: 推荐链最多多少层？
**A**: 最多 30 层 (`MAX_REFERRAL_DEPTH`），但团队奖励只分配给符合条件的 V1-V7 层级。

### Q5: 为什么要限制网络流入？
**A**: 防止大额质押冲击流动性池，导致价格剧烈波动。1 分钟内总质押不超过池子 1%。

### Q6: 什么是差异化奖励？
**A**: 每个团队层级只获得与上一层级的差额奖励。例如 V5 用户获得 25% - 上级最高层级的奖励率。避免重复分配。

### Q7: 如何成为 Preacher？
**A**: 当前质押价值（含收益）>= 200 sOLA，即可成为 Preacher，有资格获得团队奖励。

### Q8: 解质押时为什么要收 1% 赎回费？
**A**: 赎回费用于补偿系统的 gas 成本和流动性维护，发送给 `feeRecipient` 地址。

---

**文档版本**: v1.0
**最后更新**: 2025-10-11
**合约版本**: Solidity 0.8.20
**主网**: BSC (Binance Smart Chain)
