# LiquidityStaking 合约方法详解（基于主网实现）

参考：`notes/SYI三合约关系说明.md`

本文档详细说明以下两个文件中的每个方法的用途、参数、返回值、状态变化、事件、以及与其他合约的交互方式：
- `contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol`
- `contracts/LiquidityStaking/mainnet/LiquidityStaking.sol`

> 简述：本合约支持用户质押 SYI/USDT LP 代币，按照“金额 × 时间权重”的机制获得 USDT 奖励。USDT 奖励来自：SYI 税费累积兑换、利润税注入或外部直接注入。

---

## 一、核心设计与访问控制

- 权限控制
  - `onlyAdmin`: 仅 `syiContract` 或 `owner()` 可调用。
  - `updateReward(account)`: 在变更前更新全局奖励指标，并更新指定用户的应计奖励。
- 奖励分配
  - 每次注入 USDT（或由 SYI 兑换得到 USDT）后，以 7 天线性释放：`rewardPerSecond = pendingRewards / 7 days`。
- 权重公式（时间加权）
  - `weight = amount × (1 + duration / 365 days)`（一年后约 2 倍权重，上限由时间自然限制）。
- 主网最小质押时间
  - `getMinStakeDuration()`（主网重写）：24 小时。

---

## 二、状态变量、事件、错误（简要）

- 关键地址与接口
  - `syiContract`: SYI 代币地址（同时具备管理权限）。
  - `usdt`: USDT 地址。
  - `lpToken`: SYI/USDT LP Token 地址。
  - `staking`: `IStaking` 接口（当前版本未直接使用，预留与单币质押合约交互）。
  - `router`: UniswapV2/PancakeV2 Router（用于 SYI→USDT 兑换）。
- 全局常量
  - `MIN_REWARD_AMOUNT = 1000`（最小可领取奖励阈值；实际单位与 USDT 小数位相关）。
- 累积与池
  - `accumulatedSYI`: 待兑换的 SYI 累积量（达到阈值后批量兑换）。
  - `rewardPool`: 奖励池信息（总奖励、每秒释放、总质押、已分发、待分发等）。
- 用户映射
  - `stakes[user]`: 质押信息（amount、stakeTime、lastRewardTime、accumulatedReward）。
  - `userRewardPerTokenPaid[user]`、`userPendingRewards[user]`: 按用户记录的奖励进度和待领奖励。
- 事件（部分）
  - `Staked`、`Unstaked`、`RewardClaimed`、`RewardsDeposited`、`SYIRewardsAccumulated`、`SYISwappedToRewards`、`AddressExcluded`。
- 错误（部分）
  - `OnlyAdmin`、`InvalidAddress`、`InvalidAmount`、`InsufficientStakeTime`、`NoStakeFound`、`ExcludedFromStaking`、`TransferFailed`。

---

## 三、外部/公开函数详解（LiquidityStakingBase）

### 1) constructor(usdt, syiContract, lpToken, staking, marketingAddress, admin, router)
- 功能：设置核心地址，初始化所有者，标记部分地址为不参与质押，初始化奖励时间戳。
- 参数：
  - `_usdt`：USDT 合约地址。
  - `_syiContract`：SYI 合约地址（作为管理员之一）。
  - `_lpToken`：SYI/USDT LP 合约地址。
  - `_staking`：单币质押合约地址（IStaking）。
  - `_marketingAddress`：营销地址（默认排除出质押）。
  - `_admin`：合约 owner。
  - `_router`：UniswapV2/PancakeV2 Router 地址。
- 外部交互：无（仅地址检查）。
- 事件：如果提供了 `marketingAddress`，会触发一次 `AddressExcluded`；同时将 `address(this)`、`syiContract` 加入排除并触发事件。

### 2) stake(uint256 amount)
- 功能：用户质押 LP 代币，开始计权重、累积奖励；末尾尝试处理累积 SYI。
- 参数：
  - `amount`：LP 代币数量。
- 前置检查：`amount > 0`，调用者未被 `excludedFromStaking` 排除。
- 状态变化：
  - 从用户转入 `lpToken`。
  - 初次质押用户写入 `stakeTime/lastRewardTime`，并初始化其奖励计数指针；累计质押额、全局总质押。
  - 更新缓存的总权重。
