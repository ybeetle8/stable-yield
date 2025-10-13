# SYI 合约方法详解（SYIBase + mainnet SYI）

参考：`notes/SYI三合约关系说明.md`（强烈建议先阅读该文，了解 SYI、SYI-Staking、LiquidityStaking 三者之间的整体关系与资金流）。本文聚焦 SYI 代币合约在主网实现中的每个方法：参数、功能、涉及的外部合约与调用方式、关键事件。

适用源码：
- `contracts/SYI/abstract/SYIBase.sol`
- `contracts/SYI/mainnet/SYI.sol`

环境常量（mainnet）：
- 延迟买入期 getDelayedBuyPeriod() = 30 天
- 预售期时长 getPresaleDuration() = 30 天

---

## 一、构造与通用行为

### constructor(address _usdt, address _router, address _staking, address _marketingAddress)
- 功能：初始化合约依赖地址与初始状态；给所有者铸造 10,000,000 SYI。
- 参数：
  - `_usdt`：USDT 合约地址
  - `_router`：Pancake/UniswapV2 Router 地址
  - `_staking`：SYI-Staking 合约地址
  - `_marketingAddress`：营销地址
- 外部合约交互：无（仅保存地址）。
- 事件：无直接事件。
- 备注：设置 `contractDeployTime`、启动预售（`presaleActive=true`），`presaleDuration` 由 `getPresaleDuration()` 给出。

### transfer(address to, uint256 value) / transferFrom(address from, address to, uint256 value)
- 功能：覆盖 ERC20 转账逻辑，加入买/卖/普通转账的判定与税费处理。
- 参数：同 ERC20 标准。
- 外部合约交互：
  - 若为买/卖路径，内部会间接调用 Router、LiquidityStaking、USDT、Pair、FundRelay 等（详见 _update/_handleBuy/_handleSell）。
- 事件：间接触发多类事件（见下文对应内部流程）。

### _update(address from, address to, uint256 value) internal override
- 功能：核心转账分发逻辑。
- 行为：
  - 若 `from==0` 或 `to==0`：按 ERC20 铸造/销毁正常处理。
  - 若任一地址在 `feeWhitelisted`：不收税，直接转账。
  - 否则判定：
    - `_isBuyOperation(from,to)` → 进入 `_handleBuy`
    - `_isSellOperation(from,to)` → 进入 `_handleSell`
    - 其他普通转账 → 直接转账，并 `_tryTriggerFundRelayDistribution()`
- 外部合约交互：在 `_handleBuy/_handleSell` 内详述。

### _isBuyOperation(address from, address to) private view → bool
- 功能：判断是否为买入。
- 规则：`from==pair && to!=pair && to!=router && msg.sender==pair`

### _isSellOperation(address from, address to) private view → bool
- 功能：判断是否为卖出。
- 规则：`to==pair && from!=pair && from!=router && msg.sender!=pair`

### _handleLiquidityOperation(address from, address to, uint256 amount, string operationType)
- 功能：对“流动性操作”类型转账附加 2.5% 手续费至 `marketingAddress`，再转净额。
- 备注：当前版本未在其他路径调用，留作扩展钩子。
- 事件：`LiquidityHandleFeeCollected`

---

## 二、买卖路径与费用处理

### _handleBuy(address from, address to, uint256 amount) private
- 功能：处理买入路径的税费、投资成本记录、事件。
- 校验：
  - 若处于预售激活且未过预售期 → revert NotAllowedBuy
  - `delayedBuyEnabled` 时对非白名单买家的延迟期检查（modifier `delayedBuyCheck`）
  - 受黑名单检查（modifier `notBlacklisted`）
- 税费：
  - 销毁费 burn 1%（转入 `DEAD_ADDRESS`）
  - LP 奖励费 2%
- 关键外部交互：
  - 将 2% 的 SYI 直接打入合约，再 `approve` 给 `liquidityStaking`，调用 `liquidityStaking.depositSYIRewards(liquidityFee)` 将 SYI 计入 LP 奖励池（由 LS 内部择机兑换为 USDT 分发）
- 用户净额：`amount - (burnFee + liquidityFee)`
- 投资成本：按当前池子储备估算本次买入的 USDT 成本（`_estimateBuyUSDTCost`），累计到 `userInvestment[to]`，并记录 `lastBuyTime[to]`
- 事件：
  - `TokensBurned(burnFee)`
  - `LPRewardDeposited(liquidityFee)` + `FeeCollected("BUY_LP_REWARD_SYI")`
  - `InvestmentUpdated(..., "BUY")` + `TransactionExecuted(..., "BUY")` + `UserTransaction(..., "BUY")`

