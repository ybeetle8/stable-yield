# OLA Staking 系统功能说明

## 📋 项目概述

OLA Staking 是一个基于 Solidity 0.8.20 的 DeFi 质押系统，提供多档期质押、复利计算、推荐奖励和团队激励等功能。系统与 Uniswap V2 DEX 深度集成，实现了质押即添加流动性的创新机制。

**合约地址**: `0x39f403ca78c08317a03401acff4113d992b3c071` (BSC 主网)
**代码位置**: `othercode/OLA-Staking/src/`

---

## 🏗️ 架构设计

### 合约层次结构

```
src/
├── abstract/
│   └── StakingBase.sol (1393行)      # 核心业务逻辑实现
├── mainnet/
│   └── Staking.sol (98行)            # 主网环境配置（日复利、30天周期）
└── interfaces/
    ├── IStaking.sol                   # 完整接口定义
    └── IOLA.sol                       # OLA 代币接口
```

**设计模式**: 抽象基类模式
- `StakingBase.sol`: 包含所有核心功能实现
- `Staking.sol`: 仅配置环境参数（APY、周期、阈值）
- 修改业务逻辑 → 编辑 `StakingBase.sol`
- 修改参数配置 → 编辑 `Staking.sol`

---

## 💰 核心功能模块

### 1. 质押系统 (Staking)

#### 1.1 质押档位

| 档位 | 锁定期 | 日化收益率 | 总收益率 | 描述 |
|------|--------|-----------|---------|------|
| 0 | 1天 | 0.3% | 0.3% | 短期测试档位 |
| 1 | 7天 | 0.6% | 4.28% | 周质押 |
| 2 | 15天 | 1.0% | 16.1% | 半月质押 |
| 3 | 30天 | 1.5% | 56.31% | 月质押（最高收益） |

**关键参数**:
- 单笔质押上限: 1,000 USDT
- 用户总质押上限: 10,000 USDT
- 复利计算单位: 日（主网）
- 质押代币: USDT

#### 1.2 质押流程

```solidity
function stake(uint160 _amount, uint8 _stakeIndex) external
```

**执行步骤**:
1. ✅ 验证参数（金额、档位、用户额度）
2. ✅ 检查推荐关系（必须绑定推荐人）
3. 💱 自动兑换并添加流动性:
   - 50% USDT → 购买 OLA
   - 50% USDT + 购买的 OLA → 添加到流动性池
4. 🪙 铸造 sOLA 代币（质押凭证）
5. 📝 创建质押记录
6. 📊 更新团队投资数据

**滑点保护**:
- 基础滑点: 15% (1500 basis points)
- 最大滑点: 20% (2000 basis points)
- 动态调整: 根据价格影响自动调整

#### 1.3 解除质押流程

```solidity
function unstake(uint256 stakeIndex) external returns (uint256 totalReward)
```

**执行步骤**:
1. ✅ 验证质押期限是否到期
2. 📈 计算复利收益
3. 💱 将 OLA 兑换为 USDT
4. 💸 分配奖励:
   - 5% → 直推奖励（Friend Reward）
   - 最高 35% → 团队奖励（Team Reward）
   - 1% → 赎回费用（Redemption Fee）
5. 🔥 销毁 sOLA 代币
6. 📝 记录提现历史
7. 💰 转账 USDT 给用户

---

### 2. sOLA 代币系统

#### 2.1 代币属性

```solidity
name: "Staked OLA"
symbol: "sOLA"
decimals: 18
```

#### 2.2 核心特性

- **不可转账**: `transfer()` 和 `transferFrom()` 禁用
- **不可授权**: `approve()` 禁用
- **仅记账用**: 记录用户质押份额
- **自动铸造**: 质押时 1:1 铸造
- **自动销毁**: 解除质押时销毁

#### 2.3 余额计算

```solidity
// 本金余额（原始质押金额）
function principalBalance(address account) returns (uint256)

// 当前余额（包含复利收益）
function balanceOf(address account) returns (uint256)  // = currentStakeValue()

// 已赚收益
function earnedInterest(address account) returns (uint256)  // = balanceOf() - principalBalance()
```

---

### 3. 推荐系统 (Referral System)

#### 3.1 推荐关系绑定

```solidity
function lockReferral(address _referrer) external
```

**规则**:
- ✅ 必须在首次质押前绑定
- ✅ 绑定后永久生效，不可更改
- ✅ 可传入 `address(0)` 自动绑定到根地址
- ✅ 推荐人必须是 Preacher 身份（质押 ≥ 1 OLA）
- ❌ 不能推荐自己
- ❌ 不能重复绑定

