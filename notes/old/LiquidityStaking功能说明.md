# LiquidityStaking 流动性质押系统功能说明

## 📋 项目概述

LiquidityStaking 是一个基于 Solidity 0.8.20 的 LP 代币质押奖励系统，为 OLA/USDT 流动性提供者提供额外的 USDT 奖励激励。系统通过接收 OLA 代币税费（BLA 奖励），自动兑换为 USDT 后分配给质押者，奖励分配基于质押金额和时间权重。

**代码位置**: `othercode/LiquidityStaking/src/`

---

## 🏗️ 架构设计

### 合约层次结构

```
src/
├── abstract/
│   └── LiquidityStakingBase.sol (590行)    # 核心业务逻辑实现
├── mainnet/
│   └── LiquidityStaking.sol (33行)         # 主网环境配置（24小时锁定期）
└── interfaces/
    ├── IStaking.sol                         # Staking 接口
    └── IOLA.sol                             # OLA 代币接口
```

**设计模式**: 抽象基类模式
- `LiquidityStakingBase.sol`: 包含所有核心功能实现
- `LiquidityStaking.sol`: 仅配置环境参数（最短质押时间）
- 修改业务逻辑 → 编辑 `LiquidityStakingBase.sol`
- 修改时间参数 → 编辑 `LiquidityStaking.sol`

---

## 💰 核心功能模块

### 1. LP 代币质押系统

#### 1.1 质押流程

**函数**: `stake(uint256 amount)`

**执行步骤**: 
1. ✅ 验证质押金额 > 0
2. ✅ 检查用户是否被排除在质押之外
3. 💱 转入 LP 代币到合约
4. 📝 创建/更新质押记录
5. 📊 更新奖励池状态
6. 🔄 触发 BLA 奖励处理

**质押信息结构**:
```solidity
struct StakeInfo {
    uint256 amount;              // 质押的 LP 代币数量
    uint256 stakeTime;           // 首次质押时间
    uint256 lastRewardTime;      // 最后领取奖励时间
    uint256 accumulatedReward;   // 累积已领取奖励
}
```

**关键特性**:
- ✅ 支持多次追加质押
- ✅ stakeTime 保持不变（计算时间权重用）
- ✅ 实时更新用户奖励状态

**实现位置**: `LiquidityStakingBase.sol:stake()` (152-180行)

#### 1.2 解除质押流程

**函数**: `unstake(uint256 amount)`

**执行步骤**:
1. ✅ 验证质押记录存在
2. ✅ 检查是否满足最短质押期（24小时）
3. 💰 自动领取待发放奖励
4. 📝 更新质押金额
5. 🔙 返还 LP 代币给用户
6. 🗑️ 如果余额为 0，移除质押者记录
7. 🔄 触发 BLA 奖励处理

**限制条件**:
- ⏰ 必须满足最短质押期：24小时（主网）
- ⚠️ 部分解除质押：可以部分取出，不影响剩余质押的时间权重

**实现位置**: `LiquidityStakingBase.sol:unstake()` (182-226行)

#### 1.3 领取奖励

**函数**: `claimReward()`

**执行步骤**:
1. 📈 计算待领取奖励
2. ✅ 验证奖励 >= 最小领取金额（0.001 USDT）
3. 📝 更新用户奖励状态
4. 💸 转账 USDT 到用户
5. 📊 更新奖励池统计数据
6. 🔄 触发 BLA 奖励处理

**关键参数**:
```solidity
MIN_REWARD_AMOUNT = 1000;  // 0.001 USDT (18 decimals: 1000 wei)
```

**实现位置**: `LiquidityStakingBase.sol:claimReward()` (228-252行)

---

### 2. 奖励池机制

#### 2.1 奖励池结构