### _handleSell(address from, address to, uint256 amount) private
- 功能：处理卖出路径的费用、利润税计算与分配、投资成本更新、事件。
- 校验：
  - 冷却期：`block.timestamp >= lastBuyTime[from] + coldTime` 否则 revert InColdPeriod
  - 受黑名单检查
- 交易税：
  - 营销费 1.5% → 累积到合约（`amountMarketingFee`）
  - LP 累积费 1.5% → 累积到合约（`amountLPFee`）
- 利润税（25%）：
  - 先估算卖出得到的 USDT（不执行真实 swap）：`_estimateSwapOutput(netAmountAfterTradingFees)`
  - 若 `estimatedUSDTFromSale > userInvestment[from]`，视为有利润：
    - `profitAmount = estimated - investment`
    - `profitTaxUSDT = profitAmount * 25%`
    - 将此 USDT 税额折算回需扣的 SYI 数量 `profitTaxInSYI`，从卖出额中额外扣除
    - 将所得 `profitTaxInSYI` 真实 `swap` 成 USDT：
      - 40% → `liquidityStaking.depositRewards(lsShare)`（USDT）
      - 60% → `nodeDividendAddress`（未设置时回退到 `marketingAddress`）（USDT）
  - 无利润时当前版本未对 `noProfitFeeUSDT` 赋正值（留存字段兼容）
- 用户净额：`amount - (marketingFee + liquidityAccumFee + profitTaxInSYI)`；估算的实际到手 USDT：`estimated - profitTaxUSDT - noProfitFeeUSDT`
- 投资成本更新：`userInvestment[from]` 按“实际到手 USDT”冲减，最低归零
- 事件：
  - `LPRewardDeposited(lsShare)`（如果有利润税）
  - `InvestmentUpdated(..., "SELL")` + `SellTransaction(...)` + `TransactionExecuted(..., "SELL")`

---

## 三、累计费用的触发与处理

### triggerFundRelayDistribution() external
- 调用方限制：仅 `staking` 或 `liquidityStaking`。
- 功能：主动触发从 `FundRelay` 拉取 USDT（若有）并尝试处理累计费用。
- 外部交互：`fundRelay.receiveAndForward()`；随后 `_tryProcessAccumulatedFees()`。

### triggerFeeProcessing() external
- 调用方限制：`owner` 或 `staking` 或 `liquidityStaking`。
- 功能：手动尝试处理累计费用（见下）。

### _tryProcessAccumulatedFees() private
- 条件：当 `amountMarketingFee + amountLPFee >= swapAtAmount` 且未在 `_inSwap` 时。
- 还需 `_canProcessFees()` 检查：
  - 合约余额足额、Pair 储备与真实余额相近（95% 检查）
  - 最大交换量不超过储备 2%
- 满足则 `_processFeeDistribution()`，否则 `FeeProcessingSkipped`。

### _processFeeDistribution() private lockSwap
- 功能：处理“累计的卖出费用”。
- 外部交互：
  - 将累计的营销费 `amountMarketingFee` 兑换为 USDT 并转给 `marketingAddress`
  - 将累计的 LP 费 `amountLPFee` 以 SYI 形式直接 `approve` 给 `liquidityStaking` 并调用 `depositSYIRewards(totalLPFee)`（由 LS 内部批量兑换发放）
- 清零：`amountMarketingFee`、`amountLPFee`
- 事件：`FeesProcessed("ACCUMULATED_FEES", ...)`、`LPRewardDeposited`

### _tryTriggerFundRelayDistribution() private
- 功能：若设置了 `FundRelay`，尝试 `receiveAndForward()` 将其持有的 USDT 立刻转回 SYI 合约，并记账事件。

### _swapTokensForUSDT(uint256 tokenAmount) private lockSwap → usdtReceived
- 功能：执行 SYI→USDT 兑换。若设置 `FundRelay`，以 `FundRelay` 作为收款地址，随后立即 `receiveAndForward()` 将 USDT 转回本合约；否则直接收款在本合约。
- 外部交互：`uniswapV2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens`，路径 `[SYI, USDT]`
- 授权：调用前 `_approve(address(this), router, tokenAmount)`
- 事件：失败时 `SwapFailed`/`FundRelayTransferFailed`

---

## 四、参数配置与治理函数（owner）

### setPair(address _pair)
- 功能：设置交易对 Pair 地址；并刷新预售时长（来自 `getPresaleDuration()`）。
- 外部交互：无（仅保存），后续卖买路径依赖该地址进行判定与储备读取。

### setLiquidityStaking(address _liquidityStaking)
- 功能：设置 LP 质押合约地址，并加入手续费白名单。
- 外部交互：对该地址的 `depositRewards/ depositSYIRewards` 调用均依赖此处。