#### 3.2 好友关系绑定

```solidity
function lockFriend(address _friend) external
```

**用途**: 指定直推奖励（5%）接收地址

**规则**:
- 可以绑定任意地址
- 一旦绑定不可更改
- 若未绑定，直推奖励发送给根地址

#### 3.3 推荐链追溯

```solidity
function getReferrals(address user, uint8 maxDepth) returns (address[] memory)
```

**功能**: 向上追溯推荐链，最多 30 层

---

### 4. 奖励分配系统

#### 4.1 直推奖励（Friend Reward）

**奖励比例**: 5% of interest
**触发时机**: 用户解除质押时
**接收者**: 用户绑定的好友（或根地址）

**计算公式**:
```
directReward = (usdtReceived - principalAmount) * 5%
```

#### 4.2 团队奖励（Team Reward）

**奖励比例**: 最高 35% of interest
**分配机制**: 差额奖励（Strict Differential Reward）

**V1-V7 层级体系**:

| 层级 | 团队KPI阈值 | 奖励比例 | 差额比例 |
|------|-----------|---------|---------|
| V1 | 10,000 USDT | 5% | 5% |
| V2 | 50,000 USDT | 10% | 5% |
| V3 | 200,000 USDT | 15% | 5% |
| V4 | 500,000 USDT | 20% | 5% |
| V5 | 1,000,000 USDT | 25% | 5% |
| V6 | 2,500,000 USDT | 30% | 5% |
| V7 | 5,000,000 USDT | 35% | 5% |

**分配逻辑** (`_distributeHybridRewards`):

1. 遍历用户的推荐链（向上 30 层）
2. 检查每个推荐人的层级（V1-V7）
3. 验证 Preacher 身份（≥ 200 USDT）
4. 按层级从低到高分配**差额奖励**
5. 未分配的部分发送到根地址（marketing）

**差额奖励示例**:
```
假设用户收益 1000 USDT，团队奖励池 = 1000 * 35% = 350 USDT

推荐链: User → A(V2) → B(V5) → C(V1)

分配顺序:
1. B (V5): 350 * 25% = 87.5 USDT (因为是链中最高层级)
2. A (V2): 350 * (10% - 0%) = 35 USDT (差额奖励)
3. C (V1): 0 USDT (V1 < V2, 不满足差额条件)
4. 剩余: 350 - 87.5 - 35 = 227.5 USDT → 根地址

总分配: 122.5 USDT
营销地址: 227.5 USDT
```

#### 4.3 Preacher 身份系统

**定义**: 质押金额 ≥ 200 USDT 的用户

**特权**:
- ✅ 可被其他用户推荐
- ✅ 可获得团队奖励
- ✅ 团队KPI累计生效

**验证函数**:
```solidity
function isPreacher(address user) returns (bool)
```

#### 4.4 团队 KPI 计算

**定义**: 直接和间接下级的总质押金额（不包含自己）

**更新时机**:
- 下级质押时: `teamTotalInvestValue[referrer] += amount`
- 下级解除质押: `teamTotalInvestValue[referrer] -= amount`

**追溯机制**:
- 用户后期绑定推荐人，会同步已有质押金额到推荐链

---

### 5. 复利计算机制

#### 5.1 数学库

使用 **PRB Math** (`@prb/math ^4.1.0`) 实现高精度复利计算:

```solidity
import {UD60x18, ud} from "lib/prb-math/src/UD60x18.sol";
```

#### 5.2 计算公式

```solidity
function _calculateStakeReward(Record storage stakeRecord) returns (uint256)
```

**公式**:
```
currentReward = principal * (1 + rate)^periods
```

**实现**:
```solidity
UD60x18 principalAmount = ud(stakeRecord.amount);
UD60x18 baseInterestRate = ud(rates[stakeRecord.stakeIndex]);
uint256 compoundPeriods = stakingDuration / getCompoundTimeUnit();  // 主网: 1 day

UD60x18 compoundedAmount = principalAmount.mul(
    baseInterestRate.powu(compoundPeriods)
);
```

**主网配置示例** (Staking.sol):
```solidity
// 30天档位
getAPYRate30D() = 1015000428130702600  // 1.015000428...
getCompoundTimeUnit() = 1 days

// 计算: 1000 USDT * (1.015)^30 ≈ 1563.1 USDT
```

---

### 6. 流动性管理

#### 6.1 质押时添加流动性

**逻辑** (`_swapAndAddLiquidity`):