```solidity
struct RewardPool {
    uint256 totalRewards;           // 累计总奖励（历史）
    uint256 rewardPerSecond;        // 每秒奖励速率
    uint256 lastUpdateTime;         // 最后更新时间
    uint256 rewardPerTokenStored;   // 每代币累积奖励
    uint256 totalStaked;            // 总质押量（LP 代币）
    uint256 totalWeight;            // 总权重（含时间加成）
    uint256 distributedRewards;     // 已分发奖励
    uint256 pendingRewards;         // 待分发奖励池
}
```

#### 2.2 奖励分配算法

**核心公式**: rewardPerToken 算法（类似 Synthetix StakingRewards）

```
rewardPerToken = rewardPerTokenStored + (Δt × rewardPerSecond × 1e18) / totalStaked

用户奖励 = (用户质押量 × ΔrewardPerToken / 1e18) × 时间权重
```

**时间权重计算**:
```solidity
timeMultiplier = 1e18 + (质押天数 × 1e18) / 365 days
```

**示例**:
```
质押 100 LP，质押 30 天：
timeMultiplier = 1e18 + (30天 × 1e18) / 365天 = 1.082e18
权重 = 100 × 1.082 = 108.2

质押 100 LP，质押 365 天：
timeMultiplier = 1e18 + (365天 × 1e18) / 365天 = 2e18
权重 = 100 × 2 = 200

=> 质押 1 年，获得的奖励是同等金额质押 1 天的 2 倍
```

**实现位置**:
- `_rewardPerToken()`: (314-325行)
- `_calculateWeight()`: (301-307行)
- `_calculateEarnedRewards()`: (343-358行)

#### 2.3 奖励分发周期

**固定周期**: 7 天

**计算方式**:
```solidity
rewardPerSecond = pendingRewards / 7 days
```

**特点**:
- ✅ 每次存入奖励时重新计算 `rewardPerSecond`
- ✅ 确保奖励在 7 天内分发完毕
- ✅ 新奖励存入会立即提高分发速率

---

### 3. BLA 奖励管理

#### 3.1 BLA 奖励来源

BLA 奖励由 OLA 代币合约自动存入，来源于交易税费：

| 来源 | 比例 | 说明 |
|------|------|------|
| 买入税 | 2% | LP 奖励（直接存入） |
| 卖出税 | 1.5% | LP 累积费用（批量存入） |
| 利润税 | 40% | 利润税的 40% 部分 |

**存入函数**: `depositBLARewards(uint256 blaAmount)`

**权限**: 仅 OLA 合约和 owner 可调用

**实现位置**: `LiquidityStakingBase.sol:depositBLARewards()` (278-295行)

#### 3.2 BLA 累积机制

**累积变量**:
```solidity
uint256 public accumulatedBLA;  // 累积的 BLA 代币
```

**累积流程**:
1. OLA 合约调用 `depositBLARewards()`
2. 转入 BLA 代币到 LiquidityStaking 合约
3. 累积到 `accumulatedBLA` 变量
4. 触发事件: `BLARewardsAccumulated`

**特点**: 不立即兑换，累积后统一处理

#### 3.3 BLA 自动兑换机制

**触发条件**:
- 累积的 BLA >= 10 OLA
- 在 stake/unstake/claimReward 操作时自动触发

**处理流程**:
```
1. 检查 accumulatedBLA >= 10 ether
2. 重置 accumulatedBLA = 0
3. Swap BLA → USDT (通过 Uniswap Router)
4. 将兑换得到的 USDT 存入奖励池
5. 重新计算 rewardPerSecond
6. 触发事件: BLASwappedToRewards
```

**Swap 配置**:
```solidity
path: [OLA, USDT]
minAmountOut: 0  // 无滑点保护（接受任意数量）
deadline: block.timestamp + 300  // 5 分钟过期
```

**实现位置**:
- `_processAccumulatedBLA()`: (417-443行)
- `_swapBLAForUSDT()`: (445-475行)

---

### 4. 权重系统

#### 4.1 权重计算公式

```solidity
weight = amount × timeMultiplier / 1e18

其中:
timeMultiplier = 1e18 + (stakeDuration × 1e18) / 365 days
```

#### 4.2 权重特性