### setFundRelay(address _fundRelay)
- 功能：设置 FundRelay 并将其加入手续费白名单。
- 外部交互：后续 swap 会以该地址作为收款中转，避免 Router 的 `INVALID_TO` 问题。

### setMarketingAddress(address _newAddress)
- 功能：设置营销地址，并加入白名单。
- 影响：利润税分配中的 60%（若未设置 `nodeDividendAddress`）与累计营销费接收方。
- 事件：`MarketingAddressUpdated(old,new)`

### setNodeDividendAddress(address _node)
- 功能：设置“节点分红地址”。
- 影响：利润税中 60% 的接收方；未设置时回退到 `marketingAddress`。

### setFeeWhitelisted(address account, bool whitelisted)
### setBatchFeeWhitelisted(address[] accounts, bool _whitelisted)
- 功能：单个/批量设置手续费白名单（白名单地址之间转账不收税）。

### setBlacklisted(address account, bool _blacklisted)
### setBatchBlacklisted(address[] accounts, bool _blacklisted)
- 功能：单个/批量设置黑名单（买卖路径会被阻止）。

### setSwapAtAmount(uint256 _swapAtAmount)
- 功能：设置累计费用处理的触发阈值（单位：SYI）。

### setColdTime(uint256 _coldTime)
- 功能：设置卖出冷却时间（单位：秒），用于限制用户在买入后多久才能卖出。

### setLiquidityThreshold(uint256 newThreshold)
- 功能：设置内部“流动性阈值”变量（当前代码中仅保存，未直接在逻辑中使用）。

### setPresaleDuration()
- 功能：从 `getPresaleDuration()` 刷新预售期时长（mainnet=30天）。

### setPresaleActive(bool _active)
- 功能：开启/关闭预售模式；开启时重置 `presaleStartTime` 与 `presaleDuration`。
- 事件：`PresaleDurationUpdated`（在开启时）+ `PresaleStatusUpdated`。

### setDelayedBuyEnabled(bool _enabled)
- 功能：开关“延迟买入”机制；开启时记录时间戳 `delayedBuyEnabledTime`。
- 查询方法：`getDelayedBuyInfo()`、`isDelayedBuyPeriodMet(address)`。

### recoverStuckTokens(address token, uint256 amount)
- 功能：提取本合约中误转的代币到 owner（但不会提取本合约自身的 SYI）。

### initializeWhitelist() external onlyOwner（仅可调用一次）
- 功能：初始化默认白名单：`owner`、本合约、`staking`、`marketingAddress`、`router`。

---

## 五、给其他合约/系统使用的外部方法

### recycle(uint256 amount) external
- 调用方限制：仅 `staking`。
- 功能：从交易对中回收一部分 SYI 到 Staking（最多不超过 Pair 中 SYI 的 1/3；按请求额与 1/3 取小）。
- 外部交互：
  - 通过内部 `_update(pair, staking, recycleAmount)` 将代币从 Pair 直接转给 Staking
  - 调用 `uniswapV2Pair.sync()` 同步储备

### triggerFundRelayDistribution() external（上文已述）

### triggerFeeProcessing() external（上文已述）

---

## 六、只读/工具方法（view/pure）

### getAccumulatedFees() → (marketing, lp, threshold)
- 返回当前累计的营销费、LP 费、触发阈值。

### getUserInvestment(address user) → (investment, lastBuy)
- 返回用户累计投资成本（USDT 估值）与上次买入时间戳。

### getUniswapV2Pair() / getLiquidityStaking() / getFundRelay()
- 返回对应合约地址。

### getUSDTReserve() → usdtReserve
- 从 Pair 读取储备，返回 USDT 的储备值（异常时返回 0）。

### getDelayedSwapStatus() → (pending, totalFees)
- 当前实现固定 `pending=false`，并返回累计费用之和。

### getPresaleStatus() → (active, startTime, duration, remainingTime, isInPresale)
- 返回预售开关、开始时间、时长、剩余时间、是否处于预售期。

### getAmountOut(amountIn, reserveIn, reserveOut) pure → amountOut
### getAmountIn(amountOut, reserveIn, reserveOut) pure → amountIn
- 封装 `Helper` 的常用恒定乘积公式工具。

### isContract(address account) view → bool
- 判断是否为合约地址（extcodesize）。

### getDelayedBuyInfo() → (enabled, testModeActive, enabledTime, requiredDelay, remainingDelay)
### isDelayedBuyPeriodMet(address buyer) view → bool
- 延迟买入相关查询（mainnet：requiredDelay=30 天）。

---

