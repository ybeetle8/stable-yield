# SYI-Staking 合约方法详解（Staking.sol / StakingBase.sol）

参考：`notes/SYI三合约关系说明.md`

本文对 `contracts/SYI-Staking/mainnet/Staking.sol` 与 `contracts/SYI-Staking/abstract/StakingBase.sol` 的“每个方法”逐一说明：包含参数、功能、返回值、访问控制/错误、以及与其它合约/路由的交互方式与调用路径。为便于核对，正文中括号附上源码文件与起始行号。

---

## 一、环境实现 Staking（主网）

文件：`contracts/SYI-Staking/mainnet/Staking.sol`（主网参数与常量覆写）

这些函数均为 `internal pure override`，用于为 `StakingBase` 提供主网环境下的固化参数。

- getAPYRate1D() → uint256（Staking.sol:16）
  - 功能：返回 1 天产品的“复利基数”倍率（UD60x18 定点数）。
  - 说明：主网期望“按天复利”后在满期时匹配文档收益（1 日 0.3%）。
  - 外部交互：无。

- getAPYRate7D()、getAPYRate15D()、getAPYRate30D()（Staking.sol:20,24,28）
  - 功能：分别返回 7/15/30 天产品的“复利基数”倍率（UD60x18）。
  - 说明：这些数值用于 `_calculateStakeReward()` 中按天复利 `powu(天数)` 计算总本息，确保满期总收益匹配表中 4.28%/16.1%/56.31%。
  - 外部交互：无。

- getStakePeriod1D/7D/15D/30D() → uint256（Staking.sol:34-48）
  - 功能：返回各档位的锁仓期（以秒为单位）。
  - 外部交互：无。

- getTeamThresholdTier1..7() → uint256（Staking.sol:52-76）
  - 功能：返回团队层级 V1..V7 的 KPI 阈值（单位按 USDT 的精度）。
  - 用途：用于计算推荐团队层级与分配团队奖励。
  - 外部交互：无。

- shouldCheckEOA() → bool（Staking.sol:80）
  - 功能：主网启用 EOA 校验（onlyEOA），限制合约调用。

- getCompoundTimeUnit() → uint256（Staking.sol:84）
  - 功能：复利的时间单位（主网为 1 天）。 `_calculateStakeReward()` 会用 `stakingDuration / getCompoundTimeUnit()` 得到复利次数。

---

## 二、抽象基类 StakingBase（完整逻辑）

文件：`contracts/SYI-Staking/abstract/StakingBase.sol`

说明：本合约包含全部质押/解押、收益计算、推荐/团队奖励、滑点/价格冲击保护、历史记录与管理功能。Staking（主网）只覆写本合约所需的环境常量。

### 2.1 构造与修饰器

- modifier onlyEOA()（StakingBase.sol:161）
  - 功能：若 `shouldCheckEOA()` 为真且 `tx.origin != msg.sender` 则拒绝（OnlyEOAAllowed）。主网返回 true。

- constructor(address _usdt, address _router, address _rootAddress, address _feeRecipient)（StakingBase.sol:171）
  - 参数：
    - _usdt：USDT 合约地址
    - _router：UniswapV2/Pancake 路由地址（IUniswapV2Router02）
    - _rootAddress：根地址（默认推荐上级/团队奖励剩余归集地址）
    - _feeRecipient：赎回费接受地址（可更新）
  - 功能：
    - 初始化 USDT、ROUTER、rootAddress、feeRecipient
    - `IERC20(_usdt).approve(_router, type(uint256).max)` 预授权路由
    - 调用 `_updateRatesForMode()` 写入四档利率
  - 外部交互：
    - USDT: `approve(router, max)`

### 2.2 核心外部函数（用户操作）

- stake(uint160 _amount, uint8 _stakeIndex) external onlyEOA（StakingBase.sol:193）
  - 参数：
    - _amount：质押 USDT 数量（按 USDT 精度）
    - _stakeIndex：档位（0=1D, 1=7D, 2=15D, 3=30D）
  - 功能流程：
    1) `_validateStakeParameters(_amount, _stakeIndex)` 检查最大可质押、用户总上限、档位合法性；
    2) `_swapAndAddLiquidity(_amount)`：将一半 USDT 兑换 SYI，随后与剩余 USDT 配对加池；
    3) `_mintStakeRecord(user, _amount, _stakeIndex)`：为用户生成一条质押记录并“铸造”等额 sSYI（内部记账）。
  - 外部交互：
    - USDT: `transferFrom(user → this, _amount)`
    - ROUTER: `swapExactTokensForTokensSupportingFeeOnTransferTokens(USDT→SYI)`
    - ROUTER: `addLiquidity(USDT, SYI, ..., to=address(0))`（LP 发送至 0 地址）
    - SYI: 读取 `getUniswapV2Pair()`（间接用于路由/储备）
  - 事件：`Staked(user, amount, timestamp, index, stakeTime)`
  - 可能错误：`MustBindReferral`（未先绑定），`ExceedsMaxStakeAmount`，`ExceedsUserTotalStakeLimit`，`InvalidStakeIndex`，`OnlyEOAAllowed`