- ✅ **线性增长**: 质押时间越长，权重越高
- ✅ **持续累积**: 时间权重持续增长，最高可达 2 倍（1年）
- ✅ **实时计算**: 每次查询时实时计算最新权重
- ✅ **缓存优化**: 使用 `cachedTotalWeight` 减少重复计算

#### 4.3 权重对奖励的影响

**场景对比**:

```
场景1: 用户 A 质押 100 LP，质押 1 天
  - 权重 = 100 × (1 + 1/365) ≈ 100.27
  - 奖励比例 = 100.27 / totalWeight

场景2: 用户 B 质押 100 LP，质押 30 天
  - 权重 = 100 × (1 + 30/365) ≈ 108.22
  - 奖励比例 = 108.22 / totalWeight

场景3: 用户 C 质押 100 LP，质押 365 天
  - 权重 = 100 × (1 + 365/365) = 200
  - 奖励比例 = 200 / totalWeight

结论: C 的奖励是 A 的约 2 倍
```

**实现位置**: `_calculateWeight()` (301-307行)

---

### 5. 查询和统计

#### 5.1 用户质押信息

**函数**: `getUserStakeInfo(address account)`

**返回值**:
```solidity
returns (
    uint256 stakedAmount,        // 质押数量
    uint256 stakeTime,           // 质押时间
    uint256 pendingReward,       // 待领取奖励
    uint256 accumulatedReward,   // 累积已领取奖励
    uint256 weight               // 当前权重
)
```

**实现位置**: (481-504行)

#### 5.2 奖励池信息

**函数**: `getRewardPoolInfo()`

**返回值**:
```solidity
returns (
    uint256 totalRewards,        // 累计总奖励（历史）
    uint256 rewardPerSecond,     // 每秒奖励速率
    uint256 totalStaked,         // 总质押量
    uint256 totalWeight,         // 总权重
    uint256 stakersCount,        // 质押者数量
    uint256 distributedRewards,  // 已分发奖励
    uint256 pendingRewards       // 待分发奖励
)
```

**实现位置**: (506-526行)

#### 5.3 解除质押检查

**函数**: `canWithdrawStake(address account)`

**返回值**:
```solidity
returns (
    bool canWithdraw,            // 是否可以解除质押
    uint256 stakedAmount,        // 质押数量
    uint256 timeRemaining        // 剩余锁定时间（秒）
)
```

**实现位置**: (538-564行)

---

### 6. 管理功能

#### 6.1 直接存入 USDT 奖励

**函数**: `depositRewards(uint256 amount)`

**用途**: 允许 OLA 合约或 owner 直接存入 USDT 作为奖励

**流程**:
1. 转入 USDT 到合约
2. 累加到 `totalRewards` 和 `pendingRewards`
3. 重新计算 `rewardPerSecond` (基于 7 天周期)
4. 触发事件: `RewardsDeposited`

**权限**: onlyAdmin (OLA 合约 或 owner)

**实现位置**: (258-276行)

#### 6.2 排除地址

**函数**: `setExcluded(address account, bool excluded)`

**用途**: 排除某些地址不参与质押（如 marketing、合约地址）

**默认排除地址**:
- LiquidityStaking 合约自身
- OLA 合约地址
- Marketing 地址（如果提供）

**实现位置**: (578-581行)

#### 6.3 紧急提取

**函数**: `emergencyWithdraw(address token, uint256 amount)`

**用途**: 紧急情况下提取代币到 OLA 合约

**权限**: onlyAdmin

**实现位置**: (583-588行)

---

## 🔄 与 OLA 生态系统的集成

### 三个合约的关系图

```
                    ┌─────────────────┐
                    │   OLA Token     │
                    │   (代币合约)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐
    │  Staking       │  │ Liquidity    │  │  PancakeSwap   │
    │  (USDT质押)    │  │ Staking      │  │  (DEX)         │
    │                │  │ (LP质押)     │  │                │
    └────────────────┘  └──────────────┘  └─────────────────┘
         │                     │                   │
         │                     │                   │
         └─────────────────────┴───────────────────┘
                      奖励资金流转
```

