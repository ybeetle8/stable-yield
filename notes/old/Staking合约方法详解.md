# Staking 合约方法详解

## 目录
- [合约概述](#合约概述)
- [核心质押操作](#核心质押操作)
- [推荐系统](#推荐系统)
- [查询函数](#查询函数)
- [管理员函数](#管理员函数)
- [内部函数说明](#内部函数说明)
- [跨合约调用关系](#跨合约调用关系)

---

## 合约概述

**合约架构**:
- `Staking.sol`: 主网环境配置合约 (继承自 StakingBase)
- `StakingBase.sol`: 核心业务逻辑实现

**质押凭证**: sSYI (Staked SYI)
- 不可转账的 ERC20 代币
- 质押时铸造，解除质押时销毁
- 仅用于记录质押份额

**质押档位**:
| 档位索引 | 周期 | 总收益率 | 日化收益 |
|---------|------|----------|----------|
| 0 | 1天 | 0.3% | 0.3% |
| 1 | 7天 | 4.28% | 0.612% |
| 2 | 15天 | 16.1% | 1.073% |
| 3 | 30天 | 56.31% | 1.876% |

---

## 核心质押操作

### 1. stake()

```solidity
function stake(uint160 _amount, uint8 _stakeIndex) external onlyEOA
```

**功能**: 质押 USDT 并获得 sSYI 凭证

**参数**:
- `_amount`: 质押的 USDT 数量 (精度 18 位)
- `_stakeIndex`: 质押档位索引 (0-3)

**执行流程**:
1. 验证质押参数 (`_validateStakeParameters`)
   - 检查金额是否超过单次最大限额 (1000 USDT)
   - 检查用户总质押是否超过上限 (10000 USDT)
   - 检查是否超过网络流入限制
2. 执行 USDT → SYI 兑换并添加流动性 (`_swapAndAddLiquidity`)
   - 用 50% USDT 购买 SYI
   - 用剩余 50% USDT + 购买的 SYI 添加到 Pancake 流动性池
   - LP 代币销毁到地址 0
3. 铸造质押记录 (`_mintStakeRecord`)
   - 创建质押记录
   - 铸造 sSYI 凭证
   - 更新推荐人的团队投资额

**涉及的合约调用**:
- `IERC20(USDT).transferFrom()`: 从用户转入 USDT
- `ROUTER.swapExactTokensForTokensSupportingFeeOnTransferTokens()`: 兑换 USDT → SYI
- `ROUTER.addLiquidity()`: 添加流动性到 SYI/USDT Pair

**前置条件**:
- 必须已绑定推荐人 (`lockReferral`)
- USDT 授权给 Staking 合约

**事件**:
```solidity
emit Staked(user, _amount, block.timestamp, stakeIndex, stakePeriod);
```

---

### 2. unstake()

```solidity
function unstake(uint256 stakeIndex) external onlyEOA returns (uint256 totalReward)
```

**功能**: 解除质押并领取奖励

**参数**:
- `stakeIndex`: 要解除的质押记录索引

**执行流程**:
1. 销毁质押记录 (`_burn`)
   - 验证质押期限已满
   - 验证未被提取
   - 计算复利奖励
   - 标记为已提取
   - 销毁 sSYI
2. 兑换 SYI 为 USDT (`_swapSYIForReward`)
   - 从合约 SYI 余额中兑换为 USDT
   - 计算利息收益
3. 分发推荐奖励
   - 朋友奖励: 利息的 5% (`_distributeFriendReward`)
   - 团队奖励: 利息的最高 35% (`_distributeTeamReward`)
4. 收取赎回费
   - 从用户收益中扣除 1% 作为手续费
   - 转到 feeRecipient 地址
5. 更新团队投资额 (减少)
6. 回收使用的 SYI (`SYI.recycle()`)
7. 转账 USDT 给用户

**涉及的合约调用**:
- `ROUTER.swapTokensForExactTokens()`: SYI → USDT 精确兑换
- `IERC20(USDT).transfer()`: 分发 USDT 奖励
- `SYI.recycle()`: 回收使用的 SYI 代币

**返回值**:
- `totalReward`: 计算的总奖励金额 (SYI 计价)

**事件**:
```solidity
emit RewardPaid(user, calculatedReward, withdrawalTime, stakeIndex);
emit WithdrawalCompleted(...);
emit RedemptionFeeCollected(...);
emit TeamRewardDistributionCompleted(...);
```

**前置条件**:
- 质押期限已满
- 该笔质押未被提取

---

### 3. sync()

```solidity
function sync() external
```

**功能**: 同步流动性池储备金数据

**执行流程**:
1. 获取合约持有的 USDT 余额
2. 将 USDT 转入 SYI/USDT Pair
3. 调用 Pair 的 `sync()` 方法更新储备金

**涉及的合约调用**:
- `SYI.getUniswapV2Pair()`: 获取交易对地址
- `IERC20(USDT).transfer()`: 转账 USDT 到 Pair
- `IUniswapV2Pair(pair).sync()`: 同步储备金

**用途**:
- 修复流动性池储备金不一致问题
- 通常在异常情况下手动调用

---

## 推荐系统

### 4. lockReferral()

```solidity
function lockReferral(address _referrer) external
```

**功能**: 绑定推荐人（永久绑定，不可更改）

**参数**:
- `_referrer`: 推荐人地址（如果为 address(0) 则绑定到 rootAddress）

**执行流程**:
1. 验证用户未绑定过推荐人
2. 验证不能绑定自己
3. 验证推荐人有效性：
   - 如果不是 rootAddress，推荐人必须持有 > 1 ether 的 sSYI
4. 建立绑定关系：
   - 设置 `_referrals[user] = _referrer`
   - 添加到推荐人的子节点列表 `_children[_referrer]`
   - 标记为已绑定 `_hasLocked[user] = true`
5. 同步现有投资额到推荐链
   - 如果用户已有质押，将投资额累加到推荐链上的所有节点

**事件**:
```solidity
emit BindReferral(user, _referrer);
```

**前置条件**:
- 用户未绑定过推荐人
- 推荐人有效（持有 > 1 sSYI 或为 rootAddress）

---

### 5. lockFriend()

```solidity
function lockFriend(address _friend) external
```

**功能**: 绑定朋友关系（用于 5% 直推奖励）

**参数**:
- `_friend`: 朋友地址

**执行流程**:
1. 验证用户未绑定过朋友
2. 验证朋友地址有效
3. 验证不能绑定自己
4. 建立朋友关系：
   - 设置 `_friends[user] = _friend`

**事件**:
```solidity
emit BindFriend(user, _friend);
```

**说明**:
- 朋友关系与推荐关系独立
- 解除质押时，利息的 5% 会分配给朋友
- 如果未绑定朋友，5% 奖励会转给 rootAddress

---

### 6. getReferrals()

```solidity
function getReferrals(address _user, uint8 _maxDepth) public view returns (address[] memory)
```

**功能**: 获取推荐链（从用户向上追溯）

**参数**:
- `_user`: 查询的用户地址
- `_maxDepth`: 最大深度（合约限制 30 层）

**返回值**:
- `address[]`: 推荐链数组，从直接推荐人开始

**示例**:
```
用户 A → B → C → D → rootAddress
getReferrals(A, 3) = [B, C, D]
```

---

### 7. getReferral()

```solidity
function getReferral(address _user) public view returns (address)
```

**功能**: 获取直接推荐人

**参数**:
- `_user`: 查询的用户地址

**返回值**:
- `address`: 直接推荐人地址

---

### 8. getFriend()

```solidity
function getFriend(address user) public view returns (address)
```

**功能**: 获取绑定的朋友地址

**参数**:
- `user`: 查询的用户地址

**返回值**:
- `address`: 朋友地址

---

### 9. getReferralCount()

```solidity
function getReferralCount(address _user) external view returns (uint256)
```

**功能**: 获取直推人数

**参数**:
- `_user`: 查询的用户地址

**返回值**:
- `uint256`: 直推人数

---

### 10. isBindReferral()

```solidity
function isBindReferral(address _user) public view returns (bool)
```

**功能**: 检查是否已绑定推荐人

**参数**:
- `_user`: 查询的用户地址

**返回值**:
- `bool`: 是否已绑定

---

### 11. isPreacher()

```solidity
function isPreacher(address user) public view override returns (bool)
```

**功能**: 检查是否达到"传教士"资格

**参数**:
- `user`: 查询的用户地址

**返回值**:
- `bool`: 是否持有 >= 200 sSYI

**说明**:
- 传教士资格是获得团队奖励的必要条件
- 阈值: 200 sSYI (PREACHER_THRESHOLD)

---

## 查询函数

### 12. balanceOf()

```solidity
function balanceOf(address account) public view override returns (uint256 balance)
```

**功能**: 查询账户当前质押价值（包含复利）

**参数**:
- `account`: 查询的账户地址

**返回值**:
- `balance`: 当前质押总价值 (SYI 计价)

**计算方式**:
- 遍历所有未提取的质押记录
- 计算每笔质押的复利收益
- 累加求和

---

### 13. principalBalance()

```solidity
function principalBalance(address account) public view returns (uint256 balance)
```

**功能**: 查询账户本金余额（不含利息）

**参数**:
- `account`: 查询的账户地址

**返回值**:
- `balance`: 本金总额

**说明**:
- 仅统计未提取的质押本金
- 不包含复利收益

---

### 14. currentStakeValue()

```solidity
function currentStakeValue(address account) public view returns (uint256 currentValue)
```

**功能**: 查询账户当前质押价值（同 balanceOf）

**参数**:
- `account`: 查询的账户地址

**返回值**:
- `currentValue`: 当前质押总价值

---

### 15. earnedInterest()

```solidity
function earnedInterest(address account) public view returns (uint256 interest)
```

**功能**: 查询账户已赚取的利息

**参数**:
- `account`: 查询的账户地址

**返回值**:
- `interest`: 利息收益 = currentValue - principal

---

### 16. rewardOfSlot()

```solidity
function rewardOfSlot(address user, uint8 index) public view returns (uint256 reward)
```

**功能**: 查询指定质押记录的当前价值

**参数**:
- `user`: 用户地址
- `index`: 质押记录索引

**返回值**:
- `reward`: 该笔质押的当前价值（包含复利）

---

### 17. canWithdrawStake()

```solidity
function canWithdrawStake(address user, uint256 stakeIndex) public view returns (bool canWithdraw)
```

**功能**: 检查是否可以解除质押

**参数**:
- `user`: 用户地址
- `stakeIndex`: 质押记录索引

**返回值**:
- `canWithdraw`: 是否可以提取

**检查条件**:
- 质押记录存在
- 质押未被提取
- 质押期限已满

---

### 18. stakeCount()

```solidity
function stakeCount(address user) external view returns (uint256 count)
```

**功能**: 获取用户质押记录数量

**参数**:
- `user`: 用户地址

**返回值**:
- `count`: 质押记录总数

---

### 19. getUserInfo()

```solidity
function getUserInfo(address user) external view returns (
    uint128 totalStaked,
    uint128 teamKPI,
    address referrer,
    bool hasLockedReferral,
    bool isPreacherStatus
)
```

**功能**: 获取用户综合信息

**参数**:
- `user`: 用户地址

**返回值**:
- `totalStaked`: 当前质押总价值
- `teamKPI`: 团队总投资额
- `referrer`: 推荐人地址
- `hasLockedReferral`: 是否已绑定推荐人
- `isPreacherStatus`: 是否达到传教士资格

---

### 20. getUserStakeWithdrawalStatus()

```solidity
function getUserStakeWithdrawalStatus(address user) external view returns (
    uint256[] memory stakeIndices,
    bool[] memory canWithdrawArray,
    uint256[] memory timeRemaining
)
```

**功能**: 批量查询用户所有质押的提取状态

**参数**:
- `user`: 用户地址

**返回值**:
- `stakeIndices`: 质押索引数组
- `canWithdrawArray`: 是否可提取数组
- `timeRemaining`: 剩余锁定时间数组（秒）

---

### 21. getTeamKpi()

```solidity
function getTeamKpi(address _user) public view returns (uint256)
```

**功能**: 获取团队总投资额（KPI）

**参数**:
- `_user`: 用户地址

**返回值**:
- `uint256`: 团队累计投资额

**说明**:
- 包含直推和间推的所有投资
- 用于计算团队等级

---

### 22. getTeamPerformanceDetails()

```solidity
function getTeamPerformanceDetails(address _user) external view returns (
    uint256 totalTeamInvestment,
    uint256 teamMemberCount,
    uint8 currentTier,
    uint256 nextTierThreshold,
    uint256 progressToNextTier
)
```

**功能**: 获取团队绩效详细信息

**参数**:
- `_user`: 用户地址

**返回值**:
- `totalTeamInvestment`: 团队总投资额
- `teamMemberCount`: 直推人数
- `currentTier`: 当前等级 (V1-V7, 0表示无等级)
- `nextTierThreshold`: 下一级阈值
- `progressToNextTier`: 完成进度（百分比）

**团队等级阈值**:
| 等级 | 阈值 | 奖励率 |
|-----|------|--------|
| V1 | 10,000 SYI | 5% |
| V2 | 50,000 SYI | 10% |
| V3 | 200,000 SYI | 15% |
| V4 | 500,000 SYI | 20% |
| V5 | 1,000,000 SYI | 25% |
| V6 | 2,500,000 SYI | 30% |
| V7 | 5,000,000 SYI | 35% |

---

### 23. getMaxStakeAmount()

```solidity
function getMaxStakeAmount() external view returns (uint256 maxAmount)
```

**功能**: 查询当前可质押的最大金额

**返回值**:
- `maxAmount`: 最大可质押金额

**计算逻辑**:
1. 计算最近 1 分钟的网络流入量
2. 获取流动性池 USDT 储备的 1%
3. 如果流入量 > 1%，返回 0
4. 否则返回 min(剩余容量, 1000 USDT)

**说明**:
- 防止短时间内大量质押冲击流动性池
- 单次质押上限: 1000 USDT
- 网络流入限制: 池子的 1%

---

### 24. getRemainingStakeCapacity()

```solidity
function getRemainingStakeCapacity(address user) external view returns (uint256 remaining)
```

**功能**: 查询用户剩余可质押额度

**参数**:
- `user`: 用户地址

**返回值**:
- `remaining`: 剩余额度

**说明**:
- 用户总质押上限: 10,000 USDT
- 剩余额度 = 10,000 - 当前本金

---

### 25. getStakePeriods()

```solidity
function getStakePeriods() external pure returns (uint256[4] memory periods)
```

**功能**: 获取所有质押周期

**返回值**:
- `periods`: 质押周期数组 [1 day, 7 days, 15 days, 30 days]

---

### 26. getTeamRewardThresholds()

```solidity
function getTeamRewardThresholds() external pure returns (uint256[7] memory thresholds)
```

**功能**: 获取团队奖励等级阈值

**返回值**:
- `thresholds`: V1-V7 的阈值数组

---

### 27. getTeamRewardRates()

```solidity
function getTeamRewardRates() external pure returns (uint256[7] memory rewardRates)
```

**功能**: 获取团队奖励比例

**返回值**:
- `rewardRates`: V1-V7 的奖励比例数组 [5, 10, 15, 20, 25, 30, 35]

---

### 28. getSlippageConfig()

```solidity
function getSlippageConfig() external pure returns (
    uint256 baseSlippage,
    uint256 maxSlippage,
    uint256 priceImpactThreshold
)
```

**功能**: 获取滑点配置参数

**返回值**:
- `baseSlippage`: 基础滑点容忍度 15% (1500/10000)
- `maxSlippage`: 最大滑点容忍度 20% (2000/10000)
- `priceImpactThreshold`: 价格冲击阈值 2% (200/10000)

---

### 29. previewStakeOutput()

```solidity
function previewStakeOutput(uint256 usdtAmount) external view returns (
    uint256 halfUsdtAmount,
    uint256 expectedSYI,
    uint256 minSYIOut
)
```

**功能**: 预览质押时的 SYI 购买情况

**参数**:
- `usdtAmount`: 质押的 USDT 数量

**返回值**:
- `halfUsdtAmount`: 用于购买 SYI 的 USDT 数量（50%）
- `expectedSYI`: 预期获得的 SYI 数量
- `minSYIOut`: 考虑滑点后的最小 SYI 数量

**说明**:
- 用于前端展示质押预览
- 帮助用户了解兑换比例

---

### 30. getWithdrawalHistory()

```solidity
function getWithdrawalHistory(address user) external view returns (WithdrawalRecord[] memory)
```

**功能**: 获取用户提取历史记录

**参数**:
- `user`: 用户地址

**返回值**:
- `WithdrawalRecord[]`: 提取记录数组

**WithdrawalRecord 结构**:
```solidity
struct WithdrawalRecord {
    uint40 withdrawalTime;      // 提取时间
    uint256 stakeIndex;          // 质押索引
    uint256 principalAmount;     // 本金
    uint256 calculatedReward;    // 计算的奖励
    uint256 usdtReceived;        // 兑换获得的 USDT
    uint256 syiTokensUsed;       // 使用的 SYI 数量
    uint256 referralFee;         // 推荐奖励
    uint256 teamFee;             // 团队奖励
    uint256 userPayout;          // 用户实际收到
    uint256 interestEarned;      // 利息收益
}
```

---

### 31. getNetworkInflow() / network1In()

```solidity
function getNetworkInflow() external view returns (uint256 value)
function network1In() external view returns (uint256 value)
```

**功能**: 获取最近 1 分钟的网络流入量

**返回值**:
- `value`: 流入量（sSYI 铸造量）

**说明**:
- 两个函数功能相同
- 用于限制短时间内的大额质押

---

## 管理员函数

### 32. setSYI()

```solidity
function setSYI(address _syi) external onlyOwner
```

**功能**: 设置 SYI 代币合约地址

**参数**:
- `_syi`: SYI 代币合约地址

**执行流程**:
1. 验证地址有效
2. 设置 SYI 合约
3. 授权 Router 使用 SYI（无限额度）

**涉及的合约调用**:
- `SYI.approve(ROUTER, type(uint256).max)`

**事件**:
```solidity
emit SYIContractSet(_syi);
```

---

### 33. setRootAddress()

```solidity
function setRootAddress(address _rootAddress) external onlyOwner
```

**功能**: 设置根地址

**参数**:
- `_rootAddress`: 新的根地址

**说明**:
- rootAddress 是推荐链的顶端
- 未绑定推荐人时默认绑定到 rootAddress
- 未分配的奖励会发送到 rootAddress

---

### 34. setFeeRecipient()

```solidity
function setFeeRecipient(address _feeRecipient) external onlyOwner
```

**功能**: 设置手续费接收地址

**参数**:
- `_feeRecipient`: 手续费接收地址

**说明**:
- 赎回手续费（1%）会发送到该地址

**事件**:
```solidity
emit FeeRecipientUpdated(oldRecipient, _feeRecipient);
```

---

### 35. emergencyWithdrawSYI()

```solidity
function emergencyWithdrawSYI(address to, uint256 _amount) external onlyOwner
```

**功能**: 紧急提取 SYI 代币

**参数**:
- `to`: 接收地址
- `_amount`: 提取数量

**涉及的合约调用**:
- `SYI.transfer(to, _amount)`

**说明**:
- 仅用于紧急情况
- 管理员特权函数

---

### 36. emergencyWithdrawUSDT()

```solidity
function emergencyWithdrawUSDT(address to, uint256 _amount) external onlyOwner
```

**功能**: 紧急提取 USDT

**参数**:
- `to`: 接收地址
- `_amount`: 提取数量

**涉及的合约调用**:
- `IERC20(USDT).transfer(to, _amount)`

---

## 内部函数说明

### _calculateStakeReward()

**功能**: 计算质押的复利奖励

**计算公式**:
```
currentReward = principal × (1 + APY)^n
```

其中:
- `principal`: 本金
- `APY`: 日化收益率
- `n`: 复利周期数（主网按天计算）

**使用库**: PRB Math (UD60x18) 高精度数学运算

**示例**:
```
本金: 100 USDT
档位: 30天 (APY = 1.876% 日化)
复利计算: 100 × (1.01876)^30 = 156.31 USDT
```

---

### _distributeFriendReward()

**功能**: 分发朋友奖励（5%）

**执行流程**:
1. 计算奖励: `interest × 5%`
2. 如果用户绑定了朋友，转账给朋友
3. 否则转账给 rootAddress

**涉及的合约调用**:
- `IERC20(USDT).transfer()`

---

### _distributeTeamReward()

**功能**: 分发团队奖励（差额分配，最高 35%）

**分配机制**:
- 采用**严格差额分配**模式
- 从用户向上遍历推荐链
- 每个等级只分配一次，分配差额部分

**示例**:
```
推荐链: A(V3) ← B(V5) ← C(V7)
利息: 1000 USDT
团队奖励池: 1000 × 35% = 350 USDT

分配:
- A (V3): 15% = 150 USDT
- B (V5): 25% - 15% = 10% = 100 USDT
- C (V7): 35% - 25% = 10% = 100 USDT
总分配: 350 USDT
```

**必要条件**:
- 推荐人必须达到传教士资格（持有 >= 200 sSYI）
- 推荐人团队 KPI 达到对应等级阈值

**涉及的合约调用**:
- `IERC20(USDT).transfer()`

**事件**:
```solidity
emit StrictDifferentialRewardPaid(...);
emit TeamRewardDistributionCompleted(...);
emit PreacherCheckFailed(...);  // 未达到传教士资格时触发
```

---

### _swapAndAddLiquidity()

**功能**: 质押时的 USDT 兑换和流动性添加

**执行流程**:
1. 从用户转入 USDT
2. 用 50% USDT 购买 SYI
   - 使用 `swapExactTokensForTokensSupportingFeeOnTransferTokens`
   - 支持 SYI 的买入税（3%）
   - 计算滑点保护
3. 用剩余 50% USDT + 购买的 SYI 添加流动性
   - LP 代币销毁到 address(0)

**涉及的合约调用**:
- `IERC20(USDT).transferFrom()`
- `ROUTER.swapExactTokensForTokensSupportingFeeOnTransferTokens()`
- `ROUTER.addLiquidity()`

**滑点保护**:
- 基础滑点: 15%
- 最大滑点: 20%
- 根据价格冲击动态调整

---

### _swapSYIForReward()

**功能**: 解除质押时的 SYI → USDT 兑换

**执行流程**:
1. 记录合约的 SYI 和 USDT 余额
2. 使用 `swapTokensForExactTokens` 精确兑换
   - 兑换指定数量的 USDT
   - 最大 SYI 输入量有保护机制
3. 计算实际使用的 SYI 数量和获得的 USDT

**涉及的合约调用**:
- `ROUTER.swapTokensForExactTokens()`

**保护机制**:
- 最大 SYI 输入量限制（防止过度消耗）
- 考虑储备金比例，避免极端价格冲击

---

### _calculateMinimumOutput()

**功能**: 计算滑点保护后的最小输出

**计算逻辑**:
1. 获取流动性池储备金
2. 计算预期输出
3. 计算价格冲击
4. 根据价格冲击调整滑点容忍度
5. 扣除 SYI 买入税（3%）
6. 应用滑点保护

**公式**:
```
minOutput = expectedOutput × (1 - buyFee) × (1 - slippage)
```

---

### _updateTeamInvestmentValues()

**功能**: 更新推荐链上所有节点的团队投资额

**执行流程**:
1. 获取用户的推荐链
2. 遍历推荐链，更新每个节点的 `teamTotalInvestValue`
3. 支持增加和减少操作

**触发时机**:
- 质押时: 增加团队投资额
- 解除质押时: 减少团队投资额

---

### _validateStakeParameters()

**功能**: 验证质押参数

**检查项**:
1. 金额不超过网络流入限制（动态计算）
2. 质押档位索引有效（0-3）
3. 用户总质押不超过上限（10,000 USDT）

**错误类型**:
- `ExceedsMaxStakeAmount()`: 超过单次限额
- `InvalidStakeIndex()`: 无效档位
- `ExceedsUserTotalStakeLimit()`: 超过总限额

---

## 跨合约调用关系

### Staking → SYI Token

| 方法 | 调用时机 | 功能 |
|-----|---------|------|
| `SYI.approve()` | setSYI() | 授权 Router 使用 SYI |
| `SYI.balanceOf()` | unstake(), _swapSYIForReward() | 查询 SYI 余额 |
| `SYI.transfer()` | emergencyWithdrawSYI() | 紧急提取 |
| `SYI.recycle()` | unstake() | 回收使用的 SYI |
| `SYI.getUniswapV2Pair()` | sync(), 各种兑换 | 获取交易对地址 |
| `SYI.getUSDTReserve()` | maxStakeAmount() | 获取 USDT 储备金 |

---

### Staking → PancakeRouter

| 方法 | 调用时机 | 功能 |
|-----|---------|------|
| `ROUTER.swapExactTokensForTokensSupportingFeeOnTransferTokens()` | stake() | USDT → SYI |
| `ROUTER.swapTokensForExactTokens()` | unstake() | SYI → USDT (精确) |
| `ROUTER.addLiquidity()` | stake() | 添加流动性 |
| `ROUTER.getAmountOut()` | previewStakeOutput(), _calculateMinimumOutput() | 预计算兑换输出 |

---

### Staking → USDT

| 方法 | 调用时机 | 功能 |
|-----|---------|------|
| `IERC20(USDT).transferFrom()` | stake() | 从用户转入 USDT |
| `IERC20(USDT).transfer()` | unstake(), 分发奖励 | 转账 USDT |
| `IERC20(USDT).balanceOf()` | sync(), _swapSYIForReward() | 查询余额 |
| `IERC20(USDT).approve()` | constructor | 授权 Router |

---

### Staking → PancakePair

| 方法 | 调用时机 | 功能 |
|-----|---------|------|
| `IUniswapV2Pair.getReserves()` | 各种兑换计算 | 获取储备金 |
| `IUniswapV2Pair.token0()` | 储备金查询 | 判断代币顺序 |
| `IUniswapV2Pair.sync()` | sync() | 同步储备金 |

---

## 核心数据结构

### Record（质押记录）

```solidity
struct Record {
    uint40 stakeTime;      // 质押时间
    uint160 amount;        // 本金数量
    bool status;           // 是否已提取
    uint8 stakeIndex;      // 质押档位 (0-3)
}
```

### RecordTT（总供应记录）

```solidity
struct RecordTT {
    uint40 stakeTime;      // 记录时间
    uint160 tamount;       // 总供应量快照
}
```

### TeamTier（团队等级）

```solidity
struct TeamTier {
    uint256 threshold;     // 阈值
    uint256 rewardRate;    // 奖励率
}
```

---

## 关键常量

| 常量 | 值 | 说明 |
|-----|---|------|
| BASIS_POINTS_DENOMINATOR | 10000 | 基点分母 |
| PERCENTAGE_BASE | 100 | 百分比基数 |
| PREACHER_THRESHOLD | 200 ether | 传教士阈值 |
| REFERRAL_REWARD_RATE | 5 | 推荐奖励率 5% |
| MAX_STAKE_LIMIT | 1000 ether | 单次最大质押 |
| MAX_USER_TOTAL_STAKE | 10000 ether | 用户总质押上限 |
| MAX_REFERRAL_DEPTH | 30 | 最大推荐深度 |
| MAX_TEAM_REWARD_RATE | 35 | 最大团队奖励率 35% |
| REDEMPTION_FEE_RATE | 100 | 赎回手续费 1% |
| NETWORK_CHECK_INTERVAL | 1 minutes | 网络检查间隔 |
| BASE_SLIPPAGE_TOLERANCE | 1500 | 基础滑点 15% |
| MAX_SLIPPAGE_TOLERANCE | 2000 | 最大滑点 20% |

---

## 权限控制

### onlyOwner

**可调用的方法**:
- `setSYI()`
- `setRootAddress()`
- `setFeeRecipient()`
- `emergencyWithdrawSYI()`
- `emergencyWithdrawUSDT()`

### onlyEOA

**可调用的方法**:
- `stake()`
- `unstake()`

**说明**:
- 仅限外部账户（EOA）调用
- 防止合约调用（防止闪电贷攻击）
- 测试网可关闭检查

---

## 安全机制

### 1. 质押限制
- ✅ 单次质押上限: 1000 USDT
- ✅ 用户总质押上限: 10,000 USDT
- ✅ 网络流入限制: 池子 1% / 分钟
- ✅ 必须绑定推荐人才能质押

### 2. 滑点保护
- ✅ 基础滑点 15%，最大滑点 20%
- ✅ 根据价格冲击动态调整
- ✅ 考虑 SYI 买入税（3%）

### 3. 提取保护
- ✅ 质押期限验证
- ✅ 防止重复提取
- ✅ 1% 赎回手续费

### 4. 推荐系统保护
- ✅ 推荐关系永久绑定，不可更改
- ✅ 推荐人必须持有 >= 1 sSYI
- ✅ 防止自己推荐自己
- ✅ 团队奖励需要传教士资格（>= 200 sSYI）

### 5. 紧急措施
- ✅ 管理员可紧急提取代币
- ✅ 流动性池同步功能（修复储备金不一致）

---

## 事件列表

| 事件 | 触发时机 |
|-----|---------|
| `Staked` | 质押成功 |
| `RewardPaid` | 解除质押并领取奖励 |
| `WithdrawalCompleted` | 提取完成（详细信息） |
| `BindReferral` | 绑定推荐人 |
| `BindFriend` | 绑定朋友 |
| `Transfer` | sSYI 铸造/销毁 |
| `StakingRatesUpdated` | 更新质押利率 |
| `SYIContractSet` | 设置 SYI 合约 |
| `TeamRewardDistributionCompleted` | 团队奖励分配完成 |
| `StrictDifferentialRewardPaid` | 差额奖励支付 |
| `PreacherCheckFailed` | 传教士资格检查失败 |
| `RedemptionFeeCollected` | 赎回手续费收取 |
| `FeeRecipientUpdated` | 手续费接收地址更新 |

---

## 使用流程示例

### 完整质押流程

```javascript
// 1. 绑定推荐人
staking.lockReferral(referrerAddress);

// 2. （可选）绑定朋友
staking.lockFriend(friendAddress);

// 3. 授权 USDT
usdt.approve(stakingAddress, amount);

// 4. 质押（选择 30 天档位）
staking.stake(1000e18, 3);  // 质押 1000 USDT

// 5. 等待 30 天...

// 6. 检查是否可提取
bool canWithdraw = staking.canWithdrawStake(userAddress, 0);

// 7. 解除质押
staking.unstake(0);

// 用户收到: 本金 + 利息 - 朋友奖励(5%) - 团队奖励(最高35%) - 赎回费(1%)
```

### 团队奖励示例

```javascript
// 推荐链: User ← A(V3) ← B(V5) ← C(V7)
// User 解除质押，利息 1000 USDT

// 团队奖励分配:
// - Friend: 50 USDT (5%)
// - A (V3): 150 USDT (15%)
// - B (V5): 100 USDT (25% - 15% = 10%)
// - C (V7): 100 USDT (35% - 25% = 10%)
// - User: 600 USDT (余下部分)

// 前提条件:
// - A、B、C 都必须持有 >= 200 sSYI (传教士资格)
// - A 的团队 KPI >= 200,000 SYI (V3)
// - B 的团队 KPI >= 1,000,000 SYI (V5)
// - C 的团队 KPI >= 5,000,000 SYI (V7)
```

---

## 与其他合约的关系

### Staking ↔ SYI Token

**Staking 依赖 SYI**:
- 质押时购买 SYI 并添加流动性
- 解除质押时兑换 SYI 为 USDT
- 调用 `SYI.recycle()` 回收代币

**SYI 不依赖 Staking** (独立运行)

---

### Staking ↔ LiquidityStaking

**关系**: 推荐系统共享
- LiquidityStaking 质押 LP 时，也会查询 Staking 的推荐关系
- 推荐人的团队 KPI 包含两个合约的投资总和

**数据流向**:
```
Staking ← 查询推荐关系 ← LiquidityStaking
```

---

## 常见问题

### Q1: 为什么质押时要添加流动性？

A:
- 质押 USDT 后，50% 用于购买 SYI，50% 保留 USDT
- 将 SYI + USDT 添加到流动性池，增加池子深度
- LP 代币销毁到 address(0)，永久锁定流动性
- 这样可以减少价格波动，保护生态稳定

### Q2: 复利是如何计算的？

A:
- 使用 PRB Math 库进行高精度数学运算
- 公式: `principal × (1 + dailyAPY)^days`
- 主网按天复利，测试网可按分钟复利
- 质押期限到达后，收益封顶，不再增长

### Q3: 团队奖励的差额分配是什么意思？

A:
- 每个等级只分配一次奖励
- 分配的是**差额部分**，而不是全额
- 例如: V5 获得 25% - 15% = 10%，而不是完整的 25%
- 这样可以防止重复分配，确保总奖励不超过 35%

### Q4: 为什么需要传教士资格？

A:
- 传教士资格（持有 >= 200 sSYI）证明推荐人自己也有投资
- 防止只推荐不投资的"羊毛党"
- 确保推荐人对生态有贡献

### Q5: 赎回手续费用在哪里？

A:
- 1% 赎回手续费发送到 `feeRecipient` 地址
- 手续费从用户的收益中扣除，不影响本金
- 用于支付合约运营成本

### Q6: 如何查询我的团队绩效？

A:
```javascript
const details = await staking.getTeamPerformanceDetails(myAddress);
console.log(`团队投资: ${details.totalTeamInvestment}`);
console.log(`当前等级: V${details.currentTier}`);
console.log(`下一级进度: ${details.progressToNextTier}%`);
```

---

**文档版本**: v1.0
**更新时间**: 2025-10-12
**合约版本**: Solidity 0.8.20
**网络**: BSC 主网
