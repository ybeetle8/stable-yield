# SYI-Staking 质押系统功能说明文档

## 一、系统概述

SYI-Staking 是一个部署在 BSC (币安智能链) 上的去中心化质押系统,提供高年化收益率的 USDT 质押服务,并集成了推荐奖励和团队层级激励机制。

### 核心特点

- **高收益质押**: 日复利率 0.3%-1.5%,最高年化收益超过 1000%
- **LP 流动性永久锁定**: 质押时自动添加 SYI/USDT 流动性并销毁 LP 代币
- **灵活提现**: 支持提前提取收益,本金继续质押
- **推荐奖励**: 朋友奖励 5% + 团队层级奖励最高 35%
- **节点层级系统**: 管理员可设置节点等级,保障最低奖励比例
- **零税代币**: SYI 代币无买入税、卖出税和利润税

### 合约地址查询

部署后的合约地址保存在 `syi-deployment.json` 文件中。

---

## 二、质押功能 (Stake)

### 功能说明

用户质押 USDT 即可开始赚取复利收益,同时为 SYI/USDT 流动性池永久贡献流动性。

### 质押流程

```
用户质押 1000 USDT
    ↓
50% (500 USDT) 兑换为 SYI + 50% (500 USDT)
    ↓
添加流动性到 PancakeSwap (SYI/USDT Pair)
    ↓
LP 代币永久销毁 (发送到 address(0))
    ↓
用户收到 1000 sSYI (质押凭证代币)
```