### 合约间的交互关系

#### 1. OLA → LiquidityStaking（奖励分配）

**OLA 合约调用 LiquidityStaking 合约的函数**:

```solidity
// 买入税：2% LP 奖励（直接存入 BLA）
liquidityStaking.depositBLARewards(liquidityFee);  // OLABase.sol:745

// 卖出税：1.5% LP 累积费用（批量存入 BLA）
liquidityStaking.depositBLARewards(totalLPFee);    // OLABase.sol:1232

// 利润税：40% 存入 USDT
liquidityStaking.depositRewards(lsShare);          // OLABase.sol:837
```

**触发时机**:
- **买入时**: 实时存入 2% LP 奖励（BLA）
- **卖出时**: 批量处理累积的 1.5% LP 费用（BLA）
- **利润税**: swap 为 USDT 后存入 40% 部分

**实现位置**: `OLABase.sol:_handleBuy()` (740-745行) 和 `_processFeeDistribution()` (1227-1232行，836-837行)

#### 2. LiquidityStaking → OLA（触发和授权）

**LiquidityStaking 调用 OLA 合约的函数**:

```solidity
// 触发 FundRelay 分发 USDT
IOLA(olaContract).triggerFundRelayDistribution();  // LiquidityStakingBase.sol:419

// 授权 Router 兑换 BLA → USDT
IERC20(olaContract).approve(address(router), blaAmount);  // LiquidityStakingBase.sol:450
```

**触发时机**:
- 每次 stake/unstake/claimReward 时自动触发

**实现位置**: `LiquidityStakingBase.sol:_processAccumulatedBLA()` (417-443行)

#### 3. OLA ← Staking（身份验证）

**OLA 合约调用 Staking 合约的函数**:

```solidity
// 验证用户是否为 Preacher（持有 ≥200 sOLA）
staking.isPreacher(user);  // OLABase.sol 多处使用
```

**用途**: 白名单管理、推荐人绑定验证

#### 4. LiquidityStaking 构造函数依赖

**LiquidityStaking 需要的合约地址**:

```solidity
constructor(
    address _usdt,              // USDT 代币地址
    address _olaContract,       // OLA 代币合约
    address _lpToken,           // OLA/USDT LP 代币地址
    address _staking,           // Staking 合约地址
    address _marketingAddress,  // Marketing 地址
    address _admin,             // 管理员地址
    address _router             // PancakeSwap Router
)
```

**注意**: LiquidityStaking 持有 Staking 合约的引用，但**不直接调用**其函数（仅用于地址记录）

### 部署顺序

由于合约之间存在相互依赖，必须按照特定顺序部署：

```
1. 部署基础代币
   ├─ USDT
   └─ WBNB

2. 部署 PancakeSwap
   ├─ Factory
   └─ Router

3. 部署 Staking 合约
   └─ 传入 USDT、Router、rootAddress

4. 部署 OLA 代币合约
   └─ 传入 USDT、Router、Staking、Marketing

5. 创建 OLA/USDT 交易对
   └─ Factory.createPair(OLA, USDT) → 获得 LP Token 地址

6. 部署 LiquidityStaking 合约
   └─ 传入 USDT、OLA、LP Token、Staking、Marketing、Admin、Router

7. 配置合约关联
   ├─ Staking.setOLA(ola_address)
   ├─ OLA.setLiquidityStaking(liquidityStaking_address)
   └─ 添加初始流动性

8. 设置白名单
   └─ OLA.setFeeWhitelisted(liquidityStaking_address, true)
```

**关键点**:
- LiquidityStaking 必须在 OLA/USDT 交易对创建**之后**部署（需要 LP Token 地址）
- 部署后需要通过 `setLiquidityStaking()` 配置 OLA 合约的 LiquidityStaking 地址

### 奖励流转路径

**完整的资金流转图**:

```
用户 A 通过 DEX 买入 OLA
    ↓
OLA 合约收取 3% 买入税
    ├─ 1% → burn (销毁)
    └─ 2% → LiquidityStaking.depositBLARewards() [BLA]
        ↓
        累积到 accumulatedBLA

用户 B 通过 DEX 卖出 OLA
    ↓
OLA 合约收取税费
    ├─ 1.5% Marketing 税 → 累积
    ├─ 1.5% LP 税 → 批量存入 LiquidityStaking.depositBLARewards() [BLA]
    └─ 25% 利润税（如果有利润）
        ├─ 40% → LiquidityStaking.depositRewards() [USDT]
        └─ 60% → Node/Marketing

用户 C 质押 LP 代币 (stake)
    ↓
触发 LiquidityStaking._processAccumulatedBLA()
    ↓
如果 accumulatedBLA >= 10 OLA:
    ├─ 授权 Router
    ├─ Swap: BLA → USDT (通过 PancakeSwap)
    ├─ 存入奖励池: rewardPool.totalRewards += usdtAmount
    └─ 重新计算: rewardPerSecond = pendingRewards / 7 days

LP 质押者
    ↓
每秒获得奖励: baseReward × timeMultiplier
    ↓
用户领取 (claimReward) 或 解除质押 (unstake)
    ↓
转账 USDT 到用户
```

**关键点**:
1. ✅ BLA 奖励自动累积，达到阈值后自动兑换为 USDT
2. ✅ 利润税的 40% 直接以 USDT 形式存入
3. ✅ 所有奖励按 7 天周期均匀分发给 LP 质押者
4. ✅ 质押时间越长，获得的奖励权重越高

---

## 📈 使用流程示例

### 完整用户旅程

```solidity
// 1. 用户准备
address user = 0x123...;
address lpToken = OLA_USDT_PAIR;  // OLA/USDT LP 代币
uint256 amount = 100 ether;       // 100 LP 代币

// 2. 授权 LP 代币
IERC20(lpToken).approve(address(liquidityStaking), amount);

// 3. 质押 LP 代币
liquidityStaking.stake(amount);

// 4. 查询质押状态
(
    uint256 stakedAmount,
    uint256 stakeTime,
    uint256 pendingReward,
    uint256 accumulatedReward,
    uint256 weight
) = liquidityStaking.getUserStakeInfo(user);

// 5. 随时领取奖励（如果 >= 0.001 USDT）
liquidityStaking.claimReward();

// 6. 等待 24 小时后解除质押
(bool canWithdraw, , uint256 timeRemaining) =
    liquidityStaking.canWithdrawStake(user);

if (canWithdraw) {
    // 部分解除质押（自动领取奖励）
    liquidityStaking.unstake(50 ether);

    // 或全部解除质押
    liquidityStaking.unstake(stakedAmount);
}
```

---

## 🔧 技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| Solidity | 0.8.20 | 智能合约语言 |
| OpenZeppelin | ^5.0.0 | ERC20、ReentrancyGuard、Ownable |
| Uniswap V2 | - | Router 接口（BLA 兑换） |

---

## ⚠️ 重要注意事项

### 用户须知

1. ✅ **最短质押期**: 24小时（主网），解除质押前需满足
2. ✅ **时间权重**: 质押时间越长，获得的奖励越多（最高 2 倍）
3. ✅ **奖励来源**: 来自 OLA 代币交易税费（BLA），自动兑换为 USDT
4. ✅ **奖励周期**: 7 天分发周期，每秒均匀分发
5. ✅ **最小领取**: 0.001 USDT，低于此金额无法领取
6. ✅ **自动领取**: 解除质押时自动领取所有待发放奖励

### 与 OLA Staking 的区别

| 特性 | OLA Staking | LiquidityStaking |
|------|-------------|------------------|
| 质押资产 | USDT | OLA/USDT LP 代币 |
| 质押目的 | 获得 OLA 复利收益 | 获得 USDT 奖励 |
| 奖励来源 | Swap 获得 USDT | BLA 税费兑换 USDT |
| 锁定期 | 1-30 天（档位） | 24 小时 |
| 推荐奖励 | 有（5% + 35%） | 无 |
| 复利机制 | 有（日复利） | 无（线性分发） |
| 权重系统 | 无 | 有（时间权重） |

