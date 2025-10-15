# LiquidityStaking 合约方法详解

## 目录

- [合约架构](#合约架构)
- [状态变量](#状态变量)
- [用户操作函数](#用户操作函数)
- [SYI 合约调用函数](#syi-合约调用函数)
- [内部核心函数](#内部核心函数)
- [查询函数](#查询函数)
- [管理员函数](#管理员函数)
- [修饰符与错误定义](#修饰符与错误定义)

---

## 合约架构

### 继承关系

```
LiquidityStakingBase (abstract)
    ├── ReentrancyGuard (OpenZeppelin)
    ├── Ownable (OpenZeppelin)
    └── LiquidityStaking (mainnet/testnet)
```

### 核心机制

- **质押资产**: SYI/USDT LP 代币 (PancakeSwap 流动性凭证)
- **奖励资产**: USDT
- **权重系统**: 质押时间越长，权重越高 (最高 2 倍)
- **奖励分配**: 按权重比例分配，7 天周期释放
- **最小质押时间**: 24 小时 (主网)

---

## 状态变量

### 不可变变量 (Immutable)

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `syiContract` | `address` | SYI Token 合约地址 |
| `usdt` | `address` | USDT 代币地址 |
| `lpToken` | `address` | SYI/USDT LP 代币地址 |
| `staking` | `IStaking` | SYI-Staking 合约接口 (用于推荐系统查询) |
| `router` | `IUniswapV2Router02` | PancakeRouter 地址 (用于 SYI→USDT 兑换) |

### 常量

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `MIN_REWARD_AMOUNT` | `1000` | 最小奖励金额 (0.001 USDT) |

### 状态变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `accumulatedSYI` | `uint256` | 累积的 SYI 代币数量 (待兑换) |
| `stakes` | `mapping(address => StakeInfo)` | 用户质押信息 |
| `stakers` | `address[]` | 质押者地址列表 |
| `isStaker` | `mapping(address => bool)` | 是否为质押者 |
| `rewardPool` | `RewardPool` | 奖励池信息 |
| `excludedFromStaking` | `mapping(address => bool)` | 排除质押的地址 |
| `cachedTotalWeight` | `uint256` | 缓存的总权重 |
| `cachedWeightTimestamp` | `uint256` | 权重缓存时间戳 |
| `userRewardPerTokenPaid` | `mapping(address => uint256)` | 用户已支付的每代币奖励 |
| `userPendingRewards` | `mapping(address => uint256)` | 用户待领取奖励 |

### 结构体定义

#### StakeInfo - 质押信息

```solidity
struct StakeInfo {
    uint256 amount;             // 质押的 LP 代币数量
    uint256 stakeTime;          // 开始质押的时间戳
    uint256 lastRewardTime;     // 上次领取奖励的时间
    uint256 accumulatedReward;  // 累积已领取的奖励总额
}
```

#### RewardPool - 奖励池信息

```solidity
struct RewardPool {
    uint256 totalRewards;           // 历史总奖励 (累计注入)
    uint256 rewardPerSecond;        // 每秒分配的奖励
    uint256 lastUpdateTime;         // 上次更新时间
    uint256 rewardPerTokenStored;   // 存储的每代币奖励
    uint256 totalStaked;            // 总质押量 (LP 代币)
    uint256 totalWeight;            // 总权重
    uint256 distributedRewards;     // 已分配的奖励
    uint256 pendingRewards;         // 待分配的奖励
}
```

---

## 用户操作函数

### 1. stake() - 质押 LP 代币

**函数签名**:
```solidity
function stake(uint256 amount) external nonReentrant updateReward(msg.sender)
```

**参数**:
- `amount`: 质押的 LP 代币数量

**功能描述**:
1. 将用户的 LP 代币转入合约
2. 记录质押信息 (金额、时间)
3. 更新奖励池状态
4. 触发累积 SYI 的兑换流程

**权限**: 任何人 (非排除地址)

**前置条件**:
- `amount > 0`
- 用户未被排除在质押之外 (`!excludedFromStaking[msg.sender]`)
- 用户需先授权 LP 代币给合约

**与其他合约交互**:
- **LP Token**: `transferFrom(msg.sender, address(this), amount)` - 转入 LP 代币
- **SYI Token**: `triggerFundRelayDistribution()` - 触发 FundRelay 分发
- **PancakeRouter**: 如累积 SYI ≥ 10，触发 SYI → USDT 兑换

**状态变更**:
- 增加用户质押金额
- 增加总质押量
- 更新用户奖励状态
- 如首次质押，添加到质押者列表

**事件**:
- `Staked(address indexed user, uint256 amount, uint256 timestamp)`
- 可能触发: `SYISwappedToRewards(uint256 syiAmount, uint256 usdtAmount, uint256 newRewardRate)`

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:152

---

### 2. unstake() - 解除质押

**函数签名**:
```solidity
function unstake(uint256 amount) external nonReentrant updateReward(msg.sender)
```

**参数**:
- `amount`: 解除质押的 LP 代币数量

**功能描述**:
1. 检查质押时间是否满足最小时长 (24小时)
2. 计算并发放待领取的奖励 (USDT)
3. 退还 LP 代币给用户
4. 更新奖励池和用户状态
5. 如全部解除质押，从质押者列表移除

**权限**: 质押者本人

**前置条件**:
- 用户有质押记录 (`userStake.amount > 0`)
- `amount > 0 && amount <= userStake.amount`
- 满足最小质押时间: `block.timestamp >= stakeTime + 24 hours`

**与其他合约交互**:
- **USDT**: `transfer(msg.sender, reward)` - 发放奖励
- **LP Token**: `transfer(msg.sender, amount)` - 退还 LP 代币
- **SYI Token**: `triggerFundRelayDistribution()` - 触发分发
- **PancakeRouter**: 可能触发 SYI → USDT 兑换

**状态变更**:
- 减少用户质押金额
- 减少总质押量
- 增加用户累积奖励
- 增加奖励池已分配金额
- 减少奖励池待分配金额
- 如全部解除，从质押者列表移除

**事件**:
- `Unstaked(address indexed user, uint256 amount, uint256 reward)`

**错误处理**:
- `NoStakeFound()`: 没有质押记录
- `InvalidAmount()`: 金额无效
- `InsufficientStakeTime()`: 未满足最小质押时间
- `TransferFailed()`: 转账失败

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:182

---

### 3. claimReward() - 领取奖励

**函数签名**:
```solidity
function claimReward() external nonReentrant updateReward(msg.sender)
```

**参数**: 无

**功能描述**:
1. 计算用户当前可领取的奖励
2. 如奖励 ≥ 0.001 USDT，发放给用户
3. 更新奖励状态
4. 不影响质押本金

**权限**: 质押者本人

**前置条件**:
- 用户有质押记录
- 待领取奖励 ≥ `MIN_REWARD_AMOUNT` (0.001 USDT)

**与其他合约交互**:
- **USDT**: `transfer(msg.sender, reward)` - 发放奖励
- **SYI Token**: `triggerFundRelayDistribution()` - 触发分发
- **PancakeRouter**: 可能触发 SYI → USDT 兑换

**状态变更**:
- 增加用户累积奖励
- 增加奖励池已分配金额
- 减少奖励池待分配金额
- 清空用户待领取奖励
- 更新用户奖励状态

**事件**:
- `RewardClaimed(address indexed user, uint256 reward)`

**特殊处理**:
- 如奖励 < 0.001 USDT，函数直接返回，不发放

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:228

---

## SYI 合约调用函数

### 4. depositRewards() - 注入 USDT 奖励

**函数签名**:
```solidity
function depositRewards(uint256 amount) external onlyAdmin updateReward(address(0))
```

**参数**:
- `amount`: 注入的 USDT 数量

**功能描述**:
1. 接收 SYI Token 合约转入的 USDT
2. 添加到奖励池
3. 计算新的每秒奖励率 (按 7 天周期分配)
4. 这是利润税 USDT 的主要入口

**权限**: `onlyAdmin` (SYI Token 合约 或 Owner)

**调用来源**:
- **SYI Token**: 利润税的 40% (USDT 形式)
- **Owner**: 手动注入奖励

**与其他合约交互**:
- **USDT**: `transferFrom(msg.sender, address(this), amount)` - 接收 USDT

**计算逻辑**:
```solidity
rewardPool.totalRewards += amount;          // 累计总奖励
rewardPool.pendingRewards += amount;        // 增加待分配奖励
rewardPool.rewardPerSecond = pendingRewards / 7 days;  // 7天周期释放
```

**状态变更**:
- 增加总奖励
- 增加待分配奖励
- 更新每秒奖励率

**事件**:
- `RewardsDeposited(uint256 amount, uint256 newRewardRate)`

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:258

---

### 5. depositSYIRewards() - 注入 SYI 奖励

**函数签名**:
```solidity
function depositSYIRewards(uint256 syiAmount) external onlyAdmin
```

**参数**:
- `syiAmount`: 注入的 SYI 代币数量

**功能描述**:
1. 接收 SYI Token 合约转入的 SYI 代币
2. 累积到 `accumulatedSYI` 变量
3. 不立即兑换，等待累积到 10 SYI 后再兑换
4. 这是买入税/卖出税 LP 费用的主要入口

**权限**: `onlyAdmin` (SYI Token 合约 或 Owner)

**调用来源**:
- **SYI Token**: 买入税 2% LP 费用 (SYI 形式)
- **SYI Token**: 卖出税 1.5% LP 费用 (SYI 形式)

**与其他合约交互**:
- **SYI Token**: `transferFrom(msg.sender, address(this), syiAmount)` - 接收 SYI

**状态变更**:
- 增加 `accumulatedSYI`

**事件**:
- `SYIRewardsAccumulated(uint256 syiAmount, uint256 totalAccumulated)`

**后续处理**:
- 当 `accumulatedSYI >= 10 ether` 时，会在 `stake()` / `unstake()` / `claimReward()` 中触发兑换

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:278

---

## 内部核心函数

### 6. _calculateWeight() - 计算权重

**函数签名**:
```solidity
function _calculateWeight(uint256 amount, uint256 duration) internal pure returns (uint256)
```

**参数**:
- `amount`: 质押的 LP 代币数量
- `duration`: 质押持续时间 (秒)

**功能描述**:
计算用户的质押权重，质押时间越长权重越高

**计算公式**:
```solidity
timeMultiplier = 1e18 + (duration * 1e18) / (365 days)
weight = (amount * timeMultiplier) / 1e18
```

**权重示例**:
- 质押 100 LP，刚质押: `weight = 100`
- 质押 100 LP，30天: `weight = 100 * (1 + 30/365) ≈ 108.2`
- 质押 100 LP，180天: `weight = 100 * (1 + 180/365) ≈ 149.3`
- 质押 100 LP，365天: `weight = 100 * (1 + 365/365) = 200` **(最高 2 倍)**

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:301

---

### 7. _updateRewardPool() - 更新奖励池

**函数签名**:
```solidity
function _updateRewardPool() internal
```

**功能描述**:
1. 更新每代币奖励累积值
2. 更新上次更新时间

**调用时机**:
- 通过 `updateReward` 修饰符自动调用
- 在所有涉及奖励计算的函数执行前

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:309

---

### 8. _rewardPerToken() - 计算每代币奖励

**函数签名**:
```solidity
function _rewardPerToken() internal view returns (uint256)
```

**功能描述**:
计算当前每个质押代币累积的奖励

**计算逻辑**:
```solidity
if (totalStaked == 0) return rewardPerTokenStored;

timeDelta = block.timestamp - lastUpdateTime;
additionalRewardPerToken = (timeDelta * rewardPerSecond * 1e18) / totalStaked;
return rewardPerTokenStored + additionalRewardPerToken;
```

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:314

---

### 9. _updateUserReward() - 更新用户奖励

**函数签名**:
```solidity
function _updateUserReward(address account) internal
```

**参数**:
- `account`: 用户地址

**功能描述**:
1. 计算用户自上次更新以来新增的奖励
2. 累加到用户待领取奖励
3. 更新用户的每代币奖励已支付值

**调用时机**:
- 通过 `updateReward` 修饰符自动调用

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:327

---

### 10. _calculateEarnedRewards() - 计算已赚取奖励

**函数签名**:
```solidity
function _calculateEarnedRewards(address account, uint256 currentRewardPerToken)
    internal view returns (uint256)
```

**参数**:
- `account`: 用户地址
- `currentRewardPerToken`: 当前每代币奖励

**功能描述**:
计算用户自上次支付以来赚取的新奖励 (考虑权重加成)

**计算逻辑**:
```solidity
// 1. 计算每代币奖励增量
rewardPerTokenDelta = currentRewardPerToken - userRewardPerTokenPaid[account];

// 2. 计算时间权重
stakeDuration = block.timestamp - userStake.stakeTime;
timeMultiplier = 1e18 + (stakeDuration * 1e18) / (365 days);

// 3. 计算基础奖励
baseRewards = (userStake.amount * rewardPerTokenDelta) / 1e18;

// 4. 应用权重加成
return (baseRewards * timeMultiplier) / 1e18;
```

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:343

---

### 11. _calculatePendingReward() - 计算待领取奖励

**函数签名**:
```solidity
function _calculatePendingReward(address account) internal view returns (uint256)
```

**参数**:
- `account`: 用户地址

**功能描述**:
计算用户当前总的待领取奖励 (已累积 + 新赚取)

**计算逻辑**:
```solidity
return userPendingRewards[account] + _calculateEarnedRewards(account, _rewardPerToken());
```

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:360

---

### 12. _calculateCurrentTotalWeight() - 计算总权重

**函数签名**:
```solidity
function _calculateCurrentTotalWeight() internal view returns (uint256)
```

**功能描述**:
遍历所有质押者，计算当前的总权重

**优化策略**:
- 如果当前区块已计算过，直接返回缓存值
- 否则遍历所有质押者重新计算

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:375

---

### 13. _updateCachedTotalWeight() - 更新权重缓存

**函数签名**:
```solidity
function _updateCachedTotalWeight() internal
```

**功能描述**:
重新计算并缓存总权重，避免重复计算

**调用时机**:
- `stake()` 时
- `unstake()` 时

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:399

---

### 14. _removeStaker() - 移除质押者

**函数签名**:
```solidity
function _removeStaker(address account) internal
```

**参数**:
- `account`: 用户地址

**功能描述**:
从质押者列表中移除用户 (当用户全部解除质押时)

**实现方式**:
- 将最后一个元素移到当前位置
- 删除最后一个元素 (避免数组空洞)

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:404

---

### 15. _processAccumulatedSYI() - 处理累积的 SYI

**函数签名**:
```solidity
function _processAccumulatedSYI() internal
```

**功能描述**:
1. 触发 SYI Token 的 FundRelay 分发
2. 如累积 SYI ≥ 10，触发兑换流程
3. 将兑换得到的 USDT 添加到奖励池

**调用时机**:
- `stake()` 结束时
- `unstake()` 结束时
- `claimReward()` 结束时

**与其他合约交互**:
- **SYI Token**: `triggerFundRelayDistribution()` - 触发 FundRelay
- **PancakeRouter**: 通过 `_swapSYIForUSDT()` 兑换

**阈值设计**:
- 累积阈值: 10 SYI
- 目的: 减少 gas 消耗，批量兑换

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:417

---

### 16. _swapSYIForUSDT() - SYI 兑换 USDT

**函数签名**:
```solidity
function _swapSYIForUSDT(uint256 syiAmount) internal returns (uint256 usdtAmount)
```

**参数**:
- `syiAmount`: 要兑换的 SYI 数量

**返回值**:
- `usdtAmount`: 兑换得到的 USDT 数量

**功能描述**:
通过 PancakeRouter 将 SYI 兑换为 USDT

**与其他合约交互**:
- **SYI Token**: `approve(router, syiAmount)` - 授权 Router
- **PancakeRouter**: `swapExactTokensForTokensSupportingFeeOnTransferTokens()` - 兑换
  - 路径: SYI → USDT
  - 最小输出: 0 (接受任何数量)
  - 接收地址: address(this)
  - 截止时间: block.timestamp + 300 秒

**错误处理**:
- 使用 `try-catch`，兑换失败返回 0
- 支持 FeeOnTransfer 代币 (SYI 有交易税)

**计算逻辑**:
```solidity
initialBalance = USDT.balanceOf(this);
// ... 执行兑换 ...
finalBalance = USDT.balanceOf(this);
usdtAmount = finalBalance - initialBalance;  // 计算实际到账
```

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:445

---

## 查询函数

### 17. getUserStakeInfo() - 获取用户质押信息

**函数签名**:
```solidity
function getUserStakeInfo(address account) external view
    returns (
        uint256 stakedAmount,
        uint256 stakeTime,
        uint256 pendingReward,
        uint256 accumulatedReward,
        uint256 weight
    )
```

**参数**:
- `account`: 用户地址

**返回值**:
- `stakedAmount`: 质押的 LP 代币数量
- `stakeTime`: 开始质押的时间戳
- `pendingReward`: 待领取的奖励 (USDT)
- `accumulatedReward`: 历史累计已领取的奖励
- `weight`: 当前权重

**功能描述**:
查询用户的完整质押信息

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:481

---

### 18. getRewardPoolInfo() - 获取奖励池信息

**函数签名**:
```solidity
function getRewardPoolInfo() external view
    returns (
        uint256 totalRewards,
        uint256 rewardPerSecond,
        uint256 totalStaked,
        uint256 totalWeight,
        uint256 stakersCount,
        uint256 distributedRewards,
        uint256 pendingRewards
    )
```

**返回值**:
- `totalRewards`: 历史总奖励 (累计注入)
- `rewardPerSecond`: 每秒分配的奖励
- `totalStaked`: 总质押量 (LP 代币)
- `totalWeight`: 当前总权重
- `stakersCount`: 质押者数量
- `distributedRewards`: 已分配的奖励
- `pendingRewards`: 待分配的奖励

**功能描述**:
查询奖励池的完整状态

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:506

---

### 19. getStakersCount() - 获取质押者数量

**函数签名**:
```solidity
function getStakersCount() external view returns (uint256)
```

**返回值**:
- 当前质押者数量

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:528

---

### 20. canUnstake() - 检查是否可以解除质押

**函数签名**:
```solidity
function canUnstake(address account) external view returns (bool)
```

**参数**:
- `account`: 用户地址

**返回值**:
- `true`: 可以解除质押
- `false`: 不能解除质押 (无质押或时间未满)

**判断条件**:
```solidity
userStake.amount > 0 &&
block.timestamp >= stakeTime + getMinStakeDuration()
```

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:532

---

### 21. canWithdrawStake() - 检查提款状态

**函数签名**:
```solidity
function canWithdrawStake(address account) external view
    returns (
        bool canWithdraw,
        uint256 stakedAmount,
        uint256 timeRemaining
    )
```

**参数**:
- `account`: 用户地址

**返回值**:
- `canWithdraw`: 是否可以提款
- `stakedAmount`: 质押金额
- `timeRemaining`: 剩余锁定时间 (秒)

**功能描述**:
详细查询用户的提款状态，包括倒计时

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:538

---

### 22. getMinStakeDurationExternal() - 获取最小质押时长

**函数签名**:
```solidity
function getMinStakeDurationExternal() external pure returns (uint256 duration)
```

**返回值**:
- 最小质押时长 (秒)
- 主网: 24 hours (86400 秒)

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:566

---

## 管理员函数

### 23. setExcluded() - 设置排除地址

**函数签名**:
```solidity
function setExcluded(address account, bool excluded) external onlyAdmin
```

**参数**:
- `account`: 要设置的地址
- `excluded`: `true` 排除, `false` 允许

**功能描述**:
将某个地址设置为不允许质押 (如营销地址、合约地址)

**权限**: `onlyAdmin` (SYI Token 合约 或 Owner)

**事件**:
- `AddressExcluded(address indexed account, bool excluded)`

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:578

---

### 24. emergencyWithdraw() - 紧急提款

**函数签名**:
```solidity
function emergencyWithdraw(address token, uint256 amount) external onlyAdmin
```

**参数**:
- `token`: 代币地址
- `amount`: 提款数量

**功能描述**:
紧急情况下将代币转移到 SYI Token 合约

**权限**: `onlyAdmin` (SYI Token 合约 或 Owner)

**目标地址**: SYI Token 合约 (syiContract)

**用途**:
- 紧急情况资金救援
- 错误转入代币的恢复

**代码位置**: contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:583

---

## 修饰符与错误定义

### 修饰符

#### onlyAdmin

```solidity
modifier onlyAdmin() {
    if (msg.sender != syiContract && msg.sender != owner())
        revert OnlyAdmin();
    _;
}
```

**权限**: SYI Token 合约 或 Owner

**用途**: 保护管理员函数

---

#### updateReward

```solidity
modifier updateReward(address account) {
    _updateRewardPool();
    if (account != address(0)) {
        _updateUserReward(account);
    }
    _;
}
```

**功能**: 在函数执行前自动更新奖励状态

**用途**: 所有涉及奖励计算的函数

---

### 自定义错误

| 错误 | 说明 |
|------|------|
| `OnlyAdmin()` | 非管理员调用 |
| `InvalidAddress()` | 无效地址 (零地址) |
| `InvalidAmount()` | 无效金额 (0 或超出范围) |
| `InsufficientStakeTime()` | 未满足最小质押时间 |
| `NoStakeFound()` | 没有质押记录 |
| `ExcludedFromStaking()` | 地址被排除在质押之外 |
| `TransferFailed()` | 代币转账失败 |

---

## 事件列表

| 事件 | 参数 | 触发时机 |
|------|------|----------|
| `Staked` | `user, amount, timestamp` | 用户质押时 |
| `Unstaked` | `user, amount, reward` | 用户解除质押时 |
| `RewardClaimed` | `user, reward` | 用户领取奖励时 |
| `RewardsDeposited` | `amount, newRewardRate` | 注入 USDT 奖励时 |
| `SYIRewardsAccumulated` | `syiAmount, totalAccumulated` | 注入 SYI 奖励时 |
| `SYISwappedToRewards` | `syiAmount, usdtAmount, newRewardRate` | SYI 兑换为 USDT 时 |
| `AddressExcluded` | `account, excluded` | 设置排除地址时 |

---

## 合约交互流程图

### 用户质押 LP 流程

```
用户
  ↓ approve(LiquidityStaking, amount)
LP Token
  ↓ stake(amount)
LiquidityStaking
  ├─ transferFrom(user, this, amount)  → LP Token
  ├─ 更新质押信息
  ├─ 更新奖励池
  ├─ triggerFundRelayDistribution()  → SYI Token
  └─ 如累积 SYI ≥ 10
       ├─ approve(Router, syiAmount)  → SYI Token
       ├─ swapExactTokens()  → PancakeRouter
       └─ 将 USDT 添加到奖励池
```

### SYI Token 注入奖励流程

```
用户交易 (买入/卖出 SYI)
  ↓
SYI Token (收取税费)
  ├─ 买入税 2% LP
  ├─ 卖出税 1.5% LP
  └─ 利润税 40%
       ↓
   累积到阈值
       ↓
SYI Token 调用 LiquidityStaking
  ├─ depositSYIRewards(累积的 SYI)  [LP 税费]
  └─ depositRewards(USDT)           [利润税]
       ↓
LiquidityStaking
  ├─ 接收代币
  ├─ 更新奖励池
  └─ 计算新的 rewardPerSecond (7天周期)
       ↓
所有 LP 质押者按权重获得奖励
```

### 用户领取奖励流程

```
用户
  ↓ claimReward()
LiquidityStaking
  ├─ 计算待领取奖励 (考虑权重)
  ├─ 更新奖励状态
  ├─ transfer(user, reward)  → USDT
  └─ emit RewardClaimed(user, reward)
```

---

## 关键参数配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 最小质押时间 | 24 hours | 主网配置 |
| 最小奖励金额 | 0.001 USDT | 低于此值不发放 |
| SYI 兑换阈值 | 10 SYI | 累积到此值触发兑换 |
| 奖励分配周期 | 7 days | 按 7 天均匀释放 |
| 最大权重 | 2x | 质押满 365 天 |
| 权重公式 | `1 + duration/365天` | 线性增长 |

---

## 安全机制

### 1. 重入保护

使用 OpenZeppelin 的 `ReentrancyGuard`，所有外部调用函数都添加了 `nonReentrant` 修饰符。

### 2. 权限控制

- `onlyAdmin`: 仅 SYI Token 合约或 Owner 可调用
- `Ownable`: 标准 Owner 权限管理

### 3. 地址验证

构造函数检查所有关键地址非零地址。

### 4. 金额验证

所有涉及金额的操作都检查 `amount > 0`。

### 5. 时间锁定

最小质押时间保护，防止闪电贷攻击。

### 6. 错误处理

- 使用自定义错误，节省 gas
- 兑换失败使用 `try-catch` 捕获

### 7. FeeOnTransfer 支持

兑换时使用余额差值计算实际到账，支持带交易税的代币。

---

## 常见问题

### Q1: 为什么 SYI 奖励不立即兑换?

A: 为了节省 gas 费用。每次兑换都需要调用 PancakeRouter，累积到 10 SYI 后批量兑换更高效。

### Q2: 权重如何影响奖励?

A: 权重越高，获得的奖励比例越大。质押时间越长，权重越高 (最高 2 倍)。

**示例**:
- 用户 A: 质押 100 LP，刚质押，权重 = 100
- 用户 B: 质押 50 LP，质押 365 天，权重 = 100
- 奖励分配: A 和 B 各获得 50%

### Q3: rewardPerSecond 如何计算?

A:
```solidity
rewardPerSecond = pendingRewards / 7 days
```
每次注入奖励时重新计算，确保在 7 天内均匀释放。

### Q4: 为什么要触发 FundRelay 分发?

A: FundRelay 是 SYI Token 的辅助合约，负责处理累积的税费。在质押/解除质押时触发，确保资金流转顺畅。

### Q5: emergencyWithdraw 有什么风险?

A: 管理员可以提取任何代币到 SYI Token 合约。这是为了应对紧急情况，但也需要用户信任项目方。

### Q6: 如何查看我的实时收益?

A: 调用 `getUserStakeInfo(yourAddress)`，查看 `pendingReward` 字段。

### Q7: 提前解除质押有惩罚吗?

A: 没有惩罚，但需要满足最小质押时间 (24 小时)。

---

## 审计要点

### 1. 奖励计算精度

- 使用 1e18 精度
- 权重计算考虑时间溢出
- 奖励分配避免除零错误

### 2. 状态同步

- `updateReward` 修饰符确保状态一致
- 缓存机制优化 gas 消耗

### 3. 外部调用安全

- `nonReentrant` 保护
- `try-catch` 处理兑换失败
- 使用余额差值计算实际到账

### 4. 权限管理

- 双重管理员 (SYI Token + Owner)
- 紧急提款地址固定为 SYI Token

### 5. 时间依赖

- 使用 `block.timestamp`，注意矿工操纵风险
- 最小质押时间作为安全缓冲

---

## 总结

LiquidityStaking 是一个设计精巧的 LP 质押合约，核心特点：

1. **权重系统**: 时间加权，激励长期持有
2. **延迟兑换**: 累积 SYI 批量兑换，节省 gas
3. **7 天释放**: 平滑奖励分配，避免冲击
4. **双重奖励来源**: LP 税费 (SYI) + 利润税 (USDT)
5. **安全机制**: 重入保护、权限控制、时间锁定

与 SYI Token 和 SYI-Staking 共同构成完整的 DeFi 生态。

---

**文档版本**: v1.0
**更新时间**: 2025-10-12
**合约版本**: Solidity 0.8.20
**作者**: Claude Code
