// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUniswapV2Router02} from "../interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Pair} from "../interfaces/IUniswapV2Pair.sol";
import {IUniswapV2Factory} from "../interfaces/IUniswapV2Factory.sol";
import {IStaking} from "../interfaces/IStaking.sol";
import {FundRelay} from "../utils/FundRelay.sol";
import {Helper} from "../utils/Helper.sol";

/**
 * @title SYIBase - Base implementation for SYI token contracts
 * @notice Base contract containing all shared logic for mainnet and testnet SYI
 * @dev Environment-specific constants are defined as abstract functions
 */
abstract contract SYIBase is ERC20, Ownable {
    // =========================================================================
    // ABSTRACT FUNCTIONS - Environment specific constants
    // =========================================================================

    function getDelayedBuyPeriod() internal pure virtual returns (uint256);
    function getPresaleDuration() internal pure virtual returns (uint256);

    // =========================================================================
    // EVENTS - Keep all original events
    // =========================================================================

    event TransactionExecuted(
        address indexed user,
        uint256 indexed timestamp,
        string indexed txType,
        uint256 tokenAmount,
        uint256 usdtAmount,
        uint256 netUserReceived,
        uint256 previousInvestment,
        uint256 newInvestment,
        uint256 burnFee,
        uint256 lpFee,
        uint256 marketingFee,
        uint256 profitAmount,
        uint256 profitTax,
        address referrer
    );

    event FeesProcessed(
        uint256 indexed timestamp,
        string indexed processType,
        uint256 totalFeesXF,
        uint256 totalFeesUSDT,
        uint256 lpAmount,
        uint256 marketingAmount,
        uint256 burnAmount,
        address lpRecipient,
        address marketingRecipient
    );

    event MarketingAddressUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );
    event SwapFailed(string reason, uint256 tokenAmount, uint256 timestamp);
    event FundRelayTransferFailed(
        uint256 expectedAmount,
        uint256 actualAmount,
        uint256 timestamp
    );
    event DelayedBuyEnabled(bool enabled);
    event DelayedBuyPeriodUpdated(uint256 newPeriod);

    event TokensBurned(uint256 amount);
    event LiquidityAdded(uint256 tokenAmount, uint256 usdtAmount);
    event LPRewardDeposited(uint256 amount);
    event InvestmentUpdated(
        address indexed user,
        uint256 indexed timestamp,
        uint256 previousInvestment,
        uint256 newInvestment,
        uint256 changeAmount,
        string changeType
    );

    // Backward compatible events
    event UserTransaction(
        address indexed user,
        uint256 indexed timestamp,
        string txType,
        uint256 tokenAmount,
        uint256 usdtAmount,
        uint256 netReceived
    );
    event FeeCollected(
        address indexed user,
        uint256 amount,
        string indexed category,
        address indexed recipient
    );

    // Legacy events
    event PresaleDurationUpdated(uint256 newDuration);
    event PresaleStatusUpdated(bool active);

    event LiquidityHandleFeeCollected(
        address indexed from,
        address indexed to,
        uint256 feeAmount,
        uint256 netAmount,
        string operationType
    );
    event TransferFeeCollected(
        address indexed from,
        address indexed to,
        uint256 feeAmount,
        uint256 netAmount,
        string transferType
    );
    event LPDistribution(
        uint256 indexed timestamp,
        uint256 regularFeesXF,
        uint256 regularFeesUSDT,
        address liquidityStakingContract,
        string source
    );

    event FeesAccumulated(
        string feeType,
        uint256 amount,
        uint256 totalAccumulated
    );
    event FeeProcessingSkipped(
        uint256 totalFees,
        string reason,
        uint256 timestamp
    );
    event FeeProcessingTriggered(
        uint256 totalFees,
        address indexed triggeredBy,
        string triggerType,
        uint256 timestamp
    );
    event MarketingDistribution(
        uint256 timestamp,
        uint256 tokenAmount,
        uint256 usdtAmount,
        uint256 rewardIndex,
        address indexed recipient,
        string distributionType
    );
    event AutoSwapTriggered(
        uint256 marketingFee,
        uint256 lpFee,
        string trigger
    );
    event NoProfitFeeCollected(
        address indexed seller,
        uint256 indexed timestamp,
        uint256 feeAmountXF,
        uint256 feeAmountUSDT,
        uint256 saleValueUSDT,
        uint256 userInvestmentUSDT
    );

    event SellTransaction(
        address indexed seller,
        uint256 indexed timestamp,
        uint256 originalXFAmount,
        uint256 tradingFeeXF,
        uint256 marketingFeeXF,
        uint256 lpFeeXF,
        uint256 netXFAfterTradingFees,
        uint256 estimatedUSDTFromSale,
        uint256 userHistoricalInvestment,
        uint256 totalProfitAmount,
        uint256 profitTaxUSDT,
        uint256 noProfitFeeUSDT,
        uint256 profitTaxToMarketing,
        uint256 profitTaxToReferrer,
        uint256 userNetProfitUSDT,
        uint256 finalUSDTReceived,
        address referrer
    );

    // =========================================================================
    // ERRORS
    // =========================================================================

    error InColdPeriod();
    error Blacklisted();
    error ZeroAddress();
    error AlreadySet();
    error NotAllowedBuy();
    error DelayedBuyPeriodNotMet();
    error InsufficientBalance();
    error AlreadyInitialized();

    // =========================================================================
    // CONSTANTS & IMMUTABLES
    // =========================================================================

    address public constant DEAD_ADDRESS =
        0x000000000000000000000000000000000000dEaD;
    uint256 private constant BASIS_POINTS = 10000;
    uint256 private constant BUY_BURN_FEE = 100; // 1%
    uint256 private constant BUY_LIQUIDITY_FEE = 200; // 2%
    uint256 private constant SELL_MARKETING_FEE = 150; // 1.5%
    uint256 private constant SELL_LIQUIDITY_ACCUM_FEE = 150; // 1.5%
    uint256 private constant PROFIT_TAX_RATE = 2500; // 25%
    uint256 private constant NO_PROFIT_FEE = 2500; // 25%
    uint256 private constant LP_HANDLE_FEE = 250; // 2.5%

    address public immutable USDT;
    IUniswapV2Router02 public immutable uniswapV2Router;
    IStaking public immutable staking;

    // =========================================================================
    // STATE VARIABLES
    // =========================================================================

    IUniswapV2Pair public uniswapV2Pair;
    FundRelay public fundRelay;
    address public rootAddress;
    address public marketingAddress;
    address public nodeDividendAddress;
    uint256 public coldTime = 10 seconds;
    uint256 public amountMarketingFee;
    uint256 public amountLPFee;
    uint256 public swapAtAmount = 10000 ether;

    uint256 public presaleStartTime;
    uint256 public presaleDuration;
    bool public presaleActive;

    bool public delayedBuyEnabled;
    uint256 public contractDeployTime;
    uint256 public delayedBuyEnabledTime;

    bool private _inSwap;
    bool private _inRouterSwap;
    bool private _inLiquidityOperation;

    mapping(address => uint256) public userInvestment;
    mapping(address => uint256) public lastBuyTime;
    mapping(address => bool) public feeWhitelisted;
    mapping(address => bool) public blacklisted;

    uint256 public liquidityThreshold = 1 gwei;
    bool private _whitelistInitialized;

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    modifier notBlacklisted(address account) {
        if (blacklisted[account]) revert Blacklisted();
        _;
    }

    modifier lockSwap() {
        _inSwap = true;
        _;
        _inSwap = false;
    }

    modifier delayedBuyCheck(address buyer) {
        if (delayedBuyEnabled && !feeWhitelisted[buyer]) {
            uint256 requiredDelay = getDelayedBuyPeriod();
            uint256 baseTime = delayedBuyEnabledTime > 0
                ? delayedBuyEnabledTime
                : contractDeployTime;
            if (block.timestamp < baseTime + requiredDelay) {
                revert DelayedBuyPeriodNotMet();
            }
        }
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(
        address _usdt,
        address _router,
        address _staking,
        address _marketingAddress
    ) ERC20("SYI Token", "SYI") Ownable(msg.sender) {
        if (
            _usdt == address(0) ||
            _router == address(0) ||
            _staking == address(0) ||
            _marketingAddress == address(0)
        ) revert ZeroAddress();

        USDT = _usdt;
        uniswapV2Router = IUniswapV2Router02(_router);
        staking = IStaking(_staking);
        marketingAddress = _marketingAddress;

        _mint(owner(), 10_000_000 ether);

        contractDeployTime = block.timestamp;
        presaleStartTime = block.timestamp;
        presaleDuration = getPresaleDuration();
        presaleActive = true;
    }

    // =========================================================================
    // WHITELIST INITIALIZATION
    // =========================================================================

    /**
     * @notice Initialize fee whitelist addresses
     * @dev Can only be called once to set initial whitelisted addresses
     * @dev This separation allows for cleaner constructor and explicit initialization
     */
    function initializeWhitelist() external onlyOwner {
        if (_whitelistInitialized) revert AlreadyInitialized();

        _whitelistInitialized = true;

        // Whitelist core addresses
        feeWhitelisted[owner()] = true;
        feeWhitelisted[address(this)] = true;
        feeWhitelisted[address(staking)] = true;
        feeWhitelisted[marketingAddress] = true;
        feeWhitelisted[address(uniswapV2Router)] = true;
    }

    // =========================================================================
    // EXTERNAL FUNCTIONS
    // =========================================================================

    function setPair(address _pair) external onlyOwner {
        if (_pair == address(0)) revert ZeroAddress();
        if (address(uniswapV2Pair) != address(0)) revert AlreadySet();
        uniswapV2Pair = IUniswapV2Pair(_pair);
        _updatePresaleDurationFromStaking();
    }

    function setFundRelay(address _fundRelay) external onlyOwner {
        if (_fundRelay == address(0)) revert ZeroAddress();
        fundRelay = FundRelay(_fundRelay);
        feeWhitelisted[_fundRelay] = true;
    }

    function setMarketingAddress(address _newAddress) external onlyOwner {
        if (_newAddress == address(0)) revert ZeroAddress();
        address oldAddress = marketingAddress;
        marketingAddress = _newAddress;
        feeWhitelisted[_newAddress] = true;
        emit MarketingAddressUpdated(oldAddress, _newAddress);
    }

    function setNodeDividendAddress(address _node) external onlyOwner {
        if (_node == address(0)) revert ZeroAddress();
        nodeDividendAddress = _node;
    }

    function setFeeWhitelisted(
        address account,
        bool whitelisted
    ) external onlyOwner {
        feeWhitelisted[account] = whitelisted;
    }

    function setBatchFeeWhitelisted(
        address[] memory accounts,
        bool _whitelisted
    ) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            feeWhitelisted[accounts[i]] = _whitelisted;
        }
    }

    function setBatchBlacklisted(
        address[] memory accounts,
        bool _blacklisted
    ) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            blacklisted[accounts[i]] = _blacklisted;
        }
    }

    function setBlacklisted(
        address account,
        bool _blacklisted
    ) external onlyOwner {
        blacklisted[account] = _blacklisted;
    }

    function setSwapAtAmount(uint256 _swapAtAmount) external onlyOwner {
        swapAtAmount = _swapAtAmount;
    }

    function setColdTime(uint256 _coldTime) external onlyOwner {
        coldTime = _coldTime;
    }

    function setLiquidityThreshold(uint256 newThreshold) external onlyOwner {
        liquidityThreshold = newThreshold;
    }

    function setPresaleDuration() external onlyOwner {
        _updatePresaleDurationFromStaking();
    }

    function setPresaleActive(bool _active) external onlyOwner {
        presaleActive = _active;
        if (_active) {
            presaleStartTime = block.timestamp;
            presaleDuration = getPresaleDuration();
            emit PresaleDurationUpdated(presaleDuration);
        }
        emit PresaleStatusUpdated(_active);
    }

    function recoverStuckTokens(
        address token,
        uint256 amount
    ) external onlyOwner {
        if (token == address(this)) return;
        IERC20(token).transfer(owner(), amount);
    }

    /**
     * @notice 从流动性池回收 SYI 代币到 Staking 合约，用于奖励分发
     * @dev 这是一个关键的经济循环机制：
     *      1. 用户交易产生的代币留在流动性池中
     *      2. Staking 合约需要代币来支付质押奖励
     *      3. 通过 recycle 从池子回收代币，形成闭环
     *
     * @param amount Staking 合约请求回收的数量
     *
     * 工作流程：
     * ┌─────────────┐  交易税/代币  ┌──────────────┐
     * │ 流动性池    │ ──────────→  │  池子积累    │
     * │ (Pair)      │              │  SYI 代币    │
     * └─────────────┘              └──────────────┘
     *       ↑                              ↓
     *       │                         recycle()
     *       │                              ↓
     *       │                      ┌──────────────┐
     *       │                      │   Staking    │
     *       │                      │   合约       │
     *       │                      └──────────────┘
     *       │                              ↓
     *       │                        分发质押奖励
     *       │                              ↓
     *       └────────── 用户卖出 ──────────┘
     */
    function recycle(uint256 amount) external {
        // ========================================
        // 1. 权限检查：只允许 Staking 合约调用
        // ========================================
        // 防止任意地址从流动性池抽取代币，避免价格操纵
        require(msg.sender == address(staking), "Only staking contract");

        // ========================================
        // 2. 获取流动性池中的 SYI 代币余额
        // ========================================
        // balanceOf(address(uniswapV2Pair)) 的含义：
        // - balanceOf() 是 SYI 代币合约的函数
        // - 查询的是：uniswapV2Pair 这个地址拥有多少 SYI 代币
        // - 就像查询你的钱包余额，这里查的是"Pair 合约这个钱包"的余额
        //
        // 重要区别：balance（实际余额） vs reserve（账面储备量）
        // ┌────────────────────────────────────────────────────────┐
        // │ balance（实际余额）：                                  │
        // │   - SYI 代币合约里记录的："Pair 地址拥有多少 SYI"     │
        // │   - 这是真实的、即时的代币数量                         │
        // │   - 每次转账都会立即更新                               │
        // │                                                        │
        // │ reserve（账面储备量）：                                │
        // │   - Pair 合约自己记录的："我认为我有多少 SYI"         │
        // │   - 只在 mint/burn/swap/sync 时更新                   │
        // │   - 用于 AMM 价格计算（x * y = k）                    │
        // └────────────────────────────────────────────────────────┘
        //
        // 为什么会不一致？举例：
        // 1. 初始状态：
        //    balance = 1000万，reserve = 1000万 ✅ 一致
        //
        // 2. 有人直接转账 100万 SYI 给 Pair（不通过 Router）：
        //    balance = 1100万 ← SYI 合约立即更新
        //    reserve = 1000万 ← Pair 合约不知道收到钱了
        //    差额 100万 = 可以被 skim() 取走的"意外捐赠"
        //
        // 3. 或者：交易税留在了 Pair 里（如果 SYI 有税）：
        //    balance = 1050万 ← 税费累积在 Pair 地址
        //    reserve = 1000万 ← Pair 只知道交易的净额
        //    差额 50万 = 可以回收的"多余代币"
        //
        // 所以这里获取的是"真实余额"，而不是"Pair 认为的余额"
        uint256 pairBalance = balanceOf(address(uniswapV2Pair));

        // ========================================
        // 3. 计算最大可回收数量（安全上限：1/3）
        // ========================================
        // 为什么是 1/3？保护流动性不被过度抽取
        // 示例：池子有 300 万 SYI，最多一次回收 100 万
        // 这样可以：
        // - 保证池子还有足够流动性供用户交易
        // - 避免单次回收导致价格剧烈波动
        // - 防止恶意耗尽流动性攻击
        uint256 maxRecyclable = pairBalance / 3;

        // ========================================
        // 4. 确定实际回收数量（取较小值）
        // ========================================
        // 如果 Staking 请求 150 万，但最多只能回收 100 万
        // 那么实际回收 100 万（以安全上限为准）
        uint256 recycleAmount = amount >= maxRecyclable
            ? maxRecyclable  // 请求过多，回收上限
            : amount;        // 请求合理，按需回收

        // ========================================
        // 5. 执行回收操作
        // ========================================
        if (recycleAmount > 0) {
            // 5.1 直接更新余额：从 Pair 转移到 Staking
            // 注意：这里用 _update 而不是 transfer
            // 因为这是特殊的内部操作，不触发交易税等逻辑
            _update(address(uniswapV2Pair), address(staking), recycleAmount);

            // 5.2 同步 Pair 合约的储备量
            // 关键步骤！必须调用 sync() 的原因：
            // ┌─────────────────────────────────────────────┐
            // │ Uniswap V2 的储备量机制：                   │
            // │ - reserve: Pair 合约记录的"账面"储备量     │
            // │ - balance: Pair 合约的实际代币余额         │
            // │                                             │
            // │ 我们直接修改了 balance（通过 _update）     │
            // │ 但 reserve 还是旧的，会导致：              │
            // │   ❌ 价格计算错误                          │
            // │   ❌ 交易滑点异常                          │
            // │   ❌ K 值验证失败                          │
            // │                                             │
            // │ sync() 的作用：                             │
            // │   reserve0 = balance0  ✅                  │
            // │   reserve1 = balance1  ✅                  │
            // │   强制同步账面和实际余额                    │
            // └─────────────────────────────────────────────┘
            uniswapV2Pair.sync();

            // 完成！现在：
            // ✅ Staking 合约收到了代币，可以分发奖励
            // ✅ Pair 合约的储备量已同步，价格正常
            // ✅ 流动性池还保留了 2/3 的代币，交易正常
        }
        // 如果 recycleAmount == 0（比如池子余额为 0），则什么都不做
    }

    function setDelayedBuyEnabled(bool _enabled) external onlyOwner {
        delayedBuyEnabled = _enabled;

        if (_enabled) {
            delayedBuyEnabledTime = block.timestamp;
        } else {
            delayedBuyEnabledTime = 0;
        }

        emit DelayedBuyEnabled(_enabled);
    }

    // =========================================================================
    // EXTERNAL VIEW FUNCTIONS
    // =========================================================================

    function getAccumulatedFees()
        external
        view
        returns (uint256 marketing, uint256 lp, uint256 threshold)
    {
        return (amountMarketingFee, amountLPFee, swapAtAmount);
    }

    function getUserInvestment(
        address user
    ) external view returns (uint256 investment, uint256 lastBuy) {
        return (userInvestment[user], lastBuyTime[user]);
    }

    function getUniswapV2Pair() external view returns (address) {
        return address(uniswapV2Pair);
    }

    function getFundRelay() external view returns (address) {
        return address(fundRelay);
    }

    function getUSDTReserve() external view returns (uint112 usdtReserve) {
        try uniswapV2Pair.getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32
        ) {
            return uniswapV2Pair.token0() == USDT ? reserve0 : reserve1;
        } catch {
            return 0;
        }
    }

    function getDelayedSwapStatus()
        external
        view
        returns (bool pending, uint256 totalFees)
    {
        return (false, amountMarketingFee + amountLPFee);
    }

    function getPresaleStatus()
        external
        view
        returns (
            bool active,
            uint256 startTime,
            uint256 duration,
            uint256 remainingTime,
            bool isInPresale
        )
    {
        uint256 endTime = presaleStartTime + presaleDuration;
        uint256 remaining = block.timestamp < endTime
            ? endTime - block.timestamp
            : 0;
        bool inPresale = presaleActive && block.timestamp < endTime;

        return (
            presaleActive,
            presaleStartTime,
            presaleDuration,
            remaining,
            inPresale
        );
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountOut) {
        return Helper.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountIn) {
        return Helper.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function isContract(address account) external view returns (bool) {
        return Helper.isContract(account);
    }

    function getDelayedBuyInfo()
        external
        view
        returns (
            bool enabled,
            bool testModeActive,
            uint256 enabledTime,
            uint256 requiredDelay,
            uint256 remainingDelay
        )
    {
        enabled = delayedBuyEnabled;
        testModeActive = false; // No longer needed in separated contracts
        enabledTime = delayedBuyEnabledTime;
        requiredDelay = getDelayedBuyPeriod();

        if (!enabled) {
            remainingDelay = 0;
        } else {
            uint256 baseTime = delayedBuyEnabledTime > 0
                ? delayedBuyEnabledTime
                : contractDeployTime;

            if (block.timestamp >= baseTime + requiredDelay) {
                remainingDelay = 0;
            } else {
                remainingDelay = (baseTime + requiredDelay) - block.timestamp;
            }
        }
    }

    function isDelayedBuyPeriodMet(address buyer) external view returns (bool) {
        if (!delayedBuyEnabled || feeWhitelisted[buyer]) return true;

        uint256 requiredDelay = getDelayedBuyPeriod();

        uint256 baseTime = delayedBuyEnabledTime > 0
            ? delayedBuyEnabledTime
            : contractDeployTime;

        return block.timestamp >= baseTime + requiredDelay;
    }

    // =========================================================================
    // PUBLIC FUNCTIONS
    // =========================================================================

    function transfer(
        address to,
        uint256 value
    ) public override returns (bool) {
        address sender = _msgSender();
        _update(sender, to, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, value);
        _update(from, to, value);
        return true;
    }

    // =========================================================================
    // INTERNAL FUNCTIONS - Core transfer logic
    // =========================================================================

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        bool isZeroAddress = from == address(0) || to == address(0);

        if (isZeroAddress) {
            super._update(from, to, value);
            return;
        }

        // Check whitelist status early
        bool isWhitelisted = feeWhitelisted[from] || feeWhitelisted[to];

        // Direct transfers not involving pair
        if (isWhitelisted) {
            super._update(from, to, value);
            return;
        }

        bool isBuy = _isBuyOperation(from, to);
        bool isSell = _isSellOperation(from, to);

        if (isBuy) {
            _handleBuy(from, to, value);
        } else if (isSell) {
            _handleSell(from, to, value);
        } else {
            super._update(from, to, value);
            _tryTriggerFundRelayDistribution();
        }
    }

    function _handleLiquidityOperation(
        address from,
        address to,
        uint256 amount,
        string memory operationType
    ) private {
        uint256 liquidityFee = (amount * LP_HANDLE_FEE) / BASIS_POINTS;
        uint256 netAmount = amount - liquidityFee;

        if (liquidityFee > 0) {
            super._update(from, marketingAddress, liquidityFee);
            emit LiquidityHandleFeeCollected(
                from,
                to,
                liquidityFee,
                netAmount,
                operationType
            );
        }

        super._update(from, to, netAmount);
    }

    function _isBuyOperation(
        address from,
        address to
    ) private view returns (bool) {
        address pair = address(uniswapV2Pair);
        address router = address(uniswapV2Router);

        if (from != pair) return false;
        if (to == pair) return false;
        if (to == router) return false;
        if (msg.sender != pair) return false;

        return true;
    }

    function _isSellOperation(
        address from,
        address to
    ) private view returns (bool) {
        address pair = address(uniswapV2Pair);
        address router = address(uniswapV2Router);

        if (to != pair) return false;
        if (from == pair) return false;
        if (from == router) return false;
        if (msg.sender == pair) return false;

        return true;
    }

    function _handleBuy(
        address from,
        address to,
        uint256 amount
    ) private notBlacklisted(to) delayedBuyCheck(to) {
        if (
            presaleActive &&
            block.timestamp < presaleStartTime + presaleDuration
        ) {
            revert NotAllowedBuy();
        }

        // 只保留 1% burn 费用，移除 2% LP 费用
        uint256 burnFee = (amount * BUY_BURN_FEE) / BASIS_POINTS;
        uint256 totalFees = burnFee;
        uint256 netAmount = amount - totalFees;

        if (burnFee > 0) {
            super._update(from, DEAD_ADDRESS, burnFee);
            emit TokensBurned(burnFee);
        }

        super._update(from, to, netAmount);

        _updateBuyInvestmentAndEmitEvent(
            to,
            amount,
            netAmount,
            burnFee,
            0  // liquidityFee 设为 0
        );
    }

    function _handleSell(
        address from,
        address to,
        uint256 amount
    ) private notBlacklisted(from) {
        if (block.timestamp < lastBuyTime[from] + coldTime)
            revert InColdPeriod();

        // 只保留 1.5% marketing 费用，移除 1.5% LP 费用
        uint256 marketingFee = (amount * SELL_MARKETING_FEE) / BASIS_POINTS;
        uint256 netAmountAfterTradingFees = amount - marketingFee;

        uint256 estimatedUSDTFromSale = _estimateSwapOutput(
            netAmountAfterTradingFees
        );

        uint256 profitTaxUSDT = 0;
        uint256 profitTaxInSYI = 0;
        uint256 profitAmount = 0;
        uint256 noProfitFeeUSDT = 0;
        uint256 userCurrentInvestment = userInvestment[from];

        if (
            userCurrentInvestment > 0 &&
            estimatedUSDTFromSale > userCurrentInvestment
        ) {
            profitAmount = estimatedUSDTFromSale - userCurrentInvestment;
            profitTaxUSDT = (profitAmount * PROFIT_TAX_RATE) / BASIS_POINTS;

            profitTaxInSYI =
                (profitTaxUSDT * netAmountAfterTradingFees) /
                estimatedUSDTFromSale;
        }

        uint256 netAmount = amount - marketingFee - profitTaxInSYI;

        uint256 actualUSDTReceived = estimatedUSDTFromSale -
            profitTaxUSDT -
            noProfitFeeUSDT;

        if (marketingFee > 0) {
            super._update(from, address(this), marketingFee);
            amountMarketingFee += marketingFee;
        }

        uint256 profitTaxToMarketing = 0;
        uint256 profitTaxToReferrer = 0;

        if (profitTaxInSYI > 0) {
            super._update(from, address(this), profitTaxInSYI);

            uint256 usdtAmountFromProfitTax = _swapTokensForUSDT(
                profitTaxInSYI
            );

            if (usdtAmountFromProfitTax > 0) {
                // 盈利税全部给节点/营销地址，不再分给 LP
                address nodeAddr = nodeDividendAddress != address(0)
                    ? nodeDividendAddress
                    : marketingAddress;
                IERC20(USDT).transfer(nodeAddr, usdtAmountFromProfitTax);

                profitTaxToMarketing = usdtAmountFromProfitTax;
                profitTaxToReferrer = 0;  // 不再有 LP 份额
            }
        }

        super._update(from, to, netAmount);

        _updateInvestmentAfterSell(from, actualUSDTReceived);

        _emitSellTransactionEvent(
            from,
            amount,
            marketingFee,
            0,  // liquidityAccumFee 设为 0
            netAmountAfterTradingFees,
            estimatedUSDTFromSale,
            userCurrentInvestment,
            profitTaxUSDT,
            noProfitFeeUSDT,
            profitTaxToMarketing,
            profitTaxToReferrer,
            actualUSDTReceived
        );
    }

    // Continue with all other internal helper functions...
    // The complete implementation would include all helper functions from original SYI.sol

    function _updatePresaleDurationFromStaking() private {
        presaleDuration = getPresaleDuration();
        emit PresaleDurationUpdated(presaleDuration);
    }

    function _swapTokensForUSDT(
        uint256 tokenAmount
    ) private lockSwap returns (uint256 usdtReceived) {
        if (tokenAmount == 0 || balanceOf(address(this)) < tokenAmount)
            return 0;

        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = USDT;

        _approve(address(this), address(uniswapV2Router), tokenAmount);

        address recipient = address(fundRelay) != address(0)
            ? address(fundRelay)
            : address(this);
        uint256 initialBalance = IERC20(USDT).balanceOf(address(this));

        try
            uniswapV2Router
                .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    tokenAmount,
                    0,
                    path,
                    recipient,
                    block.timestamp + 300
                )
        {
            if (address(fundRelay) != address(0)) {
                uint256 received = fundRelay.receiveAndForward();
                if (received == 0) {
                    emit SwapFailed(
                        "FundRelay transfer failed",
                        tokenAmount,
                        block.timestamp
                    );
                    emit FundRelayTransferFailed(0, 0, block.timestamp);
                }
                return received;
            } else {
                uint256 finalBalance = IERC20(USDT).balanceOf(address(this));
                uint256 actualReceived = finalBalance > initialBalance
                    ? finalBalance - initialBalance
                    : 0;

                if (actualReceived == 0) {
                    emit SwapFailed(
                        "Direct swap returned zero USDT",
                        tokenAmount,
                        block.timestamp
                    );
                }

                return actualReceived;
            }
        } catch Error(string memory reason) {
            emit SwapFailed(reason, tokenAmount, block.timestamp);
            return 0;
        } catch {
            emit SwapFailed("Unknown swap error", tokenAmount, block.timestamp);
            return 0;
        }
    }

    // Helper functions with complete implementation
    function _estimateSwapOutput(
        uint256 xfAmount
    ) private view returns (uint256 usdtAmount) {
        try uniswapV2Pair.getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32
        ) {
            (uint112 reserveUSDT, uint112 reserveXF) = uniswapV2Pair.token0() ==
                USDT
                ? (reserve0, reserve1)
                : (reserve1, reserve0);

            if (reserveXF > 0 && reserveUSDT > 0) {
                return Helper.getAmountOut(xfAmount, reserveXF, reserveUSDT);
            }
        } catch {}
        return 0;
    }

    function _getMinimumSwapOutput(
        uint256 tokenAmount
    ) private view returns (uint256) {
        uint256 estimatedOutput = _estimateSwapOutput(tokenAmount);
        return (estimatedOutput * 95) / 100; // 5% slippage protection
    }

    function _estimateBuyUSDTCost(
        uint256 xfAmount
    ) private view returns (uint256 usdtCost) {
        try uniswapV2Pair.getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32
        ) {
            (uint112 reserveUSDT, uint112 reserveXF) = uniswapV2Pair.token0() ==
                USDT
                ? (reserve0, reserve1)
                : (reserve1, reserve0);

            if (reserveXF > 0 && reserveUSDT > 0) {
                uint256 grossXFAmount = (xfAmount * BASIS_POINTS) /
                    (BASIS_POINTS - BUY_BURN_FEE - BUY_LIQUIDITY_FEE);
                return
                    Helper.getAmountIn(grossXFAmount, reserveUSDT, reserveXF);
            }
        } catch {}
        return xfAmount;
    }

    function _updateBuyInvestmentAndEmitEvent(
        address to,
        uint256 amount,
        uint256 netAmount,
        uint256 burnFee,
        uint256 liquidityFee
    ) private {
        uint256 estimatedUSDTCost = _estimateBuyUSDTCost(netAmount);
        uint256 previousInvestment = userInvestment[to];

        userInvestment[to] = previousInvestment + estimatedUSDTCost;
        lastBuyTime[to] = block.timestamp;

        emit InvestmentUpdated(
            to,
            block.timestamp,
            previousInvestment,
            userInvestment[to],
            estimatedUSDTCost,
            "BUY"
        );

        emit TransactionExecuted(
            to,
            block.timestamp,
            "BUY",
            amount,
            estimatedUSDTCost,
            netAmount,
            previousInvestment,
            userInvestment[to],
            burnFee,
            liquidityFee,
            0,
            0,
            0,
            address(0)
        );

        emit UserTransaction(
            to,
            block.timestamp,
            "BUY",
            amount,
            estimatedUSDTCost,
            netAmount
        );
    }

    function _updateInvestmentAfterSell(
        address user,
        uint256 actualUSDTReceived
    ) private {
        uint256 previousInvestment = userInvestment[user];
        userInvestment[user] = previousInvestment <= actualUSDTReceived
            ? 0
            : previousInvestment - actualUSDTReceived;

        emit InvestmentUpdated(
            user,
            block.timestamp,
            previousInvestment,
            userInvestment[user],
            actualUSDTReceived,
            "SELL"
        );
    }

    function _emitSellTransactionEvent(
        address from,
        uint256 amount,
        uint256 marketingFee,
        uint256 liquidityAccumFee,
        uint256 netAmountAfterTradingFees,
        uint256 estimatedUSDTFromSale,
        uint256 userCurrentInvestment,
        uint256 profitTaxUSDT,
        uint256 noProfitFeeUSDT,
        uint256 profitTaxToMarketing,
        uint256 profitTaxToReferrer,
        uint256 actualUSDTReceived
    ) private {
        uint256 totalProfitAmount = profitTaxUSDT > 0
            ? (profitTaxUSDT * BASIS_POINTS) / PROFIT_TAX_RATE
            : 0;

        emit SellTransaction(
            from,
            block.timestamp,
            amount,
            marketingFee + liquidityAccumFee,
            marketingFee,
            liquidityAccumFee,
            netAmountAfterTradingFees,
            estimatedUSDTFromSale,
            userCurrentInvestment,
            totalProfitAmount,
            profitTaxUSDT,
            noProfitFeeUSDT,
            profitTaxToMarketing,
            profitTaxToReferrer,
            actualUSDTReceived - profitTaxUSDT - noProfitFeeUSDT,
            actualUSDTReceived,
            address(0)
        );

        emit TransactionExecuted(
            from,
            block.timestamp,
            "SELL",
            amount,
            estimatedUSDTFromSale,
            actualUSDTReceived,
            userCurrentInvestment,
            userInvestment[from],
            0,
            0,
            marketingFee + liquidityAccumFee,
            totalProfitAmount,
            profitTaxUSDT,
            address(0)
        );
    }

    function _tryTriggerFundRelayDistribution() private {
        if (address(fundRelay) == address(0)) return;

        try fundRelay.receiveAndForward() returns (uint256 received) {
            if (received > 0) {
                emit FeeCollected(
                    address(this),
                    received,
                    "FUND_RELAY_DISTRIBUTION",
                    address(this)
                );
            }
        } catch {}
    }

    function triggerFundRelayDistribution() external {
        require(
            msg.sender == address(staking),
            "Only staking contract"
        );
        _tryTriggerFundRelayDistribution();
        _tryProcessAccumulatedFees();
    }

    function _tryProcessAccumulatedFees() private {
        uint256 totalFees = amountMarketingFee;

        if (totalFees >= swapAtAmount && !_inSwap) {
            if (_canProcessFees()) {
                emit FeeProcessingTriggered(
                    totalFees,
                    msg.sender,
                    "AUTO_THRESHOLD",
                    block.timestamp
                );
                _processFeeDistribution();
            } else {
                emit FeeProcessingSkipped(
                    totalFees,
                    "INSUFFICIENT_LIQUIDITY",
                    block.timestamp
                );
            }
        }
    }

    function _canProcessFees() private view returns (bool) {
        uint256 totalFees = amountMarketingFee;
        if (totalFees == 0) return false;
        if (balanceOf(address(this)) < totalFees) return false;

        try uniswapV2Pair.getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32
        ) {
            (uint112 reserveUSDT, uint112 reserveXF) = uniswapV2Pair.token0() ==
                USDT
                ? (reserve0, reserve1)
                : (reserve1, reserve0);

            uint256 actualXFBalance = balanceOf(address(uniswapV2Pair));
            uint256 actualUSDTBalance = IERC20(USDT).balanceOf(
                address(uniswapV2Pair)
            );

            if (actualXFBalance < (uint256(reserveXF) * 95) / 100) {
                return false;
            }

            if (actualUSDTBalance < (uint256(reserveUSDT) * 95) / 100) {
                return false;
            }

            uint256 maxSwapAmount = (uint256(reserveXF) * 2) / 100;
            if (totalFees > maxSwapAmount) {
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }

    function _processFeeDistribution() private lockSwap {
        uint256 totalMarketingFee = amountMarketingFee;

        if (totalMarketingFee == 0) return;

        amountMarketingFee = 0;

        uint256 marketingUSDT = 0;

        if (totalMarketingFee > 0) {
            marketingUSDT = _swapTokensForUSDT(totalMarketingFee);
            if (marketingUSDT > 0 && marketingAddress != address(0)) {
                IERC20(USDT).transfer(marketingAddress, marketingUSDT);
            }
        }

        emit FeesProcessed(
            block.timestamp,
            "ACCUMULATED_FEES",
            totalMarketingFee,
            marketingUSDT,
            0,  // lpUSDT = 0
            marketingUSDT,
            0,
            address(0),  // 不再有 liquidityStaking
            marketingAddress
        );
    }

    function _addLiquidity(uint256 tokenAmount, uint256 usdtAmount) private {
        _approve(address(this), address(uniswapV2Router), tokenAmount);
        IERC20(USDT).approve(address(uniswapV2Router), usdtAmount);

        try
            uniswapV2Router.addLiquidity(
                address(this),
                USDT,
                tokenAmount,
                usdtAmount,
                0,
                0,
                DEAD_ADDRESS,
                block.timestamp + 300
            )
        {
            emit LiquidityAdded(tokenAmount, usdtAmount);
        } catch {}
    }

    function _emitBuyTransactionEvent(
        address to,
        uint256 amount,
        uint256 estimatedUSDTSpent,
        uint256 burnFee,
        uint256 liquidityFee
    ) private {
        address referrer = address(staking) != address(0)
            ? IStaking(staking).getReferral(to)
            : address(0);

        emit FeesProcessed(
            block.timestamp,
            "BUY",
            amount,
            estimatedUSDTSpent,
            liquidityFee,
            0,
            burnFee,
            to,
            referrer
        );
    }

    function _estimateSwapInput(
        uint256 usdtAmount
    ) private view returns (uint256) {
        if (usdtAmount == 0) return 0;

        address[] memory path = new address[](2);
        path[0] = USDT;
        path[1] = address(this);

        try uniswapV2Router.getAmountsOut(usdtAmount, path) returns (
            uint256[] memory amounts
        ) {
            return amounts[1];
        } catch {
            return 0;
        }
    }

    function _getUserReferrer(
        address user
    ) private view returns (address referrer) {
        try staking.getReferral(user) returns (address _referrer) {
            return _referrer;
        } catch {
            return address(0);
        }
    }

    function _isReferrerEligible(address referrer) private view returns (bool) {
        try staking.isPreacher(referrer) returns (bool isEligible) {
            return isEligible;
        } catch {
            return false;
        }
    }

    function _processFundRelayFees(uint256 xfAmount) private {
        fundRelay.withdrawSYIToContract(xfAmount);

        _approve(address(this), address(uniswapV2Router), xfAmount);

        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = USDT;

        try
            uniswapV2Router.swapExactTokensForTokens(
                xfAmount,
                0,
                path,
                address(fundRelay),
                block.timestamp + 300
            )
        returns (uint256[] memory amounts) {
            uint256 usdtAmount = amounts[1];
            if (usdtAmount == 0) return;

            fundRelay.withdrawToSYI(usdtAmount);

            // 全部给营销地址，不再分给 LP
            if (usdtAmount > 0) {
                IERC20(USDT).transfer(marketingAddress, usdtAmount);
            }

            emit FeesProcessed(
                block.timestamp,
                "FUND_RELAY_FEES",
                xfAmount,
                usdtAmount,
                0,  // lpShare = 0
                usdtAmount,  // 全部给 marketing
                0,
                address(0),  // 不再有 liquidityStaking
                marketingAddress
            );
        } catch {}
    }

    function _processImmediateLiquidity(uint256 liquidityFee) private {
        if (liquidityFee == 0) return;

        if (_inSwap) {
            if (address(fundRelay) != address(0)) {
                super._update(address(this), address(fundRelay), liquidityFee);
            } else {
                amountLPFee += liquidityFee;
            }
            return;
        }

        _processImmediateLiquidityInternal(liquidityFee);
    }

    function _processImmediateLiquidityInternal(
        uint256 liquidityFee
    ) private lockSwap {
        uint256 half = liquidityFee / 2;
        uint256 otherHalf = liquidityFee - half;
        uint256 usdtAmount = _swapTokensForUSDT(half);

        if (usdtAmount > 0) {
            _addLiquidity(otherHalf, usdtAmount);

            emit FeesProcessed(
                block.timestamp,
                "IMMEDIATE_LP",
                liquidityFee,
                usdtAmount,
                usdtAmount,
                0,
                0,
                address(0),
                address(0)
            );
        }
    }

    function _processProfitTax(
        address user,
        uint256 taxAmount
    )
        private
        returns (
            address referrer,
            uint256 marketingShare,
            uint256 referrerShare
        )
    {
        if (taxAmount == 0) return (address(0), 0, 0);

        uint256 usdtAmount = _swapTokensForUSDT(taxAmount);
        if (usdtAmount == 0) return (address(0), 0, 0);

        referrer = _getUserReferrer(user);

        if (referrer != address(0)) {
            if (_isReferrerEligible(referrer)) {
                marketingShare = usdtAmount / 2;
                referrerShare = usdtAmount - marketingShare;
            } else {
                marketingShare = usdtAmount;
                referrerShare = 0;
                referrer = address(0);
            }
        } else {
            marketingShare = usdtAmount;
            referrerShare = 0;
        }

        if (marketingShare > 0) {
            IERC20(USDT).transfer(marketingAddress, marketingShare);
        }

        if (referrerShare > 0) {
            IERC20(USDT).transfer(referrer, referrerShare);
        }

        return (referrer, marketingShare, referrerShare);
    }

    function triggerFeeProcessing() external {
        require(
            msg.sender == owner() ||
                msg.sender == address(staking),
            "Unauthorized"
        );

        _tryProcessAccumulatedFees();
    }
}