### 三个核心合约对比

| 特性 | OLA Token | Staking | LiquidityStaking |
|------|-----------|---------|------------------|
| **合约类型** | ERC20 代币 | 质押合约 | 质押合约 |
| **核心功能** | 交易、税费 | USDT 质押 | LP 质押 |
| **质押资产** | - | USDT | OLA/USDT LP |
| **奖励代币** | - | USDT | USDT |
| **收益来源** | 交易税费 | OLA 复利 | BLA 税费 |
| **锁定期** | - | 1-30 天 | 24 小时 |
| **推荐系统** | - | ✅ 有 | ❌ 无 |
| **时间权重** | - | ❌ 无 | ✅ 有 |
| **调用关系** | 调用 Staking、LiquidityStaking | 被 OLA 调用 | 被 OLA 调用、调用 OLA |
| **资金流入** | 交易手续费 | 用户质押 USDT | OLA 税费 |
| **资金流出** | 税费分配 | 用户奖励 | LP 质押者奖励 |

---

## 🔐 安全机制

### 重入保护

- ✅ 使用 OpenZeppelin `ReentrancyGuard`
- ✅ 所有外部调用函数添加 `nonReentrant` modifier

### 权限控制

- ✅ `onlyAdmin` modifier: 仅 OLA 合约和 owner 可调用管理函数
- ✅ 排除地址: 防止合约地址和特殊地址参与质押

### 异常处理

- ✅ Swap 失败容错: `_swapBLAForUSDT` 使用 try-catch 捕获异常
- ✅ FundRelay 触发容错: 即使失败也不影响主流程

---

## 📊 关键参数配置

| 参数 | 值 | 说明 |
|------|---|------|
| MIN_REWARD_AMOUNT | 0.001 USDT | 最小领取奖励金额 |
| 最短质押期 | 24小时 | 主网配置（可在子类修改） |
| 奖励分发周期 | 7天 | 固定周期 |
| BLA 自动兑换阈值 | 10 OLA | 累积到此数量自动兑换 |
| 时间权重公式 | 1 + (天数 / 365) | 最高 2 倍（1年） |

---

## 📚 关键事件

```solidity
// 质押事件
event Staked(address indexed user, uint256 amount, uint256 timestamp);

// 解除质押事件
event Unstaked(address indexed user, uint256 amount, uint256 reward);

// 领取奖励事件
event RewardClaimed(address indexed user, uint256 reward);

// USDT 奖励存入事件
event RewardsDeposited(uint256 amount, uint256 newRewardRate);

// BLA 累积事件
event BLARewardsAccumulated(uint256 blaAmount, uint256 totalAccumulated);

// BLA 兑换事件
event BLASwappedToRewards(
    uint256 blaAmount,
    uint256 usdtAmount,
    uint256 newRewardRate
);

// 地址排除事件
event AddressExcluded(address indexed account, bool excluded);
```

---

## 🎯 设计亮点

1. **时间权重奖励**: 鼓励长期质押，质押时间越长奖励越多
2. **自动化流程**: BLA 自动累积和兑换，无需手动操作
3. **实时奖励**: 基于 rewardPerToken 算法，奖励实时累积
4. **灵活解除质押**: 支持部分解除质押，不影响剩余质押的时间权重
5. **Gas 优化**: 权重缓存、延迟处理减少 gas 消耗
6. **容错机制**: Swap 失败不影响主流程，提高系统稳定性

---

## ❓ 常见问题

### Q1: LiquidityStaking 和 OLA Staking 有什么区别？
**A**: OLA Staking 是质押 USDT 获得 OLA 复利收益，有锁定期档位（1-30天）和推荐奖励。LiquidityStaking 是质押 LP 代币获得 USDT 奖励，只有 24 小时锁定期，奖励基于时间权重。

