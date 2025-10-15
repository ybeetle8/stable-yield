# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。

## 项目概览

SYI (Stable Yield Investment) 是一个部署在 BSC (币安智能链) 上的 DeFi 质押系统，具有零税代币和复杂的奖励机制。

### 核心组件

- **SYI Token** (`contracts/SYI/`) - 零税 ERC20 代币，集成 Uniswap V2
- **Staking Contract** (`contracts/SYI-Staking/`) - 高级质押合约，支持复利、推荐系统和团队层级奖励
- **架构**: 主网/测试网分离，使用抽象基类实现共享逻辑

## 开发命令

### 编译和测试

```bash
# 编译合约
npx hardhat compile

# 启动本地测试网络（Fork BSC 主网）
npx hardhat node --hostname 0.0.0.0 --port 8545 --fork https://rpc.tornadoeth.cash/bsc --fork-block-number 64340000

# 部署 SYI 系统（在另一个终端）
npx hardhat run scripts/deploySYI.js --network localhost

# 运行测试脚本
npx hardhat run scripts/testSYI.js --network localhost
npx hardhat run scripts/testSYIStaking.js --network localhost
npx hardhat run scripts/testSYISwap.js --network localhost
```

### 一键编译-部署-测试

```bash
npx hardhat compile && \
npx hardhat run scripts/deploySYI.js --network localhost && \
npx hardhat run scripts/testSYI.js --network localhost
```

### 部署信息

部署成功后，合约地址会保存在 `syi-deployment.json` 文件中。

## 合约架构

### 1. SYI 代币合约

**位置**: `contracts/SYI/`

**结构**:
- `SYI.sol` (主网) - 生产版本，包含 30 天预售期和延迟购买期
- `SYIBase.sol` (抽象) - 核心业务逻辑
- 通过抽象函数实现环境特定常量 (`getDelayedBuyPeriod`, `getPresaleDuration`)

**核心特性** (v2.0 零税版本):
- 无买入税 (0%)
- 无卖出税 (0%)
- 无利润税
- PancakeSwap V2 集成
- Recycle 机制：从流动性池回收代币到质押合约用于奖励分发
- 安全特性：黑名单/白名单、冷却时间 (10秒)、预售限制、延迟购买保护

**核心机制 - Recycle**:
```solidity
// 资金循环: 流动性池 → recycle() → 质押合约 → 奖励分发 → 用户卖出 → 回到池子
function recycle(uint256 amount) external {
    // 只能由质押合约调用
    // 从 Pair 池中回收最多 1/3 的 SYI 代币
    // 调用 pair.sync() 更新储备量
}
```

**代码位置**: `SYIBase.sol:249-349`

### 2. 质押合约

**位置**: `contracts/SYI-Staking/`

**结构**:
- `Staking.sol` (主网) - 生产版本，日复利率 0.3%-1.5%
- `StakingBase.sol` (抽象) - 完整的质押逻辑实现
- 环境特定配置：APY 利率、质押周期、复利时间单位、团队门槛

**核心功能**:

#### Stake (质押)
```solidity
function stake(uint160 _amount, uint8 _stakeIndex) external
```
- 用户质押 USDT
- 50% USDT 兑换成 SYI + 50% USDT 添加流动性
- LP 代币永久销毁（发送到 address(0)）
- 铸造 sSYI 代币作为凭证

**资金流向**: 用户 USDT → 质押合约 → (50% 兑换为 SYI) + (50% USDT) → 添加流动性 → 销毁 LP

**代码位置**: `StakingBase.sol:270-275`, `_swapAndAddLiquidity:1490-1524`

#### Withdraw Interest Early (提前提取收益)
```solidity
function withdrawInterest(uint256 stakeIndex) external returns (uint256)
```
- 提取已赚取的利息，本金继续质押
- 原始结束时间不变
- **复利重置**: `stakeTime` 更新为当前时间，从本金重新开始复利计算

**代码位置**: `StakingBase.sol:283-379`

#### Unstake (解除质押)
```solidity
function unstake(uint256 stakeIndex) external returns (uint256)
```
- 只能在到期后解除质押
- 提取本金 + 所有利息
- 销毁 sSYI 代币
- 更新团队投资值（向上传播减少）

**代码位置**: `StakingBase.sol:381-445`

#### Compound Interest Calculation (复利计算)
```solidity
最终价值 = 本金 × (1 + 日利率)^复利周期数
```
- 使用 `@prb/math` 库的 UD60x18 高精度数学运算
- 主网：按天复利 (`getCompoundTimeUnit() = 1 days`)
- 计算上限为 `originalEndTime`

**质押档位** (主网):

| stakeIndex | 日利率 | 周期 | 总回报率（复利） |
|------------|--------|------|-----------------|
| 0 | 0.3% | 1 天 | ~0.3% |
| 1 | 0.6% | 30 天 | ~19.7% |
| 2 | 0.9% | 90 天 | ~125% |
| 3 | 1.5% | 180 天 | ~1379% |