- unstake(uint256 stakeIndex) external onlyEOA returns (uint256 totalReward)（StakingBase.sol:200）
  - 参数：
    - stakeIndex：要解押的质押记录索引
  - 返回：
    - totalReward：本次计算的“本息和”（用于历史事件/兼容）
  - 功能流程：
    1) `_burn(stakeIndex)`：校验到期/未提取，取出本金 `amount` 与“计算本息” `calculatedReward`，并“销毁”等额 sSYI；
    2) `_swapSYIForReward(calculatedReward)`：按“确切 USDT 数量”将持仓的 SYI 兑换为 USDT，得到 `usdtReceived` 与消耗的 `syiTokensUsed`；
    3) 计算利息 `interest = max(usdtReceived - principal, 0)`；
    4) 推荐奖励：
       - 好友直推 5%：`_distributeFriendReward(user, interest)`，USDT 直接转账给好友/或 root
       - 团队最高 35%：`_distributeTeamReward(referralChain, interest)`，按 V1..V7 严格差额法分发；
    5) 更新团队 KPI：`_updateTeamInvestmentValues(user, principal, false)`（从上级链路扣减）
    6) 计算用户净入账：`userPayout = usdtReceived - friendReward - teamFee`
    7) 赎回费 1%：以 USDT 目标额再次调用 `_swapSYIForReward(expectedRedemptionFeeUSDT)` 获取 USDT（仅事件记录）
    8) 记录完整提现历史 `_recordWithdrawal(...)`，将 `userPayout` 的 USDT 转给用户
    9) 调用 `SYI.recycle(syiTokensUsed)` 回收刚才兑换消耗掉的 SYI 额度。
  - 外部交互：
    - ROUTER: `swapTokensForExactTokens(SYI→USDT)`（两次：一次为用户本息，一次为赎回费）
    - IERC20(USDT): `transfer(friend/team/user)`
    - SYI: `recycle(syiTokensUsed)`
  - 事件：
    - `RewardPaid`（兼容用途）
    - `WithdrawalCompleted`（完整细节）
    - `RedemptionFeeCollected`（记录 1% 赎回费换得的 USDT 与消耗的 SYI）
  - 可能错误：`StakingPeriodNotMet`，`AlreadyWithdrawn`，`OnlyEOAAllowed`
  - 注意：当前实现仅记录 `RedemptionFeeCollected` 事件，未见将赎回费 USDT 主动 `transfer` 至 `feeRecipient` 的语句（可按需求核对/补充）。

- lockReferral(address _referrer) external（StakingBase.sol:266）
  - 参数：
    - _referrer：推荐人地址；传 `address(0)` 会绑定到 `rootAddress`
  - 功能：首绑推荐关系；若用户已有历史本金，会把该本金沿推荐链同步到各上级的团队 KPI 中。
  - 条件：
    - 不能已绑定（AlreadyBound）
    - 不能自荐/根地址自荐（CannotReferSelf）
    - 推荐人需要持有 >= 1 sSYI 或为 root（InvalidReferrer）
  - 状态：写入 `_referrals`、`_children`、`_hasLocked[user]=true`
  - 事件：`BindReferral(user, referrer)`

- setRootAddress(address _rootAddress) external onlyOwner（StakingBase.sol:297）
  - 功能：更新 root 地址（营销/兜底奖励归集）。

- lockFriend(address _friend) external（StakingBase.sol:301）
  - 功能：绑定一个“好友地址”作为直推 5% 的接收方。
  - 限制：不可为空、不可自己、不可重复绑定。
  - 事件：`BindFriend(user, friend)`

- sync() external（StakingBase.sol:313）
  - 功能：将本合约持有的 USDT 全额转给 SYI/USDT 交易对，并调用 Pair 的 `sync()`，与池子储备同步。
  - 外部交互：
    - SYI: `getUniswapV2Pair()`
    - IERC20(USDT): `transfer(pair, w_bal)`
    - IUniswapV2Pair(pair).sync()

### 2.3 外部/公开只读（视图）

- getReferrals(address _user, uint256 _maxDepth) external view（StakingBase.sol:324）
  - 功能：返回用户向上的推荐链（最多 _maxDepth 层）。

