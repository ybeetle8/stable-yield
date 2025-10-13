# SYI 质押收益计算与提前提取方案

参考合约：

- 质押：`contracts/SYI-Staking/abstract/StakingBase.sol`、`contracts/SYI-Staking/mainnet/Staking.sol`
- 代币：`contracts/SYI/abstract/SYIBase.sol`、`contracts/SYI/mainnet/SYI.sol`

本文聚焦“质押收益怎么算、是否复利、非整天如何处理”，并提出“仅提取盈利（利息）提前领取”的设计方案与实现建议。

---

## 一、质押期限与日利率（主网）

实现位置：`contracts/SYI-Staking/mainnet/Staking.sol`

- 期限（stakeIndex → 期限）：
  - `0 → 1天`
  - `1 → 30天`
  - `2 → 90天`
  - `3 → 180天`
- 日复利因子（UD60x18 定点，小数放大 1e18）：
  - `index 0：1.003`（0.3%/日） → `1003000000000000000`
  - `index 1：1.006`（0.6%/日） → `1006000000000000000`
  - `index 2：1.009`（0.9%/日） → `1009000000000000000`
  - `index 3：1.015`（1.5%/日） → `1015000000000000000`
- 计息单位（复利时间粒度）：`1 天`

注意：接口 `IStaking.sol` 的注释曾写过 7/15/30 天等映射，已与主网实现不一致；请以 `Staking.sol` 实际常量为准。

---

## 二、收益是否复利？如何计算？

核心位置：`StakingBase._calculateStakeReward`

- 计算口径：
  - 设本金 `P`，日复利因子 `r`（1.003/1.006/1.009/1.015），已过“整天数” `n`（见下节“非整天处理”）。
  - 合约计算“当前总额（本金+利息）”为：`P * r^n`。
  - 提现（unstake）时，以该“总额”为目标 USDT 金额，去池子里以 SYI→USDT 的方式“换出等额 USDT”（细节见“结算与费用”）。
- 结论：
  - 是“按天复利”，且只按“已过去的整日数”记息（不会计入零头小时/分钟）。
  - 整个质押期内“最多计到该期的上限天数”，超过质押期不会继续增长。

---

## 三、非整天如何处理？

实现要点：`stakingDuration / getCompoundTimeUnit()` 使用整数除法，`getCompoundTimeUnit()` 为 1 天。

- 含义：若只过去了 `x 天 + y 小时`，则只按 `x 天`计息，`y 小时`被截断不计。
- 体现位置：
  - `compoundPeriods = stakingDuration / 1 days`（向下取整）
  - 预览/查询时也是按整天显示；提现必须“到期”，否则直接 `revert StakingPeriodNotMet()`。

---

## 四、提现与费用分配（到期）

流程位置：`StakingBase.unstake` → `_burn` → `_swapSYIForReward` → 费用分配

- 到期校验：必须 `now - stakeTime >= 期限` 才能解锁。
- 计算“目标 USDT 金额”：`calculatedReward = P * r^n`（n 为该期最大整天数）。
- 兑换：用合约持有的 SYI 调用路由 `swapTokensForExactTokens` 换出 `calculatedReward` USDT。
- 费用与分配（按“利息部分”拆分）：
  - `利息 = usdtReceived - P`
  - 直推奖励：`5%`（给 friend，若无 friend 则给 root）
  - 团队奖励：`最多 35%`（V1~V7 严格差额分配，按团队 KPI 分段）
  - 赎回费：名义 `1%`（对用户实收 `userPayout` 计算），合约会额外再用 SYI 换出等额 USDT 作为“赎回费”并记账；当前实现不从用户到账的 `userPayout` 中直接扣减。
- 用户实收：`userPayout = usdtReceived - friendReward - teamFee`（不含上文“额外换出”的 1% 赎回费）。

示意图（Mermaid）：

```mermaid
flowchart TD
  A[到期 Unstake] --> B[计算 P*r^n]
  B --> C[用 SYI 换出 USDT: P*r^n]
  C --> D[利息 = USDT - P]
  D --> E[5% 直推]
  D --> F[≤35% 团队差额]
  C --> G[用户实收 = USDT - 直推 - 团队]
  G --> H[额外换出 1% 赎回费(不从用户扣)]
```

---

## 五、公式与示例

- 公式：
  - `总额（到手前） = P * r^n`
  - `利息 = P * r^n - P`
  - `用户实收 = P*r^n - 直推(5%*利息) - 团队(≤35%*利息)`

- 示例（以 `P = 1,000 USDT`）：
  - `index 1（30天，0.6%/日）`：
    - `r = 1.006`，`n = 30`
    - `P*r^n ≈ 1000 * 1.006^30 ≈ 1000 * 1.196 ≈ 1,196 USDT`
    - `利息 ≈ 196`，直推 `≈ 9.8`，团队最多 `≈ 68.6`，用户实收约 `1,196 - 9.8 - 68.6 ≈ 1,117.6`
  - `index 3（180天，1.5%/日）`：
    - `r = 1.015`，`n = 180`
    - `P*r^n = 1000 * 1.015^180`（增长极快，复利收益很高，需注意经济安全）

说明：团队奖励采取“严格差额”模式，只有满足布道者/层级条件的上级可按差额档位获得分润，未满足的部分回流 root（营销）。

---

## 六、关键代码参照

- 期限与利率（主网）：`contracts/SYI-Staking/mainnet/Staking.sol`
  - `getAPYRate*()` 返回日复利因子（UD60x18）
  - `getStakePeriod*()` 返回期限（天）
  - `getCompoundTimeUnit()` 返回计息单位（1天）