**代码位置**: `StakingBase.sol:1445-1475`, `Staking.sol:27-62`

### 3. 推荐和团队奖励系统

**推荐绑定**:
```solidity
function lockReferral(address _referrer) external
function lockFriend(address _friend) external
```
- **Referral（推荐人）**: 团队层级奖励（最高 35%）
- **Friend（朋友）**: 固定 5% 奖励
- 必须在质押前绑定推荐人

**团队层级系统** (V1-V7):

| 层级 | 团队 KPI 门槛 | 奖励比例 | 差额 |
|------|--------------|---------|------|
| V1 | 10,000 SYI | 5% | 5% |
| V2 | 50,000 SYI | 10% | 5% |
| V3 | 200,000 SYI | 15% | 5% |
| V4 | 500,000 SYI | 20% | 5% |
| V5 | 1,000,000 SYI | 25% | 5% |
| V6 | 2,500,000 SYI | 30% | 5% |
| V7 | 5,000,000 SYI | 35% | 5% |

**团队 KPI 计算**: 所有下线（直接 + 间接）质押本金总和

**差额分配机制**:
```
实际奖励 = 当前层级奖励% - 已累计分配%
```
- 从下往上遍历推荐链（最多 30 层）
- 每个层级只分配一次，优先分配高层级
- 未分配部分归 rootAddress

**传教士门槛**: 必须质押 ≥ 200 SYI 才能获得团队奖励

**节点层级管理** (管理员可设置):
- `tierManager` 地址可手动设置用户层级为 V1 或 V2
- `最终层级 = MAX(自然层级, 节点层级)`
- 作为最低保障，不限制自然升级

**代码位置**:
- 推荐绑定: `StakingBase.sol:447-476`, `482-492`
- 层级计算: `StakingBase.sol:1541-1595`
- 奖励分配: `StakingBase.sol:1292-1356`, `1358-1443`
- 节点层级管理: `StakingBase.sol:1753-1867`

### 4. 费用结构

**提现费用分配**:

1. **Friend 奖励**: 利息的 5%（固定）
2. **团队奖励**: 利息的最高 35%（差额分配）
3. **赎回费**: 用户部分的 1%（转给 `feeRecipient`）
4. **用户实际收到**: 扣除以上费用后的余额

**示例**:
```
利息: 100 USDT
├─ Friend: 5 USDT (5%)
├─ 团队: 35 USDT (35%，差额分配给 V1-V7)
├─ 用户部分: 60 USDT (60%)
│   └─ 赎回费: 0.6 USDT (1%)
└─ 实际收到: 59.4 USDT
```

**代码位置**: `StakingBase.sol:1277-1290`, `1292-1356`

## 重要机制详解

### Recycle 机制

**目的**: 从流动性池回收 SYI 代币到质押合约用于分配奖励

**工作流程**:
1. 质押合约调用 `SYI.recycle(amount)`
2. 查询 Pair 池的 SYI 余额 (`balanceOf(pair)`)
3. 计算最大可回收量: `min(amount, pairBalance / 3)` (最多 1/3)
4. 使用 `_update()` 直接从 Pair 转账到质押合约
5. 调用 `pair.sync()` 同步储备量

**安全限制**:
- 只能由质押合约调用
- 每次回收最多池子代币的 1/3
- 必须调用 sync() 防止价格异常

**代码位置**: `SYIBase.sol:249-349`

### 复利重置机制

**场景**: `withdrawInterest()` 提前提取收益后

**关键时间戳**:
- `startTime`: 原始质押时间（不可变）
- `stakeTime`: 复利计算起点（**可重置**）
- `originalEndTime`: 到期时间（不可变）

**重置逻辑**:
```solidity
// 提现前: 复利时间 = T30 - T0 = 30 天
// 提现后: stakeTime = T10 (重置为当前)
//         剩余复利时间 = T30 - T10 = 20 天
stakeRecord.stakeTime = uint40(block.timestamp);
stakeRecord.amount = 本金 (不变);
stakeRecord.originalEndTime = 到期时间 (不变);
```

**为何重置**:
- 防止双重复利（已提取的收益不应再复利）
- 允许多次提现，每次从本金重新计算

**代码位置**: `StakingBase.sol:341-343`, `1445-1475`

### LP 代币销毁机制

**位置**: `_swapAndAddLiquidity()` 函数

```solidity
ROUTER.addLiquidity(
    USDT,
    SYI,
    remainingUsdt,
    syiTokensReceived,
    0, 0,
    address(0),  // LP 代币发送到销毁地址
    deadline
);
```

**意义**:
- LP 代币永久销毁，流动性不可取回
- 池子深度只增不减
- 为 SYI 价格提供稳定支撑