- getRootAddress() external view（StakingBase.sol:332）
- stakeCount(address user) external view（StakingBase.sol:336）
- getUserInfo(address user) external view（StakingBase.sol:340）
  - 返回：
    - totalStaked：当前总本息（未到期的每笔按当前复利累计值）
    - teamKPI：团队 KPI（累加下级质押本金）
    - referrer：直接推荐人
    - hasLockedReferral：是否锁定过推荐关系
    - isPreacherStatus：是否达到传教士门槛（当前总本息 ≥ 200 USDT）

- getReferralCount(address _user) external view（StakingBase.sol:386 上下，参见源码）
- network1In() external view（StakingBase.sol:372）
- getNetworkInflow() external view（StakingBase.sol:376）
  - 功能：近 1 分钟内 sSYI 总供应量增长（新质押）估算，用于动态限额。

- getMaxStakeAmount() external view（StakingBase.sol:380）
  - 功能：调用 `maxStakeAmount()` 得到当前单笔最大可质押额度。

- getRemainingStakeCapacity(address user) external view（StakingBase.sol:384）
  - 功能：距离用户总质押上限（10,000 USDT）的剩余额度。

- getMaxUserTotalStake() external pure（StakingBase.sol:392）

- getStakePeriod(uint8 stakeIndex) public pure（StakingBase.sol:393）
  - 功能：返回指定档位的锁仓期（调用环境覆写的 1/7/15/30 天）。

- getStakePeriods() external pure（StakingBase.sol:401）
  - 功能：一次返回四个档期数组。

- getTeamRewardThresholds() external pure（StakingBase.sol:412）
- getTeamRewardRates() external pure（StakingBase.sol:423）
- getSlippageConfig() external pure（StakingBase.sol:437）
  - 返回：基础/最大滑点、价格冲击阈值（用于计算最小接收量）。

- previewStakeOutput(uint256 usdtAmount) external view（StakingBase.sol:453）
  - 功能：预估质押时“兑换半仓”的 SYI 期望量与最小可接受量。
  - 外部交互：
    - SYI: `getUniswapV2Pair()`
    - Pair: `getReserves()`
    - ROUTER: `getAmountOut()`

- getWithdrawalHistory(address user) external view（StakingBase.sol:486）
- getWithdrawalCount(address user) external view（StakingBase.sol:492）
- getWithdrawalRecord(address user, uint256 index) external view（StakingBase.sol:496）
- getUserStakeWithdrawalStatus(address user) external view（StakingBase.sol:504）
  - 返回：每笔是否可提、以及剩余时间（秒）。

- balanceOf(address account) public view override（StakingBase.sol:540）
  - 功能：返回“当前总本息”，用于 sSYI 的余额显示（不可转账）。

- principalBalance(address account) public view（StakingBase.sol:546）
  - 功能：仅本金（sSYI 记账余额）。

- currentStakeValue(address account) public view（StakingBase.sol:552）
  - 功能：遍历未提取的每一笔 stake，按 `_calculateStakeReward()` 累加“当前本息”。

- earnedInterest(address account) public view（StakingBase.sol:572）
  - 功能：`currentStakeValue - principalBalance` 的正差（累计利息）。

- getReferrals(address user, uint8 maxDepth) public view（StakingBase.sol:585）
  - 功能：与 external 重载版本相同，返回上级链。

- rewardOfSlot(address user, uint8 index) public view（StakingBase.sol:609）
  - 功能：指定一笔 stake 的“当前本息”（含本金）。

- canWithdrawStake(address user, uint256 stakeIndex) public view（StakingBase.sol:617）
  - 功能：是否已到满期且未提取。

- isPreacher(address user) public view override（StakingBase.sol:641）
  - 功能：当前总本息是否 ≥ 200 USDT（门槛可在常量处查看）。

- getTeamKpi(address _user) public view（StakingBase.sol:645）
- getReferral(address _user) public view（StakingBase.sol:720 附近）
- getFriend(address user) public view（StakingBase.sol:724）
- isBindReferral(address _user) public view（StakingBase.sol:728）

- getRecentNetworkInflow() public view（StakingBase.sol:732）
  - 功能：基于 `t_supply` 记录的 sSYI 总供给快照，计算近 1 分钟净增长量。

- maxStakeAmount() public view（StakingBase.sol:758）
  - 功能：基于池子 USDT 储备的 1% 与近 1 分钟入金，动态给出“单笔最大可质押额度”，再与 MAX_STAKE_LIMIT 取较小值。
  - 外部交互：
    - SYI: `getUSDTReserve()`