### Q2: 为什么奖励基于时间权重？
**A**: 鼓励长期持有 LP 代币，为 OLA/USDT 池提供稳定的流动性。质押 1 年的用户获得的奖励是同等金额质押 1 天的 2 倍。

### Q3: BLA 是什么？
**A**: BLA 是 OLA 代币的别称，指的是从 OLA 交易税费中分配给 LiquidityStaking 的 OLA 代币。累积后自动兑换为 USDT 分配给质押者。

### Q4: 为什么要累积到 10 OLA 才兑换？
**A**: 减少频繁 swap 的 gas 成本，提高系统效率。每次 stake/unstake/claimReward 时会检查是否达到阈值。

### Q5: 解除质押时是否必须领取奖励？
**A**: 是的，解除质押时会自动领取所有待发放奖励。如果只想领取奖励不解除质押，使用 `claimReward()` 函数。

### Q6: 可以部分解除质押吗？
**A**: 可以。部分解除质押不会影响剩余质押的时间权重，剩余部分继续累积时间权重和奖励。

### Q7: 如果累积的奖励 < 0.001 USDT 能否领取？
**A**: 不能。`claimReward()` 函数会直接返回，不会转账。但解除质押时会自动领取所有奖励（无最小限制）。

### Q8: 质押的奖励资金是什么币种？
**A**: 奖励资金是 **USDT**。虽然 LiquidityStaking 合约接收的是 BLA（OLA 代币）作为税费奖励，但系统会自动将 BLA 兑换为 USDT 后再分配给质押者。用户领取奖励时收到的是 USDT。

### Q9: 质押奖励的资金来源有哪些？
**A**: 主要有两个来源：

**主要来源 - BLA 税费奖励（自动兑换为 USDT）**:
- **买入税**: 用户通过 DEX 买入 OLA 时，2% 的 LP 奖励直接存入 LiquidityStaking
- **卖出税**: 用户卖出 OLA 时，1.5% 的 LP 累积费用批量存入 LiquidityStaking
- **利润税**: 用户卖出 OLA 获利时，利润的 25% 作为利润税，其中 40% 分配给 LiquidityStaking

**次要来源 - 直接 USDT 存入**:
- OLA 合约或管理员可以通过 `depositRewards()` 函数直接存入 USDT 作为奖励

所有 BLA 奖励累积到 ≥10 OLA 时，会自动通过 Uniswap Router 兑换为 USDT，然后按 7 天周期分配给 LP 质押者。

### Q10: LiquidityStaking 与其他两个合约（OLA 和 Staking）的关系是什么？
**A**: 三个合约形成一个完整的 DeFi 生态系统：

**OLA 代币合约**（核心）:
- 提供税费收入来源
- 调用 LiquidityStaking.depositBLARewards() 存入 BLA 税费
- 调用 LiquidityStaking.depositRewards() 存入 USDT 利润税
- 调用 Staking.isPreacher() 验证用户身份

**Staking 合约**（USDT 质押）:
- 独立的质押系统，质押 USDT 获得 OLA 复利收益
- 提供 isPreacher() 接口给 OLA 合约调用
- 与 LiquidityStaking 无直接调用关系

**LiquidityStaking 合约**（LP 质押）:
- 接收 OLA 合约的税费奖励（BLA 和 USDT）
- 自动将 BLA 兑换为 USDT 分配给 LP 质押者
- 调用 OLA.triggerFundRelayDistribution() 触发资金分发

**资金流向**:
```
OLA 交易税费 → LiquidityStaking → LP 质押者（USDT 奖励）
           ↘
            Staking → USDT 质押者（OLA 复利收益）
```

**设计目的**:
- **Staking**: 激励用户质押 USDT，为项目提供稳定资金
- **LiquidityStaking**: 激励用户提供流动性，为 OLA/USDT 池提供深度
- 两个系统相互独立但共同支撑 OLA 生态

---

**文档生成时间**: 2025-10-11
**合约版本**: Solidity 0.8.20
**文档作者**: Claude Code