- 外部交互：
  - `IERC20(lpToken).transferFrom(user, this, amount)` 转账 LP。
  - 末尾 `_processAccumulatedSYI()`：可能触发 `ISYI.triggerFundRelayDistribution()`，并在阈值达成时调用 DEX 将 SYI→USDT。
- 事件：`Staked`。

### 3) unstake(uint256 amount)
- 功能：用户解押部分或全部 LP；若有可领奖励则先发放；末尾尝试处理累积 SYI。
- 参数：
  - `amount`：要解押的 LP 数量。
- 前置检查：
  - 用户有质押；`0 < amount <= user.amount`；当前时间 ≥ `stakeTime + minStakeDuration`。
- 状态变化：
  - 计算并发放待领奖励（从 `pendingRewards` 扣减，增加 `distributedRewards`）。
  - 减少用户质押与全局总质押；如归零则从 `stakers` 列表移除。
  - 更新缓存的总权重。
- 外部交互：
  - `IERC20(usdt).transfer(user, reward)` 发放 USDT 奖励（如有）。
  - `IERC20(lpToken).transfer(user, amount)` 返还 LP。
  - 末尾 `_processAccumulatedSYI()`（见上）。
- 事件：`Unstaked(user, amount, reward)`。

### 4) claimReward()
- 功能：领取当前应计的 USDT 奖励；末尾尝试处理累积 SYI。
- 前置检查：
  - `reward = _calculatePendingReward(user)`；当 `reward < MIN_REWARD_AMOUNT` 时直接返回不发放。
- 状态变化：
  - 将奖励计入用户 `accumulatedReward`；从 `pendingRewards` 扣减，相应增加 `distributedRewards`。
- 外部交互：
  - `IERC20(usdt).transfer(user, reward)` 发放 USDT。
  - 末尾 `_processAccumulatedSYI()`。
- 事件：`RewardClaimed(user, reward)`。

### 5) depositRewards(uint256 amount)  [onlyAdmin]
- 功能：管理员（`owner` 或 `syiContract`）直接注入 USDT 奖励；立即按 7 天重算 `rewardPerSecond`。
- 参数：
  - `amount`：USDT 数量（从调用者转入）。
- 外部交互：
  - `IERC20(usdt).transferFrom(msg.sender, this, amount)`。
- 状态变化：
  - 增加 `totalRewards`、`pendingRewards`；`rewardPerSecond = pendingRewards / 7 days`。
- 事件：`RewardsDeposited(amount, rewardPerSecond)`。

### 6) depositSYIRewards(uint256 syiAmount)  [onlyAdmin]
- 功能：管理员（通常是 `syiContract`）注入 SYI 到本合约，仅累积到 `accumulatedSYI`，不立刻兑换；兑换会在用户操作或后续触发时批量进行。
- 参数：
  - `syiAmount`：注入的 SYI 数量。
- 外部交互：
  - `IERC20(syiContract).transferFrom(msg.sender, this, syiAmount)`。
- 状态变化：
  - `accumulatedSYI += syiAmount`。
- 事件：`SYIRewardsAccumulated(syiAmount, accumulatedSYI)`。

### 7) getUserStakeInfo(address account) → (stakedAmount, stakeTime, pendingReward, accumulatedReward, weight)
- 功能：查询用户质押与奖励状态以及当前权重。
- 计算：`pendingReward = 已积累 + 新增应计`；`weight` 以“当前时间 - stakeTime”为 duration 计算。
- 外部交互：无。

### 8) getRewardPoolInfo() → (totalRewards, rewardPerSecond, totalStaked, totalWeight, stakersCount, distributedRewards, pendingRewards)
- 功能：查询奖励池信息；`totalWeight` 会根据当前时间动态计算（非缓存值）。
- 外部交互：无。

### 9) getStakersCount() → uint256
- 功能：返回当前活跃质押地址数量。
- 外部交互：无。

### 10) canUnstake(address account) → bool
- 功能：检查是否已达最小质押时间（主网 24h）。
- 外部交互：无。