- 复利计算：`contracts/SYI-Staking/abstract/StakingBase.sol`
  - `_calculateStakeReward`：`P * r^n`，`n = floor(已过秒数 / 1天)`，上限不超过该期
  - `unstake`：到期校验、兑换 USDT、分发直推/团队、记录流水

---

## 七、提前提取“盈利部分”（仅利息）的方案

目标：在不允许提前赎回本金的前提下，允许用户在质押期内“按日”领取已产生的利息；期满时可赎回本金+剩余未领利息。

### 方案 A：保留“按日复利”，新增“按日可提利息”

核心思路：按当前实现的复利公式，计算“到当前日数的总利息”，减去“上次已领取到的日数的利息差额”，把差额支付给用户，并同步直推/团队奖励。

- 需要新增的存储字段（在 `IStaking.Record`）：
  - `lastClaimedPeriods`（uint32/uint40）：最近一次“利息领取”已计入的整日数 n_last
  - 可选：`claimedInterestUSDT`（uint128/uint256）：累计已领取利息，便于对账（非必须）

- 新增函数：`claimInterest(uint256 stakeIndex)`
  - 校验：`stake.status == false`（未提本），无需到期校验
  - 计算：
    - `n_now = floor(min(elapsed, period) / 1天)`
    - 若 `n_now <= n_last` → 无可领
    - `interest_delta = P * (r^n_now - r^n_last)`
  - 结算：对 `interest_delta` 执行与 `unstake` 相同的分配：
    - 直推 5%、团队 ≤35%（均按“本次利息差额”计）
    - 可选择“是否收 1% 赎回费”：建议仅在最终赎回时收，减少频繁 swap 开销与用户疑惑
  - 兑现：调用 `_swapSYIForReward(interest_user + 直推 + 团队)`，向用户与各方转账 USDT
  - 更新：`lastClaimedPeriods = n_now`，可选累加 `claimedInterestUSDT`

- 到期赎回时（`unstake`）：
  - 现有 `P * r^n_final` 不再直接使用；要改为“只结算剩余未领取利息 + 本金”
  - `remaining_interest = P * (r^n_final - r^n_last)`
  - 走现有分配逻辑，再兑付本金

- 优点：
  - 保持现行“按日复利”的经济模型；逻辑对齐，公式简单
  - 每日最多可领一次（由“整日数”自然限制），链上计算稳定

- 注意点：
  - 多次 `powu` 计算的 gas 成本可接受（与当前 `_calculateStakeReward` 同量级）
  - 需要确保合约侧有足够 SYI 可供置换（和到期一致，可复用回收/置换机制）

### 方案 B：切换为“按日单利、可多次领取”

- 把收益模型改为“线性按日单利”：`interest = P * d * n`（`d` 为日利率）
- 优点：实现更简单；多次领取结算只需 `n_now - n_last` 的线性差
- 缺点：与当前“复利”不一致，收益曲线改变，影响预期与宣传口径

### 方案 C：双模式（复利/领取）开关

- 为每笔质押提供“是否复利”的选择：
  - 复利模式：不支持中途领取；到期一次性兑付（现状）
  - 领取模式：按日可提，仅按“未领区间”计息（方案 A 的实现）
- 优点：灵活，用户可按需选择
- 缺点：实现与前端交互更复杂；需要在创建质押时记录模式

---

## 八、实现改动清单与难度评估

- 存储结构（合约改动）：
  - `IStaking.Record` 新增 `lastClaimedPeriods`（以及可选 `claimedInterestUSDT`）
  - 事件：新增 `InterestClaimed(user, stakeIndex, interest, friendFee, teamFee, timestamp)`（建议）
- 逻辑：
  - 新增 `claimInterest(uint256 stakeIndex)`（可重用大部分 `_swapSYIForReward`、直推/团队分配逻辑）
  - `unstake` 按“剩余未领利息 + 本金”改造
  - 计费策略（是否对每次“利息领取”收 1% 赎回费）给出明确规则（建议仅最终赎回收）
- 前端与文档：
  - 新增“可领取利息”展示（按整日数变化）
  - 新增“领取历史”与“总已领”

难度评估：中等（2–4 人日）

- 代码层面主要是存储与两处结算逻辑的改造；
- 经济与风控侧需评估“频繁领取带来的链上交换成本、滑点与池子深度”的影响；
- 测试需覆盖：
  - 多次领取 → 到期赎回的对账一致性
  - 直推/团队分配在多次领取下的正确性
  - 没有整天时的领取行为应返回 0/直接拒绝

---

## 九、FAQ 与风险提示

- 非整天不计息：当前实现按“整天”计息，提前几小时不会产生利息。
- 复利幅度较大：特别是 180 天、1.5%/日，增长非常快；需关注代币供给、池子深度、二级市场承接与风控。
- 赎回费当前实现为“额外换出”：不会从用户到账里直接扣，资金流、账务与运营侧需对齐。
- 接口注释与实现不一致：以 `Staking.sol` 的期限与利率为准。

---

## 十、附：流程图（质押→提取利息→到期赎回）

```mermaid
flowchart LR
  S[Stake 建立订单] -->|每日更新 n=floor(t/1d)| V[可领利息 = P*(r^n - r^n_last)]
  V -->|claimInterest| D[分配：直推5% 团队≤35%]
  D -->|SYI→USDT 置换| U[用户收 USDT]
  V -->|若无整天| Z[无可领]
  U --> N[更新 n_last=n]
  N -->|到期| W[Unstake：兑付本金 + 剩余未领利息]
```

---

以上内容覆盖了现状收益公式、是否复利、非整天处理方式，并提供了“仅盈利提前提取”的多种实现路径与落地建议。如需，我可以继续：

- 起草 `claimInterest` 的合约伪代码/补丁草案；
- 生成多场景的收益对账表格（含日更、部分领取、到期赎回）；
- 评估对前端接口与交互的改动建议。

