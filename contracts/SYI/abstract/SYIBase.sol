// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUniswapV2Router02} from "../interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Pair} from "../interfaces/IUniswapV2Pair.sol";
import {IUniswapV2Factory} from "../interfaces/IUniswapV2Factory.sol";
import {IStaking} from "../interfaces/IStaking.sol";
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
    // All trading fees removed - set to 0%
    uint256 private constant BUY_BURN_FEE = 0; // 0% (was 1%)
    uint256 private constant BUY_LIQUIDITY_FEE = 0; // 0% (was 2%)
    uint256 private constant SELL_MARKETING_FEE = 0; // 0% (was 1.5%)
    uint256 private constant SELL_LIQUIDITY_ACCUM_FEE = 0; // 0% (was 1.5%)
    uint256 private constant PROFIT_TAX_RATE = 0; // 0% (was 25%)
    uint256 private constant NO_PROFIT_FEE = 0; // 0% (was 25%)
    uint256 private constant LP_HANDLE_FEE = 250; // 2.5% (kept for liquidity operations)

    address public immutable USDT;
    IUniswapV2Router02 public immutable uniswapV2Router;
    IStaking public immutable staking;

    // =========================================================================
    // STATE VARIABLES
    // =========================================================================

    IUniswapV2Pair public uniswapV2Pair;
    address public rootAddress;
    uint256 public coldTime = 10 seconds;

    uint256 public presaleStartTime;
    uint256 public presaleDuration;
    bool public presaleActive;

    bool public delayedBuyEnabled;
    uint256 public contractDeployTime;
    uint256 public delayedBuyEnabledTime;

    mapping(address => uint256) public lastBuyTime;
    mapping(address => bool) public feeWhitelisted; 
    mapping(address => bool) public blacklisted;

    bool private _whitelistInitialized;

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    modifier notBlacklisted(address account) {
        if (blacklisted[account]) revert Blacklisted();
        _;
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
        address _staking
    ) ERC20("SYI Token", "SYI") Ownable(msg.sender) {
        if (
            _usdt == address(0) ||
            _router == address(0) ||
            _staking == address(0)
        ) revert ZeroAddress();

        USDT = _usdt;
        uniswapV2Router = IUniswapV2Router02(_router);
        staking = IStaking(_staking);

        _mint(owner(), 100_000_000 ether);

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

    function setColdTime(uint256 _coldTime) external onlyOwner {
        coldTime = _coldTime;
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
     * @notice Recycles SYI tokens from liquidity pool to Staking contract for reward distribution
     * @dev This is a critical economic cycle mechanism:
     *      1. Tokens from user transactions accumulate in the liquidity pool
     *      2. Staking contract needs tokens to pay out staking rewards
     *      3. Recycle retrieves tokens from pool to complete the cycle
     *
     * @param amount Amount of tokens requested by Staking contract for recycle
     *
     * Workflow:
     * ┌─────────────┐  Trading Fees  ┌──────────────┐
     * │ Liquidity   │ ────────────→  │  Pool        │
     * │ Pool (Pair) │                │  Accumulates │
     * └─────────────┘                │  SYI Tokens  │
     *       ↑                         └──────────────┘
     *       │                                ↓
     *       │                           recycle()
     *       │                                ↓
     *       │                         ┌──────────────┐
     *       │                         │   Staking    │
     *       │                         │   Contract   │
     *       │                         └──────────────┘
     *       │                                ↓
     *       │                        Distribute Rewards
     *       │                                ↓
     *       └────────── Users Sell ──────────┘
     */
    function recycle(uint256 amount) external {
        // ========================================
        // 1. Permission Check: Only Staking contract can call
        // ========================================
        // Prevents arbitrary addresses from extracting tokens from pool, avoiding price manipulation
        require(msg.sender == address(staking), "Only staking contract");

        // ========================================
        // 2. Get SYI token balance in liquidity pool
        // ========================================
        // balanceOf(address(uniswapV2Pair)) meaning:
        // - balanceOf() is a function of the SYI token contract
        // - Query: How many SYI tokens does the uniswapV2Pair address hold
        // - Like checking your wallet balance, but here we're checking the "Pair contract's wallet" balance
        //
        // Important distinction: balance (actual balance) vs reserve (book reserve)
        // ┌────────────────────────────────────────────────────────────────────┐
        // │ balance (actual balance):                                          │
        // │   - Recorded in SYI token contract: "How many SYI does Pair own"   │
        // │   - This is the real, immediate token amount                       │
        // │   - Updated instantly with every transfer                          │
        // │                                                                    │
        // │ reserve (book reserve):                                            │
        // │   - Recorded in Pair contract itself: "I think I have this much"   │
        // │   - Only updated during mint/burn/swap/sync                        │
        // │   - Used for AMM price calculation (x * y = k)                     │
        // └────────────────────────────────────────────────────────────────────┘
        //
        // Why can they be inconsistent? Example:
        // 1. Initial state:
        //    balance = 10M, reserve = 10M ✅ Consistent
        //
        // 2. Someone directly transfers 1M SYI to Pair (not through Router):
        //    balance = 11M ← SYI contract updates immediately
        //    reserve = 10M ← Pair contract doesn't know about the transfer
        //    Difference 1M = Can be skim()med as "unexpected donation"
        //
        // 3. Or: Trading fees accumulate in Pair (if SYI has fees):
        //    balance = 10.5M ← Fees accumulate in Pair address
        //    reserve = 10M ← Pair only knows the net trade amount
        //    Difference 0.5M = "Excess tokens" that can be recycled
        //
        // So here we get the "real balance", not "what Pair thinks it has"
        uint256 pairBalance = balanceOf(address(uniswapV2Pair));

        // ========================================
        // 3. Calculate maximum recyclable amount (safety cap: 1/3)
        // ========================================
        // Why 1/3? Protects liquidity from excessive extraction
        // Example: Pool has 3M SYI, max recycle at once is 1M
        // This ensures:
        // - Pool retains enough liquidity for user trading
        // - Avoids drastic price volatility from single recycle
        // - Prevents malicious liquidity exhaustion attacks
        uint256 maxRecyclable = pairBalance / 3;

        // ========================================
        // 4. Determine actual recycle amount (take minimum)
        // ========================================
        // If Staking requests 1.5M, but max recyclable is 1M
        // Then actually recycle 1M (capped by safety limit)
        uint256 recycleAmount = amount >= maxRecyclable
            ? maxRecyclable  // Request too high, use safety cap
            : amount;        // Request reasonable, use requested amount

        // ========================================
        // 5. Execute recycle operation
        // ========================================
        if (recycleAmount > 0) {
            // 5.1 Update balance directly: Transfer from Pair to Staking
            // Note: Using _update instead of transfer
            // Because this is a special internal operation that shouldn't trigger trading fees etc.
            _update(address(uniswapV2Pair), address(staking), recycleAmount);

            // 5.2 Synchronize Pair contract reserves
            // Critical step! Why sync() must be called:
            // ┌────────────────────────────────────────────────────┐
            // │ Uniswap V2 Reserve Mechanism:                      │
            // │ - reserve: Pair contract's "book" reserve amount   │
            // │ - balance: Pair contract's actual token balance    │
            // │                                                    │
            // │ We directly modified balance (via _update)         │
            // │ But reserve is still old, causing:                 │
            // │   ❌ Incorrect price calculation                   │
            // │   ❌ Abnormal trading slippage                     │
            // │   ❌ K value validation failure                    │
            // │                                                    │
            // │ sync() action:                                     │
            // │   reserve0 = balance0  ✅                          │
            // │   reserve1 = balance1  ✅                          │
            // │   Force sync book and actual balance               │
            // └────────────────────────────────────────────────────┘
            uniswapV2Pair.sync();

            // Done! Now:
            // ✅ Staking contract received tokens, can distribute rewards
            // ✅ Pair contract reserves synced, price normalized
            // ✅ Liquidity pool retains 2/3 of tokens, trading continues normally
        }
        // If recycleAmount == 0 (e.g., pool balance is 0), do nothing
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

    function getUniswapV2Pair() external view returns (address) {
        return address(uniswapV2Pair);
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
        }
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
        // Check presale period
        if (
            presaleActive &&
            block.timestamp < presaleStartTime + presaleDuration
        ) {
            revert NotAllowedBuy();
        }

        // No fees - direct transfer full amount
        super._update(from, to, amount);

        // Update last buy time for cooldown mechanism
        lastBuyTime[to] = block.timestamp;

        // Emit events for tracking (all fees are 0)
        emit TransactionExecuted(
            to,
            block.timestamp,
            "BUY",
            amount,
            0,  // usdtAmount (not tracked)
            amount,  // netUserReceived (full amount)
            0,  // previousInvestment (not tracked)
            0,  // newInvestment (not tracked)
            0,  // burnFee
            0,  // lpFee
            0,  // marketingFee
            0,  // profitAmount
            0,  // profitTax
            address(0)  // referrer
        );

        emit UserTransaction(
            to,
            block.timestamp,
            "BUY",
            amount,
            0,  // usdtAmount
            amount  // netReceived
        );
    }

    function _handleSell(
        address from,
        address to,
        uint256 amount
    ) private notBlacklisted(from) {
        // Check cooldown time
        if (block.timestamp < lastBuyTime[from] + coldTime)
            revert InColdPeriod();

        // No fees - direct transfer full amount
        super._update(from, to, amount);

        // Emit events for tracking (all fees are 0)
        emit SellTransaction(
            from,
            block.timestamp,
            amount,  // originalXFAmount
            0,  // tradingFeeXF
            0,  // marketingFeeXF
            0,  // lpFeeXF
            amount,  // netXFAfterTradingFees (full amount)
            0,  // estimatedUSDTFromSale (not calculated)
            0,  // userHistoricalInvestment (not tracked)
            0,  // totalProfitAmount
            0,  // profitTaxUSDT
            0,  // noProfitFeeUSDT
            0,  // profitTaxToMarketing
            0,  // profitTaxToReferrer
            0,  // userNetProfitUSDT
            0,  // finalUSDTReceived
            address(0)  // referrer
        );

        emit TransactionExecuted(
            from,
            block.timestamp,
            "SELL",
            amount,
            0,  // usdtAmount
            amount,  // netUserReceived (full amount)
            0,  // previousInvestment
            0,  // newInvestment
            0,  // burnFee
            0,  // lpFee
            0,  // marketingFee
            0,  // profitAmount
            0,  // profitTax
            address(0)  // referrer
        );
    }

    function _updatePresaleDurationFromStaking() private {
        presaleDuration = getPresaleDuration();
        emit PresaleDurationUpdated(presaleDuration);
    }
}
