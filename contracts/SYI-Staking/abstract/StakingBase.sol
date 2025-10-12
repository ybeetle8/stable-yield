// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";
import {IUniswapV2Pair} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import {ISYI} from "../interfaces/ISYI.sol";
import {IStaking} from "../interfaces/IStaking.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUniswapV2Router02} from "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

/**
 * @title StakingBase - Complete implementation for Staking contracts
 * @notice Base contract containing all shared logic for mainnet and testnet staking
 * @dev Environment-specific constants are defined as abstract functions
 */
abstract contract StakingBase is Ownable, IStaking {
    // =========================================================================
    // ABSTRACT FUNCTIONS - Environment specific constants
    // =========================================================================

    // APY Rates
    function getAPYRate1D() internal pure virtual returns (uint256);
    function getAPYRate7D() internal pure virtual returns (uint256);
    function getAPYRate15D() internal pure virtual returns (uint256);
    function getAPYRate30D() internal pure virtual returns (uint256);

    // Staking Periods
    function getStakePeriod1D() internal pure virtual returns (uint256);
    function getStakePeriod7D() internal pure virtual returns (uint256);
    function getStakePeriod15D() internal pure virtual returns (uint256);
    function getStakePeriod30D() internal pure virtual returns (uint256);

    // Compound Interest Time Unit
    function getCompoundTimeUnit() internal pure virtual returns (uint256);

    // Team Thresholds
    function getTeamThresholdTier1() internal pure virtual returns (uint256);
    function getTeamThresholdTier2() internal pure virtual returns (uint256);
    function getTeamThresholdTier3() internal pure virtual returns (uint256);
    function getTeamThresholdTier4() internal pure virtual returns (uint256);
    function getTeamThresholdTier5() internal pure virtual returns (uint256);
    function getTeamThresholdTier6() internal pure virtual returns (uint256);
    function getTeamThresholdTier7() internal pure virtual returns (uint256);

    // EOA check configuration
    function shouldCheckEOA() internal pure virtual returns (bool);

    // =========================================================================
    // CONSTANTS - PROTOCOL CONFIGURATION
    // =========================================================================

    uint256 internal constant BASIS_POINTS_DENOMINATOR = 10000;
    uint256 internal constant PERCENTAGE_BASE = 100;
    uint256 internal constant PREACHER_THRESHOLD = 200 ether;
    uint256 internal constant REFERRAL_REWARD_RATE = 5;
    uint256 internal constant LIQUIDITY_SPLIT_DIVISOR = 2;
    uint256 internal constant POOL_PERCENTAGE_DIVISOR = 100;
    uint256 internal constant NETWORK_CHECK_INTERVAL = 1 minutes;
    uint256 internal constant MAX_STAKE_LIMIT = 1000 ether;
    uint256 internal constant MAX_USER_TOTAL_STAKE = 10000 ether;
    uint8 internal constant MAX_REFERRAL_DEPTH = 30;
    uint8 internal constant MAX_STAKE_INDEX = 3;
    uint256 internal constant MAX_TEAM_REWARD_RATE = 35;

    // Team Reward Rates
    uint256 internal constant TEAM_REWARD_TIER_1 = 5;
    uint256 internal constant TEAM_REWARD_TIER_2 = 10;
    uint256 internal constant TEAM_REWARD_TIER_3 = 15;
    uint256 internal constant TEAM_REWARD_TIER_4 = 20;
    uint256 internal constant TEAM_REWARD_TIER_5 = 25;
    uint256 internal constant TEAM_REWARD_TIER_6 = 30;
    uint256 internal constant TEAM_REWARD_TIER_7 = 35;

    // Slippage Protection
    uint256 internal constant BASE_SLIPPAGE_TOLERANCE = 1500;
    uint256 internal constant MAX_SLIPPAGE_TOLERANCE = 2000;
    uint256 internal constant PRICE_IMPACT_THRESHOLD = 200;
    uint256 internal constant SYI_BUY_BURN_FEE_BPS = 50;
    uint256 internal constant SYI_BUY_LIQUIDITY_FEE_BPS = 250;
    uint256 internal constant SYI_TOTAL_BUY_FEE_BPS =
        SYI_BUY_BURN_FEE_BPS + SYI_BUY_LIQUIDITY_FEE_BPS;

    uint256 internal constant REWARD_WITHHOLD_RATE = 40;

    // =========================================================================
    // IMMUTABLE VARIABLES
    // =========================================================================

    address internal immutable USDT;
    IUniswapV2Router02 public immutable ROUTER;
    uint8 immutable maxD = MAX_REFERRAL_DEPTH;

    // =========================================================================
    // STATE VARIABLES
    // =========================================================================

    ISYI public SYI;
    address private rootAddress;

    // Manual token implementation
    uint8 public constant decimals = 18;
    string public constant name = "Staked SYI";
    string public constant symbol = "sSYI";
    uint256 public totalSupply;
    mapping(address => uint256) public balances;

    // Staking configuration
    uint256[4] public rates;

    // Network activity tracking
    IStaking.RecordTT[] public t_supply;

    // Staking records
    mapping(address => IStaking.Record[]) public userStakeRecord;
    mapping(address => uint256) public userIndex;

    // Team investment tracking
    mapping(address => uint256) public teamTotalInvestValue;

    // Referral system
    mapping(address => address) private _referrals;
    mapping(address => address[]) private _children;
    mapping(address => bool) private _hasLocked;

    // Friend reward system
    mapping(address => address) private _friends;

    // Withdrawal history tracking
    mapping(address => IStaking.WithdrawalRecord[])
        private _userWithdrawalHistory;

    // Fee collection
    address public feeRecipient;
    uint256 public constant REDEMPTION_FEE_RATE = 100; // 1% = 100 basis points

    // Events - Only define events not in IStaking interface
    event MarketingAddressUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );

    event RedemptionFeeCollected(
        address indexed user,
        uint256 stakeIndex,
        uint256 syiAmount,
        uint256 usdtAmount,
        address indexed feeRecipient,
        uint256 timestamp
    );

    event FeeRecipientUpdated(
        address indexed oldRecipient,
        address indexed newRecipient
    );

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    modifier onlyEOA() {
        if (shouldCheckEOA() && tx.origin != msg.sender)
            revert OnlyEOAAllowed();
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(
        address _usdt,
        address _router,
        address _rootAddress,
        address _feeRecipient
    ) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT address");
        require(_router != address(0), "Invalid router address");

        USDT = _usdt;
        ROUTER = IUniswapV2Router02(_router);
        rootAddress = _rootAddress;
        feeRecipient = _feeRecipient; // Initialize fee recipient to root address

        IERC20(_usdt).approve(_router, type(uint256).max);
        _updateRatesForMode();
    }

    // =========================================================================
    // EXTERNAL FUNCTIONS - Core Staking Operations
    // =========================================================================

    function stake(uint160 _amount, uint8 _stakeIndex) external onlyEOA {
        _validateStakeParameters(_amount, _stakeIndex);
        _swapAndAddLiquidity(_amount);
        address user = msg.sender;
        _mintStakeRecord(user, _amount, _stakeIndex);
    }

    function unstake(
        uint256 stakeIndex
    ) external onlyEOA returns (uint256 totalReward) {
        (uint256 calculatedReward, uint256 principalAmount) = _burn(stakeIndex);
        (uint256 usdtReceived, uint256 syiTokensUsed) = _swapSYIForReward(
            calculatedReward
        );

        uint256 interestEarned = usdtReceived > principalAmount
            ? usdtReceived - principalAmount
            : 0;

        address[] memory referralChain = getReferrals(msg.sender, maxD);
        uint256 friendReward = _distributeFriendReward(
            msg.sender,
            interestEarned
        );
        uint256 teamFee = _distributeTeamReward(referralChain, interestEarned);

        _updateTeamInvestmentValues(msg.sender, principalAmount, false);

        uint256 userPayout = usdtReceived - friendReward - teamFee;

        // Calculate and collect 1% redemption fee
        uint256 expectedRedemptionFeeUSDT = (userPayout * REDEMPTION_FEE_RATE) /
            BASIS_POINTS_DENOMINATOR;

        if (expectedRedemptionFeeUSDT > 0 && feeRecipient != address(0)) {
            // Convert 1% of SYI to USDT for fee collection
            (, uint256 redemptionFeeSYIUsed) = _swapSYIForReward(
                expectedRedemptionFeeUSDT
            );

            // Emit fee collection event
            emit RedemptionFeeCollected(
                msg.sender,
                stakeIndex,
                redemptionFeeSYIUsed,
                expectedRedemptionFeeUSDT,
                feeRecipient,
                block.timestamp
            );
        }

        unchecked {
            _recordWithdrawal(
                msg.sender,
                stakeIndex,
                principalAmount,
                calculatedReward,
                usdtReceived,
                syiTokensUsed,
                friendReward,
                teamFee,
                userPayout,
                interestEarned
            );

            IERC20(USDT).transfer(msg.sender, userPayout);
        }

        SYI.recycle(syiTokensUsed);

        return calculatedReward;
    }

    function lockReferral(address _referrer) external {
        address user = msg.sender;

        if (_referrals[user] != address(0)) revert AlreadyBound();
        if (user == rootAddress) revert CannotReferSelf();

        if (_referrer == address(0)) {
            _referrer = rootAddress;
        }

        if (_referrer == user) revert CannotReferSelf();

        if (_referrer != rootAddress && balanceOf(_referrer) <= 1 ether) {
            revert InvalidReferrer();
        }

        _referrals[user] = _referrer;
        _children[_referrer].push(user);
        _hasLocked[user] = true;

        uint256 userExistingInvestment = principalBalance(user);
        if (userExistingInvestment > 0) {
            _syncExistingInvestmentToReferralChain(
                user,
                userExistingInvestment
            );
        }

        emit BindReferral(user, _referrer);
    }

    function setRootAddress(address _rootAddress) external onlyOwner {
        rootAddress = _rootAddress;
    }

    function lockFriend(address _friend) external {
        address user = msg.sender;

        if (_friends[user] != address(0)) revert AlreadyBound();
        require(_friend != address(0), "Invalid friend address");
        require(_friend != user, "Cannot set self as friend");

        _friends[user] = _friend;

        emit BindFriend(user, _friend);
    }

    function sync() external {
        uint256 w_bal = IERC20(USDT).balanceOf(address(this));
        address pair = SYI.getUniswapV2Pair();
        IERC20(USDT).transfer(pair, w_bal);
        IUniswapV2Pair(pair).sync();
    }

    // =========================================================================
    // EXTERNAL VIEW FUNCTIONS
    // =========================================================================

    function getReferrals(
        address _user,
        uint256 _maxDepth
    ) external view returns (address[] memory) {
        if (_maxDepth > 255) _maxDepth = 255;
        return getReferrals(_user, uint8(_maxDepth));
    }

    function getRootAddress() external view returns (address) {
        return rootAddress;
    }

    function stakeCount(address user) external view returns (uint256 count) {
        count = userStakeRecord[user].length;
    }

    function getUserInfo(
        address user
    )
        external
        view
        returns (
            uint128 totalStaked,
            uint128 teamKPI,
            address referrer,
            bool hasLockedReferral,
            bool isPreacherStatus
        )
    {
        totalStaked = uint128(currentStakeValue(user));
        teamKPI = uint128(getTeamKpi(user));
        referrer = getReferral(user);
        hasLockedReferral = _hasLocked[user];
        isPreacherStatus = isPreacher(user);
    }

    function getReferralCount(address _user) external view returns (uint256) {
        return _children[_user].length;
    }

    function network1In() external view returns (uint256 value) {
        return getRecentNetworkInflow();
    }

    function getNetworkInflow() external view returns (uint256 value) {
        return getRecentNetworkInflow();
    }

    function getMaxStakeAmount() external view returns (uint256 maxAmount) {
        return maxStakeAmount();
    }

    function getRemainingStakeCapacity(
        address user
    ) external view returns (uint256 remaining) {
        uint256 currentTotal = principalBalance(user);
        if (currentTotal >= MAX_USER_TOTAL_STAKE) {
            return 0;
        }
        return MAX_USER_TOTAL_STAKE - currentTotal;
    }

    function getMaxUserTotalStake() external pure returns (uint256 limit) {
        return MAX_USER_TOTAL_STAKE;
    }

    function getStakePeriod(
        uint8 stakeIndex
    ) public pure returns (uint256 period) {
        require(stakeIndex <= MAX_STAKE_INDEX, "Invalid stake index");

        if (stakeIndex == 0) return getStakePeriod1D();
        if (stakeIndex == 1) return getStakePeriod7D();
        if (stakeIndex == 2) return getStakePeriod15D();
        if (stakeIndex == 3) return getStakePeriod30D();
    }

    function getStakePeriods()
        external
        pure
        returns (uint256[4] memory periods)
    {
        periods[0] = getStakePeriod(0);
        periods[1] = getStakePeriod(1);
        periods[2] = getStakePeriod(2);
        periods[3] = getStakePeriod(3);
    }

    function getTeamRewardThresholds()
        external
        pure
        returns (uint256[7] memory thresholds)
    {
        IStaking.TeamTier[7] memory tiers = _getTeamTiers();
        for (uint256 i = 0; i < 7; i++) {
            thresholds[i] = tiers[i].threshold;
        }
    }

    function getTeamRewardRates()
        external
        pure
        returns (uint256[7] memory rewardRates)
    {
        rewardRates[0] = TEAM_REWARD_TIER_1;
        rewardRates[1] = TEAM_REWARD_TIER_2;
        rewardRates[2] = TEAM_REWARD_TIER_3;
        rewardRates[3] = TEAM_REWARD_TIER_4;
        rewardRates[4] = TEAM_REWARD_TIER_5;
        rewardRates[5] = TEAM_REWARD_TIER_6;
        rewardRates[6] = TEAM_REWARD_TIER_7;
    }

    function getSlippageConfig()
        external
        pure
        returns (
            uint256 baseSlippage,
            uint256 maxSlippage,
            uint256 priceImpactThreshold
        )
    {
        return (
            BASE_SLIPPAGE_TOLERANCE,
            MAX_SLIPPAGE_TOLERANCE,
            PRICE_IMPACT_THRESHOLD
        );
    }

    function previewStakeOutput(
        uint256 usdtAmount
    )
        external
        view
        returns (uint256 halfUsdtAmount, uint256 expectedSYI, uint256 minSYIOut)
    {
        halfUsdtAmount = usdtAmount / LIQUIDITY_SPLIT_DIVISOR;

        address pair = SYI.getUniswapV2Pair();
        (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair)
            .getReserves();

        uint112 reserveUSDT;
        uint112 reserveSYI;

        address token0 = IUniswapV2Pair(pair).token0();
        if (token0 == address(USDT)) {
            reserveUSDT = reserve0;
            reserveSYI = reserve1;
        } else {
            reserveUSDT = reserve1;
            reserveSYI = reserve0;
        }

        expectedSYI = ROUTER.getAmountOut(
            halfUsdtAmount,
            reserveUSDT,
            reserveSYI
        );
        minSYIOut = _calculateMinimumOutput(halfUsdtAmount);
    }

    function getWithdrawalHistory(
        address user
    ) external view returns (IStaking.WithdrawalRecord[] memory) {
        return _userWithdrawalHistory[user];
    }

    function getWithdrawalCount(address user) external view returns (uint256) {
        return _userWithdrawalHistory[user].length;
    }

    function getWithdrawalRecord(
        address user,
        uint256 index
    ) external view returns (IStaking.WithdrawalRecord memory) {
        require(index < _userWithdrawalHistory[user].length, "Invalid index");
        return _userWithdrawalHistory[user][index];
    }

    function getUserStakeWithdrawalStatus(
        address user
    )
        external
        view
        returns (
            uint256[] memory stakeIndices,
            bool[] memory canWithdrawArray,
            uint256[] memory timeRemaining
        )
    {
        uint256 stakeCountValue = userStakeRecord[user].length;

        stakeIndices = new uint256[](stakeCountValue);
        canWithdrawArray = new bool[](stakeCountValue);
        timeRemaining = new uint256[](stakeCountValue);

        for (uint256 i = 0; i < stakeCountValue; i++) {
            stakeIndices[i] = i;
            canWithdrawArray[i] = canWithdrawStake(user, i);

            IStaking.Record storage stakeRecord = userStakeRecord[user][i];
            if (!stakeRecord.status) {
                uint256 elapsed = block.timestamp - stakeRecord.stakeTime;
                uint256 required = getStakePeriod(stakeRecord.stakeIndex);
                timeRemaining[i] = elapsed >= required ? 0 : required - elapsed;
            } else {
                timeRemaining[i] = 0;
            }
        }
    }

    // =========================================================================
    // PUBLIC VIEW FUNCTIONS
    // =========================================================================

    function balanceOf(
        address account
    ) public view override(IStaking) returns (uint256 balance) {
        return currentStakeValue(account);
    }

    function principalBalance(
        address account
    ) public view returns (uint256 balance) {
        return balances[account];
    }

    function currentStakeValue(
        address account
    ) public view returns (uint256 currentValue) {
        IStaking.Record[] storage userStakes = userStakeRecord[account];
        if (userStakes.length > 0) {
            for (uint256 i = userStakes.length - 1; i >= 0; ) {
                IStaking.Record storage stakeRecord = userStakes[i];
                if (!stakeRecord.status) {
                    unchecked {
                        currentValue += _calculateStakeReward(stakeRecord);
                    }
                }
                if (i == 0) break;
                unchecked {
                    --i;
                }
            }
        }
    }

    function earnedInterest(
        address account
    ) public view returns (uint256 interest) {
        uint256 principal = principalBalance(account);
        uint256 currentValue = balanceOf(account);

        if (currentValue > principal) {
            unchecked {
                interest = currentValue - principal;
            }
        }
    }

    function getReferrals(
        address _user,
        uint8 _maxDepth
    ) public view returns (address[] memory) {
        address[] memory result = new address[](_maxDepth);
        address current = _user;
        uint8 count = 0;

        for (uint8 i = 0; i < _maxDepth && current != address(0); i++) {
            current = _referrals[current];
            if (current != address(0)) {
                result[count] = current;
                count++;
            }
        }

        address[] memory trimmed = new address[](count);
        for (uint8 i = 0; i < count; i++) {
            trimmed[i] = result[i];
        }

        return trimmed;
    }

    function rewardOfSlot(
        address user,
        uint8 index
    ) public view returns (uint256 reward) {
        IStaking.Record storage stakeRecord = userStakeRecord[user][index];
        return _calculateStakeReward(stakeRecord);
    }

    function canWithdrawStake(
        address user,
        uint256 stakeIndex
    ) public view returns (bool canWithdraw) {
        if (userStakeRecord[user].length == 0) {
            return false;
        }

        if (stakeIndex >= userStakeRecord[user].length) {
            return false;
        }

        IStaking.Record storage stakeRecord = userStakeRecord[user][stakeIndex];

        if (stakeRecord.status) {
            return false;
        }

        uint256 stakeTime = stakeRecord.stakeTime;
        uint256 requiredPeriod = getStakePeriod(stakeRecord.stakeIndex);

        return (block.timestamp - stakeTime) >= requiredPeriod;
    }

    function isPreacher(address user) public view override returns (bool) {
        return currentStakeValue(user) >= PREACHER_THRESHOLD;
    }

    function getTeamKpi(address _user) public view returns (uint256) {
        return teamTotalInvestValue[_user];
    }

    function getTeamPerformanceDetails(
        address _user
    )
        external
        view
        returns (
            uint256 totalTeamInvestment,
            uint256 teamMemberCount,
            uint8 currentTier,
            uint256 nextTierThreshold,
            uint256 progressToNextTier
        )
    {
        totalTeamInvestment = teamTotalInvestValue[_user];
        teamMemberCount = _children[_user].length;
        currentTier = _getUserTier(_user);

        if (currentTier < 7) {
            IStaking.TeamTier[7] memory tiers = _getTeamTiers();
            nextTierThreshold = tiers[6 - currentTier].threshold;
            progressToNextTier =
                (totalTeamInvestment * 100) /
                nextTierThreshold;
        } else {
            nextTierThreshold = 0;
            progressToNextTier = 100;
        }
    }

    function getReferral(address _user) public view returns (address) {
        return _referrals[_user];
    }

    function getFriend(address user) public view returns (address) {
        return _friends[user];
    }

    function isBindReferral(address _user) public view returns (bool) {
        return _referrals[_user] != address(0);
    }

    function getRecentNetworkInflow()
        public
        view
        returns (uint256 recentInflow)
    {
        uint256 recordCount = t_supply.length;
        if (recordCount == 0) return 0;

        uint256 cutoffTime = block.timestamp - NETWORK_CHECK_INTERVAL;
        uint256 previousTotalSupply = totalSupply;

        for (uint256 i = recordCount - 1; i >= 0; ) {
            IStaking.RecordTT storage supplyRecord = t_supply[i];
            if (cutoffTime > supplyRecord.stakeTime) {
                break;
            } else {
                previousTotalSupply = supplyRecord.tamount;
            }
            if (i == 0) break;
            unchecked {
                --i;
            }
        }

        return totalSupply - previousTotalSupply;
    }

    function maxStakeAmount() public view returns (uint256 maxAmount) {
        uint256 recentInflow = getRecentNetworkInflow();
        uint112 poolReserveUsdt = SYI.getUSDTReserve();
        uint256 onePercentOfPool = poolReserveUsdt / POOL_PERCENTAGE_DIVISOR;

        if (recentInflow > onePercentOfPool) {
            return 0;
        } else {
            uint256 availableCapacity = onePercentOfPool - recentInflow;
            return _min256(availableCapacity, MAX_STAKE_LIMIT);
        }
    }

    // =========================================================================
    // TOKEN FUNCTIONS (Manual Implementation)
    // =========================================================================

    function transfer(address, uint256) public pure returns (bool) {
        revert("Transfers not supported");
    }

    function approve(address, uint256) public pure returns (bool) {
        revert("Approvals not supported");
    }

    function allowance(address, address) public pure returns (uint256) {
        return 0;
    }

    function transferFrom(
        address,
        address,
        uint256
    ) public pure returns (bool) {
        revert("Transfers not supported");
    }

    // =========================================================================
    // INTERNAL FUNCTIONS
    // =========================================================================

    function _update(address from, address to, uint256 value) internal {
        if (from == address(0)) {
            balances[to] += value;
            totalSupply += value;
            emit Transfer(address(0), to, value);
            return;
        }

        if (to == address(0)) {
            balances[from] -= value;
            totalSupply -= value;
            emit Transfer(from, address(0), value);
            return;
        }

        revert("Transfers between users not supported");
    }

    function _updateTeamInvestmentValues(
        address user,
        uint256 amount,
        bool isIncrease
    ) internal {
        address[] memory referralChain = getReferrals(user, maxD);
        for (uint8 i = 0; i < referralChain.length; ) {
            unchecked {
                if (isIncrease) {
                    teamTotalInvestValue[referralChain[i]] += amount;
                } else {
                    teamTotalInvestValue[referralChain[i]] -= amount;
                }
                ++i;
            }
        }
    }

    function _syncExistingInvestmentToReferralChain(
        address user,
        uint256 existingInvestment
    ) internal {
        address[] memory referralChain = getReferrals(user, maxD);
        for (uint8 i = 0; i < referralChain.length; ) {
            unchecked {
                teamTotalInvestValue[referralChain[i]] += existingInvestment;
                ++i;
            }
        }
    }

    function _updateRatesForMode() internal {
        rates[0] = getAPYRate1D();
        rates[1] = getAPYRate7D();
        rates[2] = getAPYRate15D();
        rates[3] = getAPYRate30D();
        emit StakingRatesUpdated(rates);
    }

    function _getTeamTiers()
        internal
        pure
        returns (IStaking.TeamTier[7] memory)
    {
        return [
            IStaking.TeamTier(getTeamThresholdTier7(), TEAM_REWARD_TIER_7),
            IStaking.TeamTier(getTeamThresholdTier6(), TEAM_REWARD_TIER_6),
            IStaking.TeamTier(getTeamThresholdTier5(), TEAM_REWARD_TIER_5),
            IStaking.TeamTier(getTeamThresholdTier4(), TEAM_REWARD_TIER_4),
            IStaking.TeamTier(getTeamThresholdTier3(), TEAM_REWARD_TIER_3),
            IStaking.TeamTier(getTeamThresholdTier2(), TEAM_REWARD_TIER_2),
            IStaking.TeamTier(getTeamThresholdTier1(), TEAM_REWARD_TIER_1)
        ];
    }

    // =========================================================================
    // PRIVATE FUNCTIONS
    // =========================================================================

    function _mintStakeRecord(
        address sender,
        uint160 _amount,
        uint8 _stakeIndex
    ) private {
        if (!isBindReferral(sender)) revert MustBindReferral();

        IStaking.RecordTT memory tsy;
        tsy.stakeTime = uint40(block.timestamp);
        tsy.tamount = uint160(totalSupply);
        t_supply.push(tsy);

        IStaking.Record memory order;
        order.stakeTime = uint40(block.timestamp);
        order.amount = _amount;
        order.status = false;
        order.stakeIndex = _stakeIndex;

        IStaking.Record[] storage cord = userStakeRecord[sender];
        uint256 stake_index = cord.length;
        cord.push(order);

        _updateTeamInvestmentValues(sender, _amount, true);
        _update(address(0), sender, _amount);

        emit Staked(
            sender,
            _amount,
            block.timestamp,
            stake_index,
            getStakePeriod(_stakeIndex)
        );
    }

    function _burn(
        uint256 index
    ) private returns (uint256 reward, uint256 amount) {
        address sender = msg.sender;
        IStaking.Record[] storage cord = userStakeRecord[sender];
        IStaking.Record storage user_record = cord[index];

        uint256 stakeTime = user_record.stakeTime;

        if (
            block.timestamp - stakeTime < getStakePeriod(user_record.stakeIndex)
        ) revert StakingPeriodNotMet();
        if (user_record.status) revert AlreadyWithdrawn();

        amount = user_record.amount;
        reward = _calculateStakeReward(user_record);
        user_record.status = true;

        _update(sender, address(0), amount);

        unchecked {
            userIndex[sender] = userIndex[sender] + 1;
        }
    }

    function _swapSYIForReward(
        uint256 calculatedReward
    ) private returns (uint256 usdtReceived, uint256 syiTokensUsed) {
        uint256 syiBalanceBefore = SYI.balanceOf(address(this));
        uint256 usdtBalanceBefore = IERC20(USDT).balanceOf(address(this));

        address[] memory swapPath = new address[](2);
        swapPath[0] = address(SYI);
        swapPath[1] = address(USDT);

        uint256 maxSYIInput = _calculateMaxSYIInput(
            calculatedReward,
            syiBalanceBefore
        );

        ROUTER.swapTokensForExactTokens(
            calculatedReward,
            maxSYIInput,
            swapPath,
            address(this),
            block.timestamp
        );

        uint256 syiBalanceAfter = SYI.balanceOf(address(this));
        usdtReceived =
            IERC20(USDT).balanceOf(address(this)) -
            usdtBalanceBefore;
        syiTokensUsed = syiBalanceBefore - syiBalanceAfter;
    }

    function _calculateMaxSYIInput(
        uint256 usdtNeeded,
        uint256 availableSYI
    ) private view returns (uint256 maxInput) {
        address pair = SYI.getUniswapV2Pair();
        try IUniswapV2Pair(pair).getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32
        ) {
            (uint112 syiReserve, uint112 usdtReserve) = IUniswapV2Pair(pair)
                .token0() == address(SYI)
                ? (reserve0, reserve1)
                : (reserve1, reserve0);

            if (syiReserve > 0 && usdtReserve > 0) {
                uint256 maxSafeUsdtRequest = usdtReserve / 2;
                uint256 safeUsdtNeeded = usdtNeeded > maxSafeUsdtRequest
                    ? maxSafeUsdtRequest
                    : usdtNeeded;

                if (safeUsdtNeeded < usdtReserve) {
                    uint256 estimatedSYI = (safeUsdtNeeded * syiReserve) /
                        (usdtReserve - safeUsdtNeeded);
                    uint256 withSlippage = (estimatedSYI * 150) / 100;

                    maxInput = _min256(withSlippage, availableSYI);
                } else {
                    maxInput = availableSYI / 4;
                }
            } else {
                maxInput = availableSYI / 2;
            }
        } catch {
            maxInput = availableSYI / 2;
        }

        if (maxInput == 0 && availableSYI > 0) {
            maxInput = availableSYI / 10;
        }

        uint256 maxAllowedInput = availableSYI / 2;
        if (maxInput > maxAllowedInput) {
            maxInput = maxAllowedInput;
        }
    }

    function _distributeFriendReward(
        address _user,
        uint256 _interset
    ) private returns (uint256 fee) {
        unchecked {
            fee = (_interset * REFERRAL_REWARD_RATE) / PERCENTAGE_BASE;
        }
        address friend = getFriend(_user);
        if (friend != address(0)) {
            IERC20(USDT).transfer(friend, fee);
        } else {
            IERC20(USDT).transfer(rootAddress, fee);
        }
    }

    function _distributeTeamReward(
        address[] memory referralChain,
        uint256 _interset
    ) private returns (uint256 fee) {
        unchecked {
            fee = (_interset * MAX_TEAM_REWARD_RATE) / PERCENTAGE_BASE;
        }

        if (referralChain.length == 0) {
            IERC20(USDT).transfer(rootAddress, fee);

            address[7] memory emptyRecipients;
            uint256[7] memory emptyAmounts;
            for (uint8 j = 0; j < 7; j++) {
                emptyRecipients[j] = address(0);
                emptyAmounts[j] = 0;
            }

            emit TeamRewardDistributionCompleted(
                _interset,
                fee,
                0,
                fee,
                emptyRecipients,
                emptyAmounts,
                0
            );

            return fee;
        }

        uint8[] memory memberTiers = new uint8[](referralChain.length);

        for (uint256 i = 0; i < referralChain.length; ) {
            memberTiers[i] = _getUserTier(referralChain[i]);
            unchecked {
                ++i;
            }
        }

        (
            uint256 totalDistributed,
            address[7] memory tierRecipients,
            uint256[7] memory tierAmounts,
            uint8 activeTiers
        ) = _distributeHybridRewards(referralChain, memberTiers, _interset);

        uint256 marketingAmount = 0;
        if (totalDistributed < fee) {
            marketingAmount = fee - totalDistributed;
            IERC20(USDT).transfer(rootAddress, marketingAmount);
        }

        emit TeamRewardDistributionCompleted(
            _interset,
            fee,
            totalDistributed,
            marketingAmount,
            tierRecipients,
            tierAmounts,
            activeTiers
        );

        return fee;
    }

    function _distributeHybridRewards(
        address[] memory referralChain,
        uint8[] memory memberTiers,
        uint256 _interset
    )
        private
        returns (
            uint256 totalDistributed,
            address[7] memory tierRecipients,
            uint256[7] memory tierAmounts,
            uint8 activeTiers
        )
    {
        totalDistributed = 0;
        activeTiers = 0;

        for (uint8 j = 0; j < 7; j++) {
            tierRecipients[j] = address(0);
            tierAmounts[j] = 0;
        }

        bool[8] memory tierAllocated;
        uint256 cumulativeAllocatedRate = 0;

        for (uint256 i = 0; i < referralChain.length; ) {
            uint8 currentTier = memberTiers[i];

            if (
                currentTier > 0 &&
                !tierAllocated[currentTier] &&
                isPreacher(referralChain[i])
            ) {
                uint256 tierRewardRate = _getTierRewardRate(currentTier);
                uint256 actualRewardRate;

                if (tierRewardRate > cumulativeAllocatedRate) {
                    actualRewardRate = tierRewardRate - cumulativeAllocatedRate;
                } else {
                    actualRewardRate = 0;
                }

                if (actualRewardRate > 0) {
                    uint256 memberReward = (_interset * actualRewardRate) /
                        PERCENTAGE_BASE;

                    if (memberReward > 0) {
                        IERC20(USDT).transfer(referralChain[i], memberReward);
                        totalDistributed += memberReward;

                        tierRecipients[currentTier - 1] = referralChain[i];
                        tierAmounts[currentTier - 1] = memberReward;

                        activeTiers =
                            activeTiers |
                            uint8(1 << (currentTier - 1));

                        emit StrictDifferentialRewardPaid(
                            referralChain[i],
                            currentTier,
                            actualRewardRate,
                            memberReward,
                            cumulativeAllocatedRate,
                            tierRewardRate
                        );
                    }
                }

                tierAllocated[currentTier] = true;
                cumulativeAllocatedRate = tierRewardRate;
            } else if (
                currentTier > 0 &&
                !tierAllocated[currentTier] &&
                !isPreacher(referralChain[i])
            ) {
                emit PreacherCheckFailed(
                    referralChain[i],
                    currentTier,
                    "INSUFFICIENT_PREACHER_STATUS"
                );
            }

            unchecked {
                ++i;
            }
        }
    }

    function _calculateStakeReward(
        IStaking.Record storage stakeRecord
    ) private view returns (uint256 currentReward) {
        UD60x18 principalAmount = ud(stakeRecord.amount);
        uint40 stakeStartTime = stakeRecord.stakeTime;
        uint40 stakingDuration;

        unchecked {
            stakingDuration = uint40(block.timestamp) - stakeStartTime;
        }

        stakingDuration = _min40(
            stakingDuration,
            uint40(getStakePeriod(stakeRecord.stakeIndex))
        );

        if (stakingDuration == 0) {
            currentReward = UD60x18.unwrap(principalAmount);
        } else {
            UD60x18 baseInterestRate = ud(rates[stakeRecord.stakeIndex]);

            // Convert stakingDuration from seconds to the correct time unit (days for mainnet, minutes for testnet)
            uint256 compoundPeriods = stakingDuration / getCompoundTimeUnit();
            
            UD60x18 compoundedAmount = principalAmount.mul(
                baseInterestRate.powu(compoundPeriods)
            );
            currentReward = UD60x18.unwrap(compoundedAmount);
        }
    }

    function _validateStakeParameters(
        uint160 _amount,
        uint8 _stakeIndex
    ) private view {
        if (_amount > maxStakeAmount()) revert ExceedsMaxStakeAmount();
        if (_stakeIndex > MAX_STAKE_INDEX) revert InvalidStakeIndex();

        uint256 userCurrentTotal = principalBalance(msg.sender);
        if (userCurrentTotal + _amount > MAX_USER_TOTAL_STAKE) {
            revert ExceedsUserTotalStakeLimit();
        }
    }

    function _swapAndAddLiquidity(uint160 usdtAmount) private {
        IERC20(USDT).transferFrom(msg.sender, address(this), usdtAmount);

        address[] memory swapPath = new address[](2);
        swapPath[0] = address(USDT);
        swapPath[1] = address(SYI);

        uint256 syiBalanceBefore = SYI.balanceOf(address(this));
        uint256 usdtToSwap = usdtAmount / LIQUIDITY_SPLIT_DIVISOR;

        uint256 minOlaTokensOut = _calculateMinimumOutput(usdtToSwap);

        ROUTER.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            usdtToSwap,
            minOlaTokensOut,
            swapPath,
            address(this),
            block.timestamp
        );

        uint256 syiBalanceAfter = SYI.balanceOf(address(this));
        uint256 syiTokensReceived = syiBalanceAfter - syiBalanceBefore;

        uint256 remainingUsdt = usdtAmount - usdtToSwap;
        ROUTER.addLiquidity(
            address(USDT),
            address(SYI),
            remainingUsdt,
            syiTokensReceived,
            0,
            0,
            address(0),
            block.timestamp
        );
    }

    function _min40(uint40 a, uint40 b) private pure returns (uint40) {
        return a < b ? a : b;
    }

    function _min256(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    function _getUserTier(address user) private view returns (uint8 tier) {
        if (user == rootAddress || !isPreacher(user)) {
            return 0;
        }

        uint256 teamKPI = getTeamKpi(user);
        IStaking.TeamTier[7] memory tiers = _getTeamTiers();

        for (uint256 i = 0; i < tiers.length; ) {
            if (teamKPI >= tiers[i].threshold) {
                return uint8(7 - i);
            }
            unchecked {
                ++i;
            }
        }

        return 0;
    }

    function _getTierRewardRate(
        uint8 tier
    ) private pure returns (uint256 rate) {
        if (tier == 1) return 5;
        if (tier == 2) return 10;
        if (tier == 3) return 15;
        if (tier == 4) return 20;
        if (tier == 5) return 25;
        if (tier == 6) return 30;
        if (tier == 7) return 35;
        return 0;
    }

    function _calculateMinimumOutput(
        uint256 usdtAmountIn
    ) private view returns (uint256 minAmountOut) {
        address pair = SYI.getUniswapV2Pair();
        (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair)
            .getReserves();

        uint112 reserveUSDT;
        uint112 reserveSYI;

        address token0 = IUniswapV2Pair(pair).token0();
        if (token0 == address(USDT)) {
            reserveUSDT = reserve0;
            reserveSYI = reserve1;
        } else {
            reserveUSDT = reserve1;
            reserveSYI = reserve0;
        }

        uint256 expectedOutput = ROUTER.getAmountOut(
            usdtAmountIn,
            reserveUSDT,
            reserveSYI
        );

        uint256 priceImpact = (usdtAmountIn * BASIS_POINTS_DENOMINATOR) /
            reserveUSDT;

        uint256 slippageTolerance;
        if (priceImpact <= PRICE_IMPACT_THRESHOLD) {
            slippageTolerance = BASE_SLIPPAGE_TOLERANCE;
        } else {
            uint256 additionalSlippage = (priceImpact *
                BASE_SLIPPAGE_TOLERANCE) / PRICE_IMPACT_THRESHOLD;
            slippageTolerance = BASE_SLIPPAGE_TOLERANCE + additionalSlippage;

            if (slippageTolerance > MAX_SLIPPAGE_TOLERANCE) {
                slippageTolerance = MAX_SLIPPAGE_TOLERANCE;
            }
        }

        uint256 expectedOutputAfterFees = (expectedOutput *
            (BASIS_POINTS_DENOMINATOR - SYI_TOTAL_BUY_FEE_BPS)) /
            BASIS_POINTS_DENOMINATOR;

        minAmountOut =
            (expectedOutputAfterFees *
                (BASIS_POINTS_DENOMINATOR - slippageTolerance)) /
            BASIS_POINTS_DENOMINATOR;

        if (minAmountOut == 0) {
            minAmountOut = 1;
        }
    }

    function _recordWithdrawal(
        address user,
        uint256 stakeIndex,
        uint256 principalAmount,
        uint256 calculatedReward,
        uint256 usdtReceived,
        uint256 syiTokensUsed,
        uint256 referralFee,
        uint256 teamFee,
        uint256 userPayout,
        uint256 interestEarned
    ) private {
        uint40 withdrawalTime = uint40(block.timestamp);

        IStaking.WithdrawalRecord memory withdrawalRecord = IStaking
            .WithdrawalRecord({
                withdrawalTime: withdrawalTime,
                stakeIndex: stakeIndex,
                principalAmount: principalAmount,
                calculatedReward: calculatedReward,
                usdtReceived: usdtReceived,
                syiTokensUsed: syiTokensUsed,
                referralFee: referralFee,
                teamFee: teamFee,
                userPayout: userPayout,
                interestEarned: interestEarned
            });

        _userWithdrawalHistory[user].push(withdrawalRecord);

        emit RewardPaid(user, calculatedReward, withdrawalTime, stakeIndex);

        emit WithdrawalCompleted(
            user,
            stakeIndex,
            principalAmount,
            calculatedReward,
            usdtReceived,
            syiTokensUsed,
            referralFee,
            teamFee,
            userPayout,
            interestEarned,
            withdrawalTime
        );
    }

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    function setSYI(address _syi) external onlyOwner {
        require(_syi != address(0), "SYI address cannot be zero");
        SYI = ISYI(_syi);
        SYI.approve(address(ROUTER), type(uint256).max);
        emit SYIContractSet(_syi);
    }

    function emergencyWithdrawSYI(
        address to,
        uint256 _amount
    ) external onlyOwner {
        SYI.transfer(to, _amount);
    }

    function emergencyWithdrawUSDT(
        address to,
        uint256 _amount
    ) external onlyOwner {
        IERC20(USDT).transfer(to, _amount);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        address oldRecipient = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(oldRecipient, _feeRecipient);
    }
}