### 11) canWithdrawStake(address account) → (canWithdraw, stakedAmount, timeRemaining)
- 功能：返回当前是否可解押、质押数量和剩余时间（秒）。
- 外部交互：无。

### 12) getMinStakeDurationExternal() → uint256
- 功能：对外暴露环境最小质押时长（内部由子合约重写）。
- 外部交互：无。

### 13) setExcluded(address account, bool excluded)  [onlyAdmin]
- 功能：将指定地址加入/移除“不能参与质押”名单（例如营销地址、系统地址）。
- 事件：`AddressExcluded(account, excluded)`。

### 14) emergencyWithdraw(address token, uint256 amount)  [onlyAdmin]
- 功能：紧急转出任意代币至 `syiContract`（风控/应急使用）。
- 外部交互：`IERC20(token).transfer(syiContract, amount)`。

---

## 四、内部函数与算法（LiquidityStakingBase）

> 这些函数不对外开放，但理解其作用有助于掌握奖励如何计算与发放。

### A) _calculateWeight(amount, duration) → uint256
- 功能：计算时间加权后的权重，公式：`amount × (1 + duration/365d)`。

### B) _updateRewardPool()
- 功能：将 `rewardPerTokenStored` 滚动至当前时刻，并刷新 `lastUpdateTime`。

### C) _rewardPerToken() → uint256
- 功能：查看若从 `lastUpdateTime` 到当前的增量，基于 `rewardPerSecond` 与 `totalStaked` 推进 `rewardPerTokenStored`。

### D) _updateUserReward(account)
- 功能：把用户从上次结算到当前的新增应计值累加进 `userPendingRewards[account]`，并推进其 `userRewardPerTokenPaid` 指针。

### E) _calculateEarnedRewards(account, currentRewardPerToken) → uint256
- 功能：以 `rewardPerToken` 增量和用户当前“时间加权”进行线性计算新增收益。

### F) _calculatePendingReward(account) → uint256
- 功能：返回 `userPendingRewards + 刚刚新计算的新增应计`。

### G) _calculateCurrentTotalWeight() → uint256
- 功能：遍历 `stakers` 动态计算当前所有人加权之和（用于查询）；同时有缓存机制减少重复计算。

### H) _updateCachedTotalWeight()
- 功能：基于当前时间刷新缓存的总权重与时间戳。

### I) _removeStaker(account)
- 功能：当用户清空质押后，从 `stakers` 列表 O(1) 删除其地址。

### J) _processAccumulatedSYI()
- 功能：
  1. 尝试触发 `ISYI(syiContract).triggerFundRelayDistribution()`，推进 SYI 侧资金中继的分发。
  2. 若 `accumulatedSYI >= 10 ether`（以 18 位为单位计数 SYI），则把累积的 SYI 一次性兑换为 USDT：
     - 调用 `_swapSYIForUSDT(syiToSwap)`；
     - 按结果增加 `totalRewards`、`pendingRewards`；
     - 重新设置 `rewardPerSecond = pendingRewards / 7 days`；
     - 触发 `SYISwappedToRewards` 事件。

### K) _swapSYIForUSDT(syiAmount) → usdtAmount
- 功能：通过 `router.swapExactTokensForTokensSupportingFeeOnTransferTokens` 将 SYI 兑换为 USDT。
- 路径：`[syiContract, usdt]`；最小接收量为 0（接受任意滑点）。
- 失败处理：捕获异常，失败时返回 0。

---

## 五、主网实现（LiquidityStaking）

文件：`contracts/LiquidityStaking/mainnet/LiquidityStaking.sol`

### 仅重写环境参数
- `getMinStakeDuration()`：返回 `24 hours`（主网最小质押时间）。
- 构造函数：直接把参数透传给 `LiquidityStakingBase`。

---

## 六、与其他合约的交互关系（逐方法标注）

- stake / unstake / claimReward
  - 与 `IERC20(usdt)`：发放奖励（USDT）。
  - 与 `IERC20(lpToken)`：接收/返还 LP。
  - 末尾调用 `_processAccumulatedSYI()`：
    - `ISYI(syiContract).triggerFundRelayDistribution()`（try/catch 忽略失败）。
    - `router.swapExactTokensForTokensSupportingFeeOnTransferTokens`（当累积 SYI 达阈值）。
