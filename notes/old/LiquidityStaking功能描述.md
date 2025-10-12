# LiquidityStaking 模块功能描述

本文档基于 `othercode/LiquidityStaking/src` 源码（Solidity 0.8.20）梳理合约的核心功能、数据结构与交互关系。可结合 `notes/OLA-Staking功能说明.md` 与 `notes/OLA_币合约说明.md` 一起理解整体生态。

## 目标与角色
- 目标：为 OLA/USDT LP 持有者提供“时间加权”的质押收益，奖励以 USDT 发放。
- 参与合约：
  - `LiquidityStakingBase`（核心逻辑）与 `LiquidityStaking`（主网常量：最短质押 24h）。
  - 依赖 `IOLA`（代币/费用处理、FundRelay 分发），`IUniswapV2Router02`（BLA→USDT 兑换），`IERC20`（USDT/LP），`IStaking`（引用外部 Staking）。

## 数据结构与状态
- `StakeInfo`：`amount`（LP数）、`stakeTime`、`lastRewardTime`、`accumulatedReward`。
- `RewardPool`：`totalRewards`、`rewardPerSecond`（USDT/s）、`lastUpdateTime`、`rewardPerTokenStored`、`totalStaked`、`distributedRewards`、`pendingRewards`。
- 账户映射：`stakes`、`userRewardPerTokenPaid`、`userPendingRewards`、`excludedFromStaking`。
- 其他：`stakers[]`、`accumulatedBLA`（累计的 OLA/“BLA”待兑换）。

## 核心流程
- 质押 `stake(amount)`：
  - 仅限非排除地址；LP 从用户转入合约；记录或更新 `StakeInfo`；同步 `totalStaked` 与权重缓存；触发 `_processAccumulatedBLA()`。
- 解质押 `unstake(amount)`：
  - 检查最短质押期（主网 24h）；按“时间加权”模型计算并发放 USDT 奖励；减少 `amount`，如清零则移出 `stakers`；触发 `_processAccumulatedBLA()`。
- 领收益 `claimReward()`：
  - 当待领 >= `MIN_REWARD_AMOUNT`（1000 = 0.001 USDT）时结算并转出；触发 `_processAccumulatedBLA()`。

## 收益与权重模型（时间加权）
- 奖励按全局速率线性累计：`rewardPerSecond` → `_rewardPerToken()`（对 `totalStaked` 归一）。
- 个体收益：`earned = amount * (ΔrewardPerToken) * (1 + duration/365d)`。
  - 即质押越久，“权重”线性增大（按年线性升权），实现“金额×时间”的公平分配。
- 奖励注入：
  - `depositRewards(amount USDT)`：仅 `onlyAdmin`（owner 或 OLA 合约）可调用；增加 `pendingRewards`，并将 7 天线性释放为 `rewardPerSecond`。
  - `depositBLARewards(amount OLA)`：仅累计到 `accumulatedBLA`，不立即兑换。

## 费用来源与兑换
- `_processAccumulatedBLA()`：
  - 优先调用 `IOLA.triggerFundRelayDistribution()` 以将路由累积 USDT 安全汇入。
  - 将累计的 OLA 批量兑换为 USDT（Router `swapExactTokensForTokensSupportingFeeOnTransferTokens` 路径 OLA→USDT），注入奖励池并重算 7 天释放速率。
  - 备注：源码当前的门限判断为 `if (accumulatedBLA == 0 && accumulatedBLA > 10 ether) return;`，看起来应为“==0 或 <阈值”再返回，使用时建议确认预期逻辑。

## 读写接口（节选）
- 读：`getUserStakeInfo`、`getRewardPoolInfo`、`getStakersCount`、`canUnstake`、`canWithdrawStake`、`getMinStakeDurationExternal`。
- 管理：`depositRewards`、`depositBLARewards`、`setExcluded`、`emergencyWithdraw`。
- 访问控制：`onlyAdmin`（`owner` 或 `olaContract`）。默认将合约自身、`olaContract`、营销地址加入排除列表。

## 集成与部署要点
- 构造参数：`USDT`、`OLA`、`LP Token`、`Staking`、`marketing`、`admin`、`router`。
- 主网实现 `LiquidityStaking` 仅覆盖最短质押期（24h）。
- 与 `OLA` 的关系：Staking 行为会“顺带”推动 OLA 的费用汇聚与 BLA→USDT 的周期性兑换，形成 LP 持有者的持续 USDT 回报。