**代码位置**: [StakingBase.sol:290-295](contracts/SYI-Staking/abstract/StakingBase.sol#L290-L295)

### 质押档位和收益率

| 档位 | stakeIndex | 日利率 | 锁定期 | 总回报率(复利) |
|------|-----------|--------|--------|----------------|
| 1天期 | 0 | 0.3% | 1 天 | ~0.3% |
| 30天期 | 1 | 0.6% | 30 天 | ~19.7% |
| 90天期 | 2 | 0.9% | 90 天 | ~125% |
| 180天期 | 3 | 1.5% | 180 天 | ~1379% |

**复利计算公式**:
```
最终价值 = 本金 × (1 + 日利率)^复利周期数
```

**代码位置**:
- 质押档位配置: [Staking.sol:27-62](contracts/SYI-Staking/mainnet/Staking.sol#L27-L62)
- 复利计算逻辑: [StakingBase.sol:1501-1531](contracts/SYI-Staking/abstract/StakingBase.sol#L1501-L1531)

### 质押限制

```solidity
MAX_STAKE_LIMIT = 1000 USDT          // 单次最大质押
MAX_USER_TOTAL_STAKE = 10000 USDT    // 用户总质押上限
maxStakeAmount()                     // 动态限制 (基于网络流入)
```

**动态限制规则**:
- 每分钟网络总流入不能超过 USDT 储备量的 1%
- 如超过,暂停新质押直到冷却

**代码位置**: [StakingBase.sol:60-61](contracts/SYI-Staking/abstract/StakingBase.sol#L60-L61), [StakingBase.sol:1040-1051](contracts/SYI-Staking/abstract/StakingBase.sol#L1040-L1051)

### 调用示例

```solidity
// 1. 用户批准质押合约使用 USDT
USDT.approve(stakingAddress, 1000 * 10**18);

// 2. 质押 1000 USDT,选择 180 天档位 (stakeIndex = 3)
Staking.stake(1000 * 10**18, 3);
```

---

## 三、提前提取收益 (Withdraw Interest)

### 功能说明

在质押到期前,用户可以随时提取已赚取的利息,**本金继续质押**,原定到期时间不变。

### 关键机制:复利重置

提取收益后,系统会**重置复利起点**:

```
提现前:
├─ 本金: 1000 USDT
├─ stakeTime: T0 (质押时间)
├─ originalEndTime: T30 (到期时间)
└─ 复利时长: T10 - T0 = 10 天

提现后 (第 10 天提取):
├─ 本金: 1000 USDT (不变)
├─ stakeTime: T10 (重置为当前时间) ⭐
├─ originalEndTime: T30 (不变)
└─ 剩余复利时长: T30 - T10 = 20 天
```

**为什么重置?**
- 防止双重复利:已提取的收益不应再参与复利计算
- 允许多次提现:每次从本金重新开始复利

**代码位置**: [StakingBase.sol:303-399](contracts/SYI-Staking/abstract/StakingBase.sol#L303-L399)

### 费用结构

假设利息 100 USDT:

```
利息: 100 USDT
├─ Friend 奖励: 5 USDT (5%)
├─ 团队奖励: 35 USDT (35%,差额分配给 V1-V7)
├─ 用户部分: 60 USDT (60%)
│   └─ 赎回费: 0.6 USDT (1%)
└─ 实际收到: 59.4 USDT
```

**代码位置**: [StakingBase.sol:330-367](contracts/SYI-Staking/abstract/StakingBase.sol#L330-L367)

### 调用示例

```solidity
// 提取第 0 个质押记录的收益
uint256 profitWithdrawn = Staking.withdrawInterest(0);
```

---

## 四、解除质押 (Unstake)

### 功能说明

质押到期后,用户可以解除质押,提取**本金 + 所有利息**。

### 关键时间戳

```solidity
Record {
    uint40 startTime;          // 原始质押时间 (不可变)
    uint40 stakeTime;          // 复利计算起点 (可重置)
    uint40 originalEndTime;    // 到期时间 (不可变) ⭐
}
```

**判断条件**: `block.timestamp >= originalEndTime`

**代码位置**: [StakingBase.sol:401-465](contracts/SYI-Staking/abstract/StakingBase.sol#L401-L465)

### 费用结构

与 `withdrawInterest` 相同,但包含本金:

```
总价值: 1000 (本金) + 1379 (利息) = 2379 USDT
├─ Friend 奖励: 68.95 USDT (利息的 5%)
├─ 团队奖励: 482.65 USDT (利息的 35%)
├─ 用户部分: 1827.4 USDT
│   └─ 赎回费: 18.27 USDT (1%)
└─ 实际收到: 1809.13 USDT
```

### 团队投资值更新

解除质押会**向上传播减少**推荐链上所有人的 `teamTotalInvestValue`:

```
用户 A (本金 1000)
    └─ 推荐人 B (teamKPI 5000)
        └─ 推荐人 C (teamKPI 20000)

A 解除质押后:
    B.teamKPI = 5000 - 1000 = 4000
    C.teamKPI = 20000 - 1000 = 19000
```

**代码位置**: [StakingBase.sol:1099-1115](contracts/SYI-Staking/abstract/StakingBase.sol#L1099-L1115)

---

## 五、推荐系统

### 5.1 推荐人 (Referral) vs 朋友 (Friend)

| 类型 | 奖励机制 | 绑定函数 |
|------|---------|---------|
| Referral | 团队层级奖励 (最高 35%) | `lockReferral()` |
| Friend | 固定 5% 奖励 | `lockFriend()` |

### 5.2 推荐绑定规则

```solidity
function lockReferral(address _referrer) external {
    // 1. 用户只能绑定一次
    require(_referrals[user] == address(0), "Already bound");

    // 2. 不能推荐自己
    require(_referrer != user, "Cannot refer self");

    // 3. 推荐人必须质押 > 1 sSYI (如果 requireReferrerStaked = true)
    require(balanceOf(_referrer) > 1 ether, "Referrer not staked");

    // 4. 绑定成功,记录配置快照
    _userReferralRequirementSnapshot[user] = requireReferrerStaked;
}
```

**配置快照机制**:
- 用户绑定时,系统记录当时的 `requireReferrerStaked` 配置
- 即使后续修改全局配置,用户的推荐关系不受影响
- 保证规则稳定性,避免历史用户受新规则影响

**代码位置**: [StakingBase.sol:467-498](contracts/SYI-Staking/abstract/StakingBase.sol#L467-L498)

### 5.3 推荐链最大深度

```solidity
MAX_REFERRAL_DEPTH = 30  // 最多遍历 30 层推荐链
```

**代码位置**: [StakingBase.sol:62](contracts/SYI-Staking/abstract/StakingBase.sol#L62)

---

## 六、团队层级奖励系统

### 6.1 层级和门槛

| 层级 | 团队 KPI 门槛 | 奖励比例 | 差额 |
|------|--------------|---------|------|
| V1 | 10,000 SYI | 5% | 5% |
| V2 | 50,000 SYI | 10% | 5% |
| V3 | 200,000 SYI | 15% | 5% |
| V4 | 500,000 SYI | 20% | 5% |
| V5 | 1,000,000 SYI | 25% | 5% |
| V6 | 2,500,000 SYI | 30% | 5% |
| V7 | 5,000,000 SYI | 35% | 5% |

**团队 KPI 计算**: 所有下线(直接 + 间接)的质押本金总和

**代码位置**: [Staking.sol:65-91](contracts/SYI-Staking/mainnet/Staking.sol#L65-L91)

### 6.2 差额分配机制

**规则**:
- 从下往上遍历推荐链(最多 30 层)
- 每个层级只分配一次
- 优先分配高层级
- 未分配部分归 `rootAddress`

**示例**:

```
用户 A 提取 100 USDT 利息
    └─ 推荐人 B (V1, 传教士)
        └─ 推荐人 C (V3, 传教士)
            └─ 推荐人 D (V2, 传教士)
                └─ 推荐人 E (V1, 非传教士)

分配过程:
1. B (V1): 5% - 0% = 5% → 5 USDT ✅
2. C (V3): 15% - 5% = 10% → 10 USDT ✅
3. D (V2): 10% - 15% = 0% → 0 USDT (已被 C 覆盖)
4. E (V1): 不是传教士 → 跳过

总分配: 15 USDT
剩余 (35% - 15% = 20%): 20 USDT → rootAddress
```

**代码位置**: [StakingBase.sol:1348-1412](contracts/SYI-Staking/abstract/StakingBase.sol#L1348-L1412)

### 6.3 传教士条件

```solidity
PREACHER_THRESHOLD = 200 SYI

function isPreacher(address user) public view returns (bool) {
    return currentStakeValue(user) >= PREACHER_THRESHOLD;
}
```

**作用**: 必须是传教士才能获得团队奖励,防止无质押用户薅羊毛。

**代码位置**: [StakingBase.sol:55](contracts/SYI-Staking/abstract/StakingBase.sol#L55), [StakingBase.sol:964-966](contracts/SYI-Staking/abstract/StakingBase.sol#L964-L966)

---

## 七、节点层级管理系统

### 7.1 功能概述

管理员可以为特定用户手动设置**节点等级**(V1 或 V2),作为最低保障,不限制自然升级。

### 7.2 节点层级规则

```
最终层级 = MAX(自然层级, 节点层级)

示例 1: 用户自然等级 V1,节点等级 V2 → 实际生效 V2
示例 2: 用户自然等级 V3,节点等级 V2 → 实际生效 V3 (自然升级不受限)
示例 3: 用户自然等级 0,节点等级 V1 → 实际生效 0 (非传教士节点等级无效)
```

**代码位置**: [StakingBase.sol:1597-1617](contracts/SYI-Staking/abstract/StakingBase.sol#L1597-L1617)

### 7.3 管理函数

#### 设置节点层级

```solidity
function setNodeTier(address user, uint8 tier) external onlyTierManager {
    // tier 只能是 1 (V1) 或 2 (V2)
    // user 不能是 rootAddress
}
```

#### 批量设置节点层级

```solidity
function batchSetNodeTier(
    address[] calldata users,
    uint8[] calldata tiers
) external onlyTierManager {
    // 最多一次处理 100 个用户
}
```

#### 移除节点层级

```solidity
function removeNodeTier(address user) external onlyTierManager;
```

**代码位置**: [StakingBase.sol:1840-1935](contracts/SYI-Staking/abstract/StakingBase.sol#L1840-L1935)

### 7.4 查询节点信息

```solidity
// 查询节点层级详情
function getNodeTierDetails(address user) external view returns (
    bool hasNodeTier,
    uint8 tier,
    uint40 setTime,
    address setBy,
    bool isActive
);

// 查询完整层级信息
function getUserTierBreakdown(address user) external view returns (
    bool isPreacherStatus,
    uint8 naturalTier,      // 基于 teamKPI 的自然等级
    uint8 nodeTier,         // 管理员设置的节点等级
    uint8 finalTier,        // 实际生效的等级
    bool usingNodeTier      // 是否使用了节点等级
);
```

**代码位置**: [StakingBase.sol:1950-1999](contracts/SYI-Staking/abstract/StakingBase.sol#L1950-L1999)

---

## 八、sSYI 质押凭证代币

### 8.1 代币特性

```solidity
名称: "Staked SYI"
符号: "sSYI"
精度: 18
总供应量: 动态(随质押和解除质押变化)
```

### 8.2 余额计算

```solidity
// 本金余额 (固定)
function principalBalance(address account) public view returns (uint256);

// 当前价值 (包含复利收益)
function balanceOf(address account) public view returns (uint256);

// 已赚利息
function earnedInterest(address account) public view returns (uint256) {
    return balanceOf(account) - principalBalance(account);
}
```

**代码位置**: [StakingBase.sol:865-908](contracts/SYI-Staking/abstract/StakingBase.sol#L865-L908)

### 8.3 转账限制

```solidity
function transfer() public pure returns (bool) {
    revert("Transfers not supported");
}
```

**原因**: sSYI 仅作为质押凭证,不支持转账,避免二级市场流通。

**代码位置**: [StakingBase.sol:1057-1075](contracts/SYI-Staking/abstract/StakingBase.sol#L1057-L1075)

---

## 九、Recycle 机制

### 9.1 工作原理

```
资金循环:
流动性池 (Pair) → recycle() → 质押合约 → 奖励分发 → 用户卖出 → 回到池子
```

### 9.2 Recycle 流程

```solidity
function recycle(uint256 amount) external {
    // 1. 只能由质押合约调用
    require(msg.sender == address(staking));

    // 2. 查询 Pair 池的 SYI 余额
    uint256 pairBalance = balanceOf(address(uniswapV2Pair));

    // 3. 计算最大可回收量 (最多 1/3)
    uint256 maxRecyclable = pairBalance / 3;

    // 4. 确定实际回收量
    uint256 recycleAmount = min(amount, maxRecyclable);

    // 5. 从 Pair 转账到 Staking
    _update(address(uniswapV2Pair), address(staking), recycleAmount);

    // 6. 同步 Pair 储备量
    uniswapV2Pair.sync();
}
```

**安全限制**:
- 每次回收最多池子代币的 1/3
- 必须调用 `sync()` 防止价格异常

**代码位置**: [SYIBase.sol:249-349](contracts/SYI/abstract/SYIBase.sol#L249-L349)

---

## 十、安全机制

### 10.1 黑名单和白名单

```solidity
// 黑名单: 禁止交易
mapping(address => bool) public blacklisted;

// 白名单: 免税和免限制
mapping(address => bool) public feeWhitelisted;
```

**代码位置**: [SYIBase.sol:77-78](contracts/SYI/abstract/SYIBase.sol#L77-L78)

### 10.2 冷却时间

```solidity
uint256 public coldTime = 10 seconds;  // 买入后 10 秒内不能卖出
```

**作用**: 防止高频交易套利和三明治攻击。

**代码位置**: [SYIBase.sol:66](contracts/SYI/abstract/SYIBase.sol#L66)

### 10.3 预售期限制

```solidity
presaleDuration = 30 days;  // 主网 30 天预售期

// 预售期内不允许从池子购买
if (presaleActive && block.timestamp < presaleStartTime + presaleDuration) {
    revert NotAllowedBuy();
}
```

**代码位置**: [SYIBase.sol:569-574](contracts/SYI/abstract/SYIBase.sol#L569-L574)

### 10.4 延迟购买保护

```solidity
delayedBuyPeriod = 30 days;  // 主网 30 天延迟购买期

// 开启后,非白名单用户需等待 30 天才能购买
function setDelayedBuyEnabled(bool _enabled) external onlyOwner;
```

**代码位置**: [SYIBase.sol:351-361](contracts/SYI/abstract/SYIBase.sol#L351-L361)

---

## 十一、事件系统

### 核心事件

```solidity
// 质押事件
event Staked(
    address indexed user,
    uint256 amount,
    uint256 timestamp,
    uint256 stakeIndex,
    uint256 stakePeriod
);

// 提前提取收益事件
event InterestWithdrawn(
    address indexed user,
    uint256 stakeIndex,
    uint256 profitAmount,
    uint256 usdtReceived,
    uint256 userPayout,
    uint256 friendReward,
    uint256 teamFee,
    uint256 redemptionFee,
    uint40 newStakeTime,
    uint40 originalEndTime,
    uint256 timestamp
);

// 解除质押事件
event RewardPaid(
    address indexed user,
    uint256 reward,
    uint256 timestamp,
    uint256 stakeIndex
);

// 团队奖励分配完成事件
event TeamRewardDistributionCompleted(
    uint256 interestAmount,
    uint256 totalTeamFee,
    uint256 totalDistributed,
    uint256 marketingAmount,
    address[7] tierRecipients,
    uint256[7] tierAmounts,
    uint8 activeTiers
);

// 节点层级设置事件
event NodeTierSet(
    address indexed user,
    uint8 tier,
    address indexed setBy,
    uint256 timestamp
);
```

**代码位置**: 参见 [contracts/SYI-Staking/interfaces/IStaking.sol](contracts/SYI-Staking/interfaces/IStaking.sol)

---

## 十二、管理员函数

### 质押合约管理

```solidity
// 设置 SYI 代币合约地址
function setSYI(address _syi) external onlyOwner;

// 设置费用接收地址
function setFeeRecipient(address _feeRecipient) external onlyOwner;

// 设置节点层级管理员
function setTierManager(address _tierManager) external onlyOwner;

// 设置推荐人质押要求
function setRequireReferrerStaked(bool _required) external onlyOwner;

// 紧急提取 SYI
function emergencyWithdrawSYI(address to, uint256 _amount) external onlyOwner;

// 紧急提取 USDT
function emergencyWithdrawUSDT(address to, uint256 _amount) external onlyOwner;
```

**代码位置**: [StakingBase.sol:1772-1935](contracts/SYI-Staking/abstract/StakingBase.sol#L1772-L1935)

### SYI 代币管理

```solidity
// 设置交易对地址
function setPair(address _pair) external onlyOwner;

// 设置白名单
function setFeeWhitelisted(address account, bool whitelisted) external onlyOwner;

// 批量设置白名单
function setBatchFeeWhitelisted(address[] memory accounts, bool _whitelisted) external onlyOwner;

// 设置黑名单
function setBlacklisted(address account, bool _blacklisted) external onlyOwner;

// 批量设置黑名单
function setBatchBlacklisted(address[] memory accounts, bool _blacklisted) external onlyOwner;

// 设置冷却时间
function setColdTime(uint256 _coldTime) external onlyOwner;

// 设置预售状态
function setPresaleActive(bool _active) external onlyOwner;

// 设置延迟购买
function setDelayedBuyEnabled(bool _enabled) external onlyOwner;
```

**代码位置**: [SYIBase.sol:156-361](contracts/SYI/abstract/SYIBase.sol#L156-L361)

---

## 十三、查询函数

### 用户信息查询

```solidity
// 获取用户基本信息
function getUserInfo(address user) external view returns (
    uint128 totalStaked,
    uint128 teamKPI,
    address referrer,
    bool hasLockedReferral,
    bool isPreacherStatus
);

// 获取质押详情
function getUserStakeDetails(address user, uint256 stakeIndex) external view returns (
    uint256 principal,
    uint256 currentValue,
    uint256 newProfit,
    uint256 totalWithdrawn,
    uint40 startTime,
    uint40 lastResetTime,
    uint40 originalEndTime,
    bool canWithdraw,
    uint256 timeRemaining
);

// 查询是否可提前提取收益
function canWithdrawInterest(address user, uint256 stakeIndex) external view returns (
    bool canWithdraw,
    uint256 withdrawableProfit,
    string memory reason
);

// 获取提现历史
function getWithdrawalHistory(address user) external view returns (WithdrawalRecord[] memory);
```

**代码位置**: [StakingBase.sol:571-733](contracts/SYI-Staking/abstract/StakingBase.sol#L571-L733)

### 团队信息查询

```solidity
// 获取团队绩效详情
function getTeamPerformanceDetails(address _user) external view returns (
    uint256 totalTeamInvestment,
    uint256 teamMemberCount,
    uint8 currentTier,
    uint256 nextTierThreshold,
    uint256 progressToNextTier
);

// 获取推荐人数
function getReferralCount(address _user) external view returns (uint256);

// 获取推荐链
function getReferrals(address _user, uint256 _maxDepth) external view returns (address[] memory);
```

**代码位置**: [StakingBase.sol:972-1003](contracts/SYI-Staking/abstract/StakingBase.sol#L972-L1003)

### 系统配置查询

```solidity
// 获取质押周期
function getStakePeriods() external pure returns (uint256[4] memory periods);

// 获取团队奖励门槛
function getTeamRewardThresholds() external pure returns (uint256[7] memory thresholds);

// 获取团队奖励比例
function getTeamRewardRates() external pure returns (uint256[7] memory rewardRates);

// 获取滑点配置
function getSlippageConfig() external pure returns (
    uint256 baseSlippage,
    uint256 maxSlippage,
    uint256 priceImpactThreshold
);

// 预览质押输出
function previewStakeOutput(uint256 usdtAmount) external view returns (
    uint256 halfUsdtAmount,
    uint256 expectedSYI,
    uint256 minSYIOut
);
```

**代码位置**: [StakingBase.sol:632-715](contracts/SYI-Staking/abstract/StakingBase.sol#L632-L715)

---

## 十四、前端集成指南

### 14.1 合约 ABI 导入

```javascript
import StakingABI from './abis/Staking.json';
import SYIABI from './abis/SYI.json';
import USDTABI from './abis/IERC20.json';

const stakingContract = new web3.eth.Contract(StakingABI, STAKING_ADDRESS);
const syiContract = new web3.eth.Contract(SYIABI, SYI_ADDRESS);
const usdtContract = new web3.eth.Contract(USDTABI, USDT_ADDRESS);
```

### 14.2 质押流程

```javascript
// 1. 批准 USDT
await usdtContract.methods.approve(STAKING_ADDRESS, amount).send({ from: userAddress });

// 2. 质押
const stakeIndex = 3; // 180 天档位
await stakingContract.methods.stake(amount, stakeIndex).send({ from: userAddress });
```

### 14.3 查询用户质押信息

```javascript
// 获取用户信息
const userInfo = await stakingContract.methods.getUserInfo(userAddress).call();
console.log('总质押:', userInfo.totalStaked);
console.log('团队 KPI:', userInfo.teamKPI);
console.log('推荐人:', userInfo.referrer);

// 获取质押详情
const stakeDetails = await stakingContract.methods.getUserStakeDetails(userAddress, 0).call();
console.log('本金:', stakeDetails.principal);
console.log('当前价值:', stakeDetails.currentValue);
console.log('新增利润:', stakeDetails.newProfit);
console.log('剩余时间:', stakeDetails.timeRemaining);
```

### 14.4 监听事件

```javascript
// 监听质押事件
stakingContract.events.Staked({
    filter: { user: userAddress },
    fromBlock: 'latest'
}, (error, event) => {
    console.log('质押成功:', event.returnValues);
});

// 监听提现事件
stakingContract.events.InterestWithdrawn({
    filter: { user: userAddress },
    fromBlock: 'latest'
}, (error, event) => {
    console.log('收益提取成功:', event.returnValues);
});
```

---

## 十五、常见陷阱和注意事项

### 15.1 时间单位混淆

**问题**: 主网使用天,测试网可能使用秒

**解决**: 检查 `getCompoundTimeUnit()` 返回值
- 主网: `1 days` (86400 秒)
- 测试网: `3` (3 秒,用于快速测试)

**代码位置**: [Staking.sol:99-102](contracts/SYI-Staking/mainnet/Staking.sol#L99-L102)

### 15.2 复利重置遗漏

**问题**: `withdrawInterest` 必须更新 `stakeTime`

**正确做法**:
```solidity
stakeRecord.stakeTime = uint40(block.timestamp); // ⭐ 必须重置
```

**代码位置**: [StakingBase.sol:361](contracts/SYI-Staking/abstract/StakingBase.sol#L361)

### 15.3 层级计算错误

**问题**: 必须同时满足传教士条件和团队 KPI

**正确逻辑**:
```solidity
if (currentTier > 0 && !tierAllocated[currentTier] && isPreacher(referralChain[i])) {
    // 分配奖励
}
```

**代码位置**: [StakingBase.sol:1441-1445](contracts/SYI-Staking/abstract/StakingBase.sol#L1441-L1445)

### 15.4 LP 代币误发

**问题**: `addLiquidity` 必须指定 `address(0)` 销毁 LP

**正确做法**:
```solidity
ROUTER.addLiquidity(
    USDT,
    SYI,
    remainingUsdt,
    syiTokensReceived,
    0, 0,
    address(0),  // ⭐ LP 代币发送到销毁地址
    deadline
);
```

**代码位置**: [StakingBase.sol:1570-1579](contracts/SYI-Staking/abstract/StakingBase.sol#L1570-L1579)

### 15.5 Recycle 限制

**问题**: 每次最多回收 `pairBalance / 3`

**安全检查**:
```solidity
uint256 maxRecyclable = pairBalance / 3;
uint256 recycleAmount = amount >= maxRecyclable ? maxRecyclable : amount;
```

**代码位置**: [SYIBase.sol:303-312](contracts/SYI/abstract/SYIBase.sol#L303-L312)

---

## 十六、部署流程

### 部署顺序

```bash
# 1. 编译合约
npx hardhat compile

# 2. 启动本地测试网络 (Fork BSC)
npx hardhat node --hostname 0.0.0.0 --port 8545 --fork https://rpc.tornadoeth.cash/bsc --fork-block-number 64340000

# 3. 部署 SYI 系统 (在另一个终端)
npx hardhat run scripts/deploySYI.js --network localhost

# 4. 运行测试脚本
npx hardhat run scripts/testSYI.js --network localhost
npx hardhat run scripts/testSYIStaking.js --network localhost
```

### 部署步骤详解

1. **部署质押合约** (Staking)
2. **部署 SYI 代币合约** (SYI)
3. **初始化 SYI 白名单** (`initializeWhitelist()`)
4. **配置关系** (`Staking.setSYI`, `SYI.setPair`)
5. **创建 SYI/USDT 交易对** (PancakeSwap Factory)
6. **转移 SYI 储备** (15,000,000 SYI → Staking)
7. **添加初始流动性** (40,000 USDT + 40,000,000 SYI)
8. **转移剩余 SYI** (测试钱包 9)

**代码位置**: [scripts/deploySYI.js](scripts/deploySYI.js)

---

## 十七、关键合约地址 (BSC 主网)

```solidity
USDT: 0x55d398326f99059fF775485246999027B3197955
WBNB: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
PancakeSwap Factory: 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
PancakeSwap Router: 0x10ED43C718714eb63d5aA57B78B54704E256024E
```

---

## 十八、技术栈

```json
{
  "solidity": "^0.8.20",
  "dependencies": {
    "@openzeppelin/contracts": "^5.4.0",  // ERC20, Ownable
    "@prb/math": "^4.1.0"                 // UD60x18 高精度数学运算
  }
}
```

### PRB Math 用法

```solidity
import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";

// 复利计算: 本金 × (1 + 利率)^周期数
UD60x18 principalAmount = ud(1000 ether);
UD60x18 rate = ud(1003000000000000000); // 0.3% 日利率
uint256 periods = 30;

UD60x18 result = principalAmount.mul(rate.powu(periods));
uint256 finalValue = UD60x18.unwrap(result);
```

---

## 十九、更多资源

### 详细文档

- `notes/质押系统资金流向详解.md` - 完整资金流向和代码分析
- `notes/团队收益机制详解.md` - 团队层级、节点管理、差额分配
- `notes/部署与测试命令.md` - 部署流程和测试命令参考
- `notes/质押系统黑白名单机制详解.md` - 黑白名单功能
- `notes/前端链上数据获取指南.md` - 前端集成指南

### 开发文档

- [CLAUDE.md](CLAUDE.md) - 项目概览和开发指南

---

## 二十、联系方式

如有技术问题或建议,请通过以下方式联系:

- GitHub Issues: [项目仓库 Issues](https://github.com/your-repo/issues)
- 技术文档: [项目文档](https://docs.your-project.com)

---

**文档版本**: v2.0
**最后更新**: 2025-11-29
**适用合约版本**: Solidity ^0.8.20