## 七、内部工具函数与外部合约交互细节

### 价格和成本估算
- `_estimateSwapOutput(xfAmount)`：从 Pair 储备估算 SYI→USDT 的输出
- `_getMinimumSwapOutput(tokenAmount)`：在估算基础上取 95% 作为滑点保护参考（内部使用）
- `_estimateBuyUSDTCost(xfAmount)`：考虑买入时 1%+2% 购入税，估算买到 `xfAmount` SYI 需要的 USDT（用于记录 `userInvestment`）

### 投资记录与事件封装
- `_updateBuyInvestmentAndEmitEvent(...)`：累计成本、更新 `lastBuyTime`、并发出 `InvestmentUpdated/TransactionExecuted/UserTransaction`
- `_updateInvestmentAfterSell(user, actualUSDTReceived)`：按“实际到账 USDT”冲减历史投资
- `_emitSellTransactionEvent(...)`：详细的卖出流水事件（含利润、税额分配等）

### 增/删流动性（当前路径未直接使用）
- `_addLiquidity(tokenAmount, usdtAmount)`：Router `addLiquidity`，LP 接收地址为黑洞 `DEAD_ADDRESS`
- `_processImmediateLiquidity(liquidityFee)` / `_processImmediateLiquidityInternal(...)`：将部分 token 换成 USDT 后立即做加池处理；当前主线逻辑未调用

### 与 Staking 的集成
- `_getUserReferrer(user)`：`staking.getReferral(user)`（捕获异常返回 0 地址）
- `_isReferrerEligible(referrer)`：`staking.isPreacher(referrer)` 判断是否合格的“布道者/做市商”；若合格，在利润税的另一实现里可分配份额（当前主线中利润税 40%→LP 池，60%→节点/营销）

### 备用/未在主线调用的利税处理
- `_processProfitTax(user, taxAmount)`：将 `taxAmount` 的 SYI 换成 USDT，并按是否有合格推荐人（`_getUserReferrer` + `_isReferrerEligible`）在营销与推荐人间 50/50 分配；当前主线未使用该实现，卖出路径直接按 40%→LS 与 60%→节点/营销的规则在 `_handleSell` 中处理。

### 与 LiquidityStaking 的集成
- `depositSYIRewards(syiAmount)`：用于买入 2% 与累计 LP 费的注入（以 SYI 形式进入 LS，再由 LS 批量兑换成 USDT 分发）
- `depositRewards(usdtAmount)`：用于利润税 40% 的 USDT 直接注入

### 与 FundRelay 的集成
- 作为 Router 兑换的收款中转，避免 `INVALID_TO`；提供 `receiveAndForward()`、`withdrawToSYI()` 等能力，所有转账失败会记 `SwapFailed/FundRelayTransferFailed`

### 与 Router/Pair/USDT 的交互
- Router：
  - `swapExactTokensForTokensSupportingFeeOnTransferTokens` 用于 SYI→USDT
  - `addLiquidity` 用于即时加池（当前主线未使用）
- Pair：`getReserves()/token0()/sync()`（价格估算、recycle 后同步）
- USDT：转账分润、向 LS 授权与注入

---

## 八、mainnet SYI.sol（环境常量覆盖）

- `getDelayedBuyPeriod()`：返回 30 天
- `getPresaleDuration()`：返回 30 天
- 其他逻辑均继承自 `SYIBase`

---

## 九、事件总览（与方法相关的关键事件）
- 费用/分配：`FeesProcessed`, `FeeCollected`, `LPRewardDeposited`, `AutoSwapTriggered`, `FeeProcessingTriggered`, `FeeProcessingSkipped`
- 交易流水：`TransactionExecuted`, `UserTransaction`, `SellTransaction`
- 投资记录：`InvestmentUpdated`
- 其它：`TokensBurned`, `LiquidityAdded`, `MarketingAddressUpdated`, `SwapFailed`, `FundRelayTransferFailed`, `PresaleDurationUpdated`, `PresaleStatusUpdated`, `DelayedBuyEnabled`

---

## 十、与“SYI 三合约关系说明”的对应要点
- 买入税：1% 销毁 + 2% 进入 LP 奖励池（以 SYI 注入到 LS，后续在 LS 中集中换成 USDT 分发）
- 卖出税：1.5% 营销（累计后批量换 USDT 转给营销地址）+ 1.5% LP 费（以 SYI 累计后批量注入 LS）
- 利润税：25%（按估算利润）→ 40% 注入 LS（USDT 直接注入），60% 给节点分红地址（未设则给营销）
- Staking 可调用：`recycle()` 回收一部分 Pair 中的 SYI；可触发累计费用处理/中转资金分发