- depositRewards（onlyAdmin）
  - 与 `IERC20(usdt)`：从管理员地址 `transferFrom` 注入 USDT。
- depositSYIRewards（onlyAdmin）
  - 与 `IERC20(syiContract)`：从管理员地址 `transferFrom` 注入 SYI，累积等待批量兑换。
- emergencyWithdraw（onlyAdmin）
  - 与 `IERC20(token)`：将任意代币转给 `syiContract`。

> 注：`staking`（`IStaking`）字段当前版本未调用；保留用于后续与单币质押合约联动（如推荐信息或团队奖励的查询/同步）。

---

## 七、常见调用场景与建议

- 用户质押
  1) 用户先在 DEX 添加流动性得到 LP；
  2) `lpToken.approve(liquidityStaking, amount)`；
  3) 调用 `stake(amount)`；开始计权和应计奖励。

- 用户领取奖励或解押
  - `claimReward()`：若奖励 ≥ 最小阈值则发放；
  - `unstake(amount)`：需满足 24 小时最小质押时间；会在返还 LP 前发放奖励。

- 协议注入奖励
  - `depositRewards(usdtAmount)`：直接注入 USDT，立刻计入 7 天释放；
  - `depositSYIRewards(syiAmount)`：先累积，延后在用户操作时批量兑换，有利于减少频繁兑换的 Gas。

---

## 八、边界与注意事项

- 最小奖励阈值的单位需与目标 USDT 的小数位一致；BSC 上 USDT 常见为 18 位，`MIN_REWARD_AMOUNT=1000` 对应 1e-15 USDT；请部署前确认实际 USDT 小数位并按需调整常量。
- 兑换路径固定为 `SYI -> USDT`，最小接收额为 0，可能遭遇滑点与 MEV；建议在上层控制调用频率与阈值（合约内阈值为 `10 ether` SYI）。
- `onlyAdmin` 包含 `syiContract` 与 `owner()`；确保 `syiContract` 地址可靠，否则可能影响管理面调用。
- `staking` 字段未用到，不影响当前逻辑，但需保持地址正确以便后续扩展。

---

## 九、函数清单速览（签名）

- 用户接口
  - `stake(uint256 amount)`
  - `unstake(uint256 amount)`
  - `claimReward()`
  - `getUserStakeInfo(address)`、`getRewardPoolInfo()`、`getStakersCount()`
  - `canUnstake(address)`、`canWithdrawStake(address)`、`getMinStakeDurationExternal()`

- 管理接口（onlyAdmin）
  - `depositRewards(uint256 amount)`
  - `depositSYIRewards(uint256 syiAmount)`
  - `setExcluded(address, bool)`
  - `emergencyWithdraw(address token, uint256 amount)`

- 内部/视图
  - `_calculateWeight`、`_updateRewardPool`、`_rewardPerToken`、`_updateUserReward`
  - `_calculateEarnedRewards`、`_calculatePendingReward`
  - `_calculateCurrentTotalWeight`、`_updateCachedTotalWeight`、`_removeStaker`
  - `_processAccumulatedSYI`、`_swapSYIForUSDT`

---

## 十、参考代码位置（入口行）

- LiquidityStakingBase
  - 构造函数：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:111`
  - `stake`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:152`
  - `unstake`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:182`
  - `claimReward`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:228`
  - `depositRewards`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:258`
  - `depositSYIRewards`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:278`
  - `_processAccumulatedSYI`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:417`
  - `_swapSYIForUSDT`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:445`
  - `getUserStakeInfo`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:481`
  - `getRewardPoolInfo`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:506`
  - `setExcluded`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:578`
  - `emergencyWithdraw`：`contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol:583`

- LiquidityStaking（主网）
  - 构造函数透传：`contracts/LiquidityStaking/mainnet/LiquidityStaking.sol:15`
  - `getMinStakeDuration()`（24h）：`contracts/LiquidityStaking/mainnet/LiquidityStaking.sol:29`

---

文档版本：v1.0（自动生成）
更新时间：2025-10-12