```
用户质押 1000 USDT:
1. 转入 1000 USDT 到合约
2. 500 USDT → Swap → OLA (假设获得 5000 OLA)
3. 500 USDT + 5000 OLA → AddLiquidity → LP Token (销毁)
```

**关键点**:
- LP Token 发送到 `address(0)` (销毁)
- 滑点保护: 动态计算 `minOlaTokensOut`
- 支持 OLA 的税费机制（3% 买入税）

#### 6.2 解除质押时移除流动性

**逻辑** (`_swapOLAForReward`):

```
用户解除质押，需要 1500 USDT:
1. 合约持有的 OLA → Swap → 1500 USDT
2. 计算实际消耗的 OLA 数量
3. 调用 OLA.recycle() 回收剩余 OLA
```

**最大输入计算** (`_calculateMaxOLAInput`):
- 基于储备池比例
- 限制不超过可用 OLA 的 50%
- 添加 50% 滑点保护

---

### 7. 风控机制

#### 7.1 质押限制

```solidity
// 单笔限额
MAX_STAKE_LIMIT = 1000 ether

// 用户总额度
MAX_USER_TOTAL_STAKE = 10000 ether

// 动态限额（基于网络流入）
function maxStakeAmount() returns (uint256)
```

**动态限额逻辑**:
```solidity
recentInflow = 最近1分钟的质押增量
poolReserveUsdt = OLA/USDT 池中的 USDT 储备
onePercentOfPool = poolReserveUsdt / 100

if (recentInflow > onePercentOfPool) {
    return 0;  // 暂停质押
} else {
    availableCapacity = onePercentOfPool - recentInflow;
    return min(availableCapacity, MAX_STAKE_LIMIT);
}
```

#### 7.2 EOA 检查

```solidity
modifier onlyEOA() {
    if (tx.origin != msg.sender) revert OnlyEOAAllowed();
    _;
}
```

**用途**: 防止合约调用（闪电贷攻击等）

#### 7.3 滑点保护

**配置**:
```solidity
BASE_SLIPPAGE_TOLERANCE = 1500  // 15%
MAX_SLIPPAGE_TOLERANCE = 2000   // 20%
PRICE_IMPACT_THRESHOLD = 200    // 2%
```

**动态调整**:
```solidity
priceImpact = (usdtAmountIn * 10000) / reserveUSDT

if (priceImpact <= PRICE_IMPACT_THRESHOLD) {
    slippage = BASE_SLIPPAGE_TOLERANCE;
} else {
    additionalSlippage = (priceImpact * BASE_SLIPPAGE_TOLERANCE) / PRICE_IMPACT_THRESHOLD;
    slippage = min(BASE_SLIPPAGE_TOLERANCE + additionalSlippage, MAX_SLIPPAGE_TOLERANCE);
}
```

---

### 8. 提现历史记录

#### 8.1 记录结构

```solidity
struct WithdrawalRecord {
    uint40 withdrawalTime;        // 提现时间
    uint256 stakeIndex;           // 质押索引
    uint256 principalAmount;      // 本金
    uint256 calculatedReward;     // 计算收益
    uint256 usdtReceived;         // 实际收到 USDT
    uint256 olaTokensUsed;        // 消耗 OLA 数量
    uint256 referralFee;          // 直推奖励
    uint256 teamFee;              // 团队奖励
    uint256 userPayout;           // 用户实际到账
    uint256 interestEarned;       // 利息收益
}
```

#### 8.2 查询函数

```solidity
// 获取所有提现记录
function getWithdrawalHistory(address user) returns (WithdrawalRecord[] memory)

// 获取提现次数
function getWithdrawalCount(address user) returns (uint256)

// 获取单条记录
function getWithdrawalRecord(address user, uint256 index) returns (WithdrawalRecord memory)
```

---

### 9. 管理功能

#### 9.1 合约配置

```solidity
// 设置 OLA 合约地址（必须在部署后配置）
function setOLA(address _xf) external onlyOwner

// 设置费用接收地址
function setFeeRecipient(address _feeRecipient) external onlyOwner

// 设置根地址
function setRootAddress(address _rootAddress) external onlyOwner
```

#### 9.2 紧急功能

```solidity
// 紧急提取 OLA
function emergencyWithdrawOLA(address to, uint256 _amount) external onlyOwner

// 紧急提取 USDT
function emergencyWithdrawUSDT(address to, uint256 _amount) external onlyOwner

// 同步流动性池
function sync() external
```

---

## 📊 关键事件

### 核心事件