**代码位置**: `StakingBase.sol:1514-1523`

## 限制和安全参数

```solidity
// 质押限制
MAX_STAKE_LIMIT = 1000 ether           // 单次最大质押
MAX_USER_TOTAL_STAKE = 10000 ether     // 用户总质押上限

// 团队系统
PREACHER_THRESHOLD = 200 ether         // 传教士门槛
MAX_REFERRAL_DEPTH = 30                // 最大推荐链深度

// 费率
REFERRAL_REWARD_RATE = 5               // Friend 5%
MAX_TEAM_REWARD_RATE = 35              // 团队最高 35%
REDEMPTION_FEE_RATE = 100              // 赎回费 1% (100 bps)

// 滑点保护
BASE_SLIPPAGE_TOLERANCE = 1500         // 15%
MAX_SLIPPAGE_TOLERANCE = 2000          // 20%
```

**代码位置**: `StakingBase.sol:55-83`

## 关键依赖

```json
{
  "@openzeppelin/contracts": "^5.4.0",  // ERC20, Ownable
  "@prb/math": "^4.1.0"                 // UD60x18 高精度数学运算
}
```

**PRB Math 用法**:
```solidity
import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";

UD60x18 result = principalAmount.mul(rate.powu(periods));
```

## 开发注意事项

### 1. 合约修改

- **主网/测试网分离**: 修改 Base 合约会影响主网和测试网
- **环境特定常量**: 通过主网/测试网文件中的抽象函数实现
- **继承链**: `SYI extends SYIBase`, `Staking extends StakingBase`

### 2. 复利精度

- 必须使用 `@prb/math` UD60x18 类型
- 不能使用 Solidity 原生整数运算（会丢失精度）
- 复利周期数 = `质押时长 / getCompoundTimeUnit()`

### 3. 时间相关逻辑

- **主网**: `1 days` (86400 秒)
- **测试网**: `1` (1 秒) - 便于快速测试
- 提前提现必须检查 `block.timestamp < originalEndTime`
- 解除质押必须检查 `block.timestamp >= originalEndTime`

### 4. Fork 模式开发

- 使用 BSC 主网合约（USDT, PancakeSwap）
- 需要设置 USDT 余额: `hardhat_setStorageAt` (见 deploySYI.js:205-234)
- Fork 节点必须保持运行

### 5. 事件监听

合约发出多种事件供前端监听:
- `Staked`: 质押成功
- `InterestWithdrawn`: 提前提取收益
- `RewardPaid`: 解除质押奖励
- `TeamRewardDistributionCompleted`: 团队奖励分配详情
- `NodeTierSet/Removed`: 节点层级变更

## 文档资源

`notes/` 目录中的详细机制说明（中文）:

- `质押系统资金流向详解.md` - 完整资金流向和代码分析
- `团队收益机制详解.md` - 团队层级、节点管理、差额分配
- `部署与测试命令.md` - 部署流程和测试命令参考
- `质押系统黑白名单机制详解.md` - 黑白名单功能
- `前端链上数据获取指南.md` - 前端集成指南

## 合约部署流程

参考 `scripts/deploySYI.js`:

1. 使用 BSC 主网合约地址（USDT, Router, Factory）
2. 部署质押合约
3. 部署 SYI 代币合约
4. 初始化 SYI 白名单 (`initializeWhitelist()`)
5. 配置关系（Staking.setSYI, SYI.setPair）
6. 创建 SYI/USDT 交易对
7. 转移 15,000,000 SYI 到质押合约作为储备
8. 添加初始流动性（40000 USDT + 40000000 SYI）
9. 将剩余 SYI 转移到测试钱包 9

## 关键合约地址 (BSC 主网)

```solidity
USDT: 0x55d398326f99059fF775485246999027B3197955
WBNB: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
PancakeSwap Factory: 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
PancakeSwap Router: 0x10ED43C718714eb63d5aA57B78B54704E256024E
```

## 常见陷阱

1. **时间单位混淆**: 主网使用天，测试网可能使用秒
2. **复利重置遗漏**: `withdrawInterest` 必须更新 `stakeTime`
3. **层级计算错误**: 必须同时满足传教士条件和团队 KPI
4. **LP 代币误发**: `addLiquidity` 必须指定 `address(0)`
5. **Recycle 限制**: 每次最多 `pairBalance / 3`
6. **滑点保护失效**: 交换时必须计算 `_calculateMinimumOutput()`

## 代码审查重点

- 推荐链遍历不超过 30 层 (`MAX_REFERRAL_DEPTH`)
- 总质押不超过用户限制 (`MAX_USER_TOTAL_STAKE`)
- 节点层级只能设置为 V1 或 V2
- 赎回费必须单独兑换（不从用户 USDT 中扣除）
- `recycle()` 后必须调用 `sync()`
- 复利计算使用 `originalEndTime` 而非 `stakeTime + period`