### 2.4 代币相关（sSYI 手工实现）

- transfer/approve/transferFrom 均不支持（直接 revert）；allowance 恒为 0（StakingBase.sol:772-807）
- 说明：sSYI 仅作为“不可转账”的质押凭证，余额 = 当前总本息。铸造/销毁靠 `_update()`。

### 2.5 内部/私有（关键实现）

- _update(address from, address to, uint256 value) internal（StakingBase.sol:813）
  - 功能：
    - from=0：给 to 增加余额与 totalSupply，发出 Transfer(0→to)
    - to=0：从 from 扣减余额并减少 totalSupply，发出 Transfer(from→0)
    - 其他：禁止用户间转账

- _updateTeamInvestmentValues(address user, uint256 amount, bool isIncrease) internal（StakingBase.sol:835）
  - 功能：将用户本金的增减同步累加到其上级链的 `teamTotalInvestValue`。

- _syncExistingInvestmentToReferralChain(address user, uint256 existingInvestment) internal（StakingBase.sol:851）
  - 功能：首次绑定推荐时，把已存在的投资额同步进上级 KPI。

- _updateRatesForMode() internal（StakingBase.sol:867）
  - 功能：写入四档收益倍率数组 `rates` 并发出 `StakingRatesUpdated`。

- _getTeamTiers() internal pure → TeamTier[7]（StakingBase.sol:879）
  - 功能：返回 V1..V7 的（阈值, 奖励率）数组（高到低）。

- _mintStakeRecord(address sender, uint160 _amount, uint8 _stakeIndex) private（StakingBase.sol:835）
  - 功能：创建一条质押记录，更新 `t_supply` 快照，更新团队 KPI，铸造 sSYI。
  - 事件：`Staked`。

- _burn(uint256 index) private → (reward, amount)（StakingBase.sol:869）
  - 功能：解押检查与结算，标记已提取，销毁 sSYI。
  - 错误：未满期/已提取。

- _swapSYIForReward(uint256 calculatedReward) private → (usdtReceived, syiTokensUsed)（StakingBase.sol:894）
  - 功能：通过路由以“精确 USDT 输出”模式，按路径 [SYI → USDT] 进行兑换，得到实际 USDT 与所消耗的 SYI。
  - 外部交互：
    - ROUTER: `swapTokensForExactTokens()`

- _calculateMaxSYIInput(uint256 usdtNeeded, uint256 availableSYI) private view → maxInput（StakingBase.sol:924）
  - 功能：基于交易对储备，估算为拿到 `usdtNeeded` 所需的“安全最大”SYI 输入，含一定冗余与上限（不超过持仓 1/2）。
  - 外部交互：
    - SYI: `getUniswapV2Pair()`
    - Pair: `getReserves()`

- _distributeFriendReward(address _user, uint256 _interset) private → fee（StakingBase.sol:971）
  - 功能：按利息的 5% 计算直推奖励，若未绑定好友则发给 root。
  - 外部交互：IERC20(USDT).transfer(friend/root, fee)

- _distributeTeamReward(address[] referralChain, uint256 _interset) private → fee（StakingBase.sol:986）
  - 功能：
    - 计算团队奖励总池 = 利息 × 35%
    - 调用 `_distributeHybridRewards()` 按 V1..V7 严格差额法发放（每个层级仅首位合格者获差额部分，需通过 `isPreacher` 校验）
    - 未分配完部分发给 root（记为 marketingAmount）
  - 外部交互：IERC20(USDT).transfer(各层级地址 / root)
  - 事件：`TeamRewardDistributionCompleted`（含各层级收款人/金额与活跃位图）

- _distributeHybridRewards(...) private → (totalDistributed, tierRecipients[7], tierAmounts[7], activeTiers)（StakingBase.sol:1052）
  - 功能：执行严格差额分配逻辑，并对每个成功发放的层级发出 `StrictDifferentialRewardPaid`。

- _calculateStakeReward(Record storage stakeRecord) private view → currentReward（StakingBase.sol:1114）
  - 功能：
    - 以 UD60x18 定点进行复利：`principal * rate^periods`
    - `periods = min(已过时长, 锁仓期) / getCompoundTimeUnit()`（主网为天）
    - 未开始计时返回本金（无收益）

- _validateStakeParameters(uint160 _amount, uint8 _stakeIndex) private view（StakingBase.sol:1159）
  - 功能：校验单笔最大额度（`maxStakeAmount()`）、档位合法、以及“用户累计本金 ≤ 10,000”。