```solidity
// 质押事件
event Staked(
    address indexed user,
    uint256 amount,
    uint256 timestamp,
    uint256 index,
    uint256 stakeTime
);

// 提现完成事件
event WithdrawalCompleted(
    address indexed user,
    uint256 indexed stakeIndex,
    uint256 principalAmount,
    uint256 calculatedReward,
    uint256 usdtReceived,
    uint256 olaTokensUsed,
    uint256 referralFee,
    uint256 teamFee,
    uint256 userPayout,
    uint256 interestEarned,
    uint40 withdrawalTime
);

// 团队奖励分配事件
event TeamRewardDistributionCompleted(
    uint256 interestAmount,
    uint256 totalTeamRewardPool,
    uint256 totalDistributed,
    uint256 marketingAmount,
    address[7] tierRecipients,
    uint256[7] tierAmounts,
    uint8 activeTiers
);

// 推荐绑定事件
event BindReferral(address indexed user, address indexed parent);

// 好友绑定事件
event BindFriend(address indexed user, address indexed friend);

// 赎回费用事件
event RedemptionFeeCollected(
    address indexed user,
    uint256 stakeIndex,
    uint256 olaAmount,
    uint256 usdtAmount,
    address indexed feeRecipient,
    uint256 timestamp
);
```

---

## 🔄 与 OLA 代币的集成

### 双向集成关系

```
Staking ←→ OLA

Staking 调用 OLA:
- balanceOf(): 查询 OLA 余额
- approve(): 授权 Router
- transfer(): 转移 OLA
- recycle(): 回收多余 OLA
- getUniswapV2Pair(): 获取交易对地址
- getUSDTReserve(): 获取 USDT 储备

OLA 调用 Staking:
- isPreacher(): 验证用户身份
```

### 部署顺序

```
1. 部署 USDT、WBNB
2. 部署 PancakeSwap (Factory, Router)
3. 部署 Staking (临时 OLA 地址)
4. 部署 OLA (传入 Staking 地址)
5. 配置: Staking.setOLA(ola_address)
6. 创建交易对: Factory.createPair(OLA, USDT)
7. 初始化流动性
```

---

## 📈 使用流程示例

### 完整用户旅程

```solidity
// 1. 用户准备
address user = 0x123...;
uint256 amount = 1000 ether;  // 1000 USDT

// 2. 绑定推荐人
staking.lockReferral(referrer);  // 或 address(0) 绑定根地址

// 3. 绑定好友（可选）
staking.lockFriend(friendAddress);

// 4. 授权 USDT
usdt.approve(address(staking), amount);

// 5. 质押（选择30天档位）
staking.stake(uint160(amount), 3);

// 6. 查询状态
(uint256[] memory indices, bool[] memory canWithdraw, uint256[] memory timeLeft) =
    staking.getUserStakeWithdrawalStatus(user);

// 7. 等待30天后解除质押
if (canWithdraw[0]) {
    staking.unstake(0);
}

// 8. 查询提现历史
WithdrawalRecord[] memory history = staking.getWithdrawalHistory(user);
```

---

## 🔧 技术栈

- **Solidity**: 0.8.20
- **数学库**: @prb/math ^4.1.0 (高精度复利计算)
- **标准库**: @openzeppelin/contracts ^5.4.0
- **DEX**: Uniswap V2 兼容 (PancakeSwap)
- **编译器**: Solidity Optimizer (runs: 200, viaIR: true)

---

## ⚠️ 重要注意事项

### 用户须知

1. ✅ **必须先绑定推荐人** 才能质押
2. ✅ 推荐关系一旦绑定**不可更改**
3. ✅ 解除质押需等待**锁定期结束**
4. ✅ 质押时会自动**添加流动性**
5. ✅ 收益采用**日复利**计算（主网）
6. ✅ 解除质押会扣除 **1% 赎回费**

### 安全建议

1. 🔒 合约经过审计，但仍需谨慎投资
2. 🔒 注意滑点风险（最高 20%）
3. 🔒 团队奖励需达到 Preacher 身份
4. 🔒 紧急情况可使用 emergency 函数

---

## 📚 参考资源

- **BSC 主网合约**: https://bscscan.com/address/0x39f403ca78c08317a03401acff4113d992b3c071
- **OLA 代币**: https://bscscan.com/token/0xfc548e35c4a3603b09204acead0cd16908423eea
- **官方网站**: https://olafi.xyz
- **代码位置**: `othercode/OLA-Staking/src/`

---

**文档生成时间**: 2025-10-11
**合约版本**: Solidity 0.8.20
**文档作者**: Claude Code