- _swapAndAddLiquidity(uint160 usdtAmount) private（StakingBase.sol:1169）
  - 功能：
    - 从用户收取 USDT；
    - 一半 USDT 通过路由换成 SYI（带手续费令牌兼容）；
    - 用“剩余 USDT + 刚换到的 SYI”调用 `addLiquidity(USDT, SYI, ..., to=address(0))`。
  - 外部交互：
    - IERC20(USDT).transferFrom(user→this)
    - ROUTER.swapExactTokensForTokensSupportingFeeOnTransferTokens(USDT→SYI)
    - ROUTER.addLiquidity(USDT, SYI, to=address(0))

- _calculateMinimumOutput(uint256 usdtAmountIn) private view → minAmountOut（StakingBase.sol:1215）
  - 功能：基于当前储备、价格冲击、基础/最大滑点与买入费率，计算“可接受的最小 SYI 数量”。
  - 外部交互：
    - SYI: `getUniswapV2Pair()`
    - Pair: `getReserves()`
    - ROUTER: `getAmountOut()`

- _recordWithdrawal(...) private（StakingBase.sol:1315）
  - 功能：把本次解押的所有细节写入 `_userWithdrawalHistory[user]`，并发出 `RewardPaid` 与 `WithdrawalCompleted`。

### 2.6 管理函数（仅所有者）

- setSYI(address _syi) external onlyOwner（StakingBase.sol:1366）
  - 功能：设置 SYI 合约地址，并 `SYI.approve(router, max)`。
  - 外部交互：SYI.approve(router, max)

- emergencyWithdrawSYI(address to, uint256 _amount) external onlyOwner（StakingBase.sol:1373）
  - 功能：紧急提取 SYI 至指定地址。

- emergencyWithdrawUSDT(address to, uint256 _amount) external onlyOwner（StakingBase.sol:1380）
  - 功能：紧急提取 USDT 至指定地址。

- setFeeRecipient(address _feeRecipient) external onlyOwner（StakingBase.sol:1387）
  - 功能：更新赎回费接收地址，事件 `FeeRecipientUpdated`。

---

## 三、与外部合约/路由的交互一览

- SYI Token（`ISYI`）
  - 读取：`getUniswapV2Pair()`、`getUSDTReserve()`
  - 授权：`SYI.approve(router, max)`（setSYI）
  - 回收：`SYI.recycle(syiTokensUsed)`（解押完成后）

- USDT（`IERC20`）
  - 输入：用户 `stake` 时 `transferFrom(user→this)`
  - 输出：`unstake` 时给用户/好友/团队/root 派发，`sync` 时转入 Pair

- 路由（`IUniswapV2Router02`）
  - 买入 SYI：`swapExactTokensForTokensSupportingFeeOnTransferTokens(USDT→SYI)`
  - 卖出 SYI：`swapTokensForExactTokens(SYI→USDT)`（按精确 USDT 输出）
  - 加池：`addLiquidity(USDT, SYI, ..., to=address(0))`

- 交易对（`IUniswapV2Pair`）
  - 读取储备：`getReserves()`（用于滑点/预估）
  - 同步储备：`sync()`（`sync()` 外部函数）

---

## 四、错误与事件（速览）

- 常见错误：OnlyEOAAllowed, MustBindReferral, ExceedsMaxStakeAmount, ExceedsUserTotalStakeLimit, InvalidStakeIndex, StakingPeriodNotMet, AlreadyWithdrawn, InvalidReferrer, AlreadyBound 等（定义见 `IStaking.sol`）。
- 主要事件：Staked, RewardPaid, WithdrawalCompleted, BindReferral, BindFriend, StakingRatesUpdated, StrictDifferentialRewardPaid, TeamRewardDistributionCompleted, RedemptionFeeCollected, FeeRecipientUpdated。

---

## 五、设计要点与注意事项

- sSYI 不可转账：仅作为“当前本息”余额的凭证，用户间转账会 revert。
- 动态限额：`maxStakeAmount()` 基于“近 1 分钟净入金 + 池子 USDT 1%”抑制瞬时大额入金。
- 复利单位：主网以“天”为单位复利，满期封顶；测试网可覆写为“分”。
- 推荐/团队奖励：直推 5%，团队最高 35%，采用“严格差额 + 逐层仅首位合格者”模型，未分配部分归 root。
- 赎回费 1%：当前代码仅记录事件，未见将该 USDT 实际转给 `feeRecipient` 的转账逻辑，若需生效可在结算处补充 `IERC20(USDT).transfer(feeRecipient, expectedRedemptionFeeUSDT)`。

---

以上即两份合约的逐函数说明。结合《SYI 三合约关系说明》可了解与 SYI Token 与 LP 质押的整体联动与资金流向。
