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
    function getAPYRate30D() internal pure virtual returns (uint256);
    function getAPYRate90D() internal pure virtual returns (uint256);
    function getAPYRate180D() internal pure virtual returns (uint256);

    // Staking Periods
    function getStakePeriod1D() internal pure virtual returns (uint256);
    function getStakePeriod30D() internal pure virtual returns (uint256);
    function getStakePeriod90D() internal pure virtual returns (uint256);
    function getStakePeriod180D() internal pure virtual returns (uint256);

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

    // =========================================================================
    // REFERRAL REQUIREMENT CONFIGURATION
    // =========================================================================

    /**
     * @notice 当前系统是否要求推荐人必须质押
     * @dev true = 推荐人必须持有 > 1 sSYI，false = 无质押要求
     */
    bool public requireReferrerStaked;

    /**
     * @notice 记录用户绑定推荐人时的系统配置快照
     * @dev mapping(用户地址 => 绑定时是否要求推荐人质押)
     * @dev 一旦绑定，该状态永久生效
     */
    mapping(address => bool) private _userReferralRequirementSnapshot;

    // Fee collection
    address public feeRecipient;
    uint256 public constant REDEMPTION_FEE_RATE = 100; // 1% = 100 basis points

    // =========================================================================
    // NODE TIER MANAGEMENT SYSTEM
    // =========================================================================

    /**
     * @notice 节点等级管理员地址
     * @dev 只有此地址可以设置用户的节点等级
     */
    address public tierManager;

    /**
     * @notice 节点等级记录结构
     * @param tier 等级 (1=V1, 2=V2)
     * @param setTime 设置时间戳
     * @param setBy 设置操作者地址
     * @param active 是否激活
     */
    struct NodeTierRecord {
        uint8 tier;
        uint40 setTime;
        address setBy;
        bool active;
    }

    /**
     * @notice 用户节点等级映射
     */
    mapping(address => NodeTierRecord) public nodeTiers;

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

    // Node Tier Management Events
    event TierManagerUpdated(
        address indexed oldManager,
        address indexed newManager,
        address indexed operator,
        uint256 timestamp
    );

    event NodeTierSet(
        address indexed user,
        uint8 tier,
        address indexed setBy,
        uint256 timestamp
    );

    event NodeTierRemoved(
        address indexed user,
        uint8 previousTier,
        address indexed removedBy,
        uint256 timestamp
    );

    event NodeTierBatchSet(
        address[] users,
        uint8[] tiers,
        address indexed setBy,
        uint256 count,
        uint256 timestamp
    );

    event NodeTierUsed(
        address indexed user,
        uint8 naturalTier,
        uint8 nodeTier,
        uint8 finalTier,
        string reason
    );

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    modifier onlyEOA() {
        if (shouldCheckEOA() && tx.origin != msg.sender)
            revert OnlyEOAAllowed();
        _;
    }

    /**
     * @notice 限制只有 tierManager 可以调用
     */
    modifier onlyTierManager() {
        require(msg.sender == tierManager, "Caller is not tier manager");
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

        // 初始化 tierManager 为 owner
        tierManager = msg.sender;

        // 初始化推荐人质押要求为 true（保持原有严格行为）
        requireReferrerStaked = true;

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

    /**
     * @notice Withdraws interest early while keeping principal staked
     * @dev Resets compound interest calculation to principal, but keeps original end time unchanged
     * @param stakeIndex Index of the stake record
     * @return profitWithdrawn Amount of profit withdrawn in SYI (before swap)
     */
    function withdrawInterest(
        uint256 stakeIndex
    ) external onlyEOA returns (uint256 profitWithdrawn) {
        IStaking.Record storage stakeRecord = userStakeRecord[msg.sender][
            stakeIndex
        ];

        require(!stakeRecord.status, "Already withdrawn");
        require(
            block.timestamp < stakeRecord.originalEndTime,
            "Stake period ended, use unstake instead"
        );

        // 1. 计算当前价值（从上次 stakeTime 开始复利）
        uint256 currentValue = _calculateStakeReward(stakeRecord);

        // 2. 计算新增盈利
        uint256 newProfit = currentValue - stakeRecord.amount;

        require(newProfit > 0, "No new profit to withdraw");

        // 3. 兑换为 USDT
        (uint256 usdtReceived, uint256 syiTokensUsed) = _swapSYIForReward(
            newProfit
        );

        // 4. 分配费用（friend + team）
        uint256 interestEarned = usdtReceived;
        address[] memory referralChain = getReferrals(msg.sender, maxD);
        uint256 friendReward = _distributeFriendReward(
            msg.sender,
            interestEarned
        );
        uint256 teamFee = _distributeTeamReward(referralChain, interestEarned);

        // 5. 计算并收取 1% redemption fee
        uint256 userPayout = usdtReceived - friendReward - teamFee;
        uint256 redemptionFeeUSDT = (userPayout * REDEMPTION_FEE_RATE) /
            BASIS_POINTS_DENOMINATOR;

        if (redemptionFeeUSDT > 0 && feeRecipient != address(0)) {
            (, uint256 redemptionFeeSYIUsed) = _swapSYIForReward(
                redemptionFeeUSDT
            );
            emit RedemptionFeeCollected(
                msg.sender,
                stakeIndex,
                redemptionFeeSYIUsed,
                redemptionFeeUSDT,
                feeRecipient,
                block.timestamp
            );
        }

        // 记录旧的 stakeTime 用于事件
        uint40 oldStakeTime = stakeRecord.stakeTime;

        // 6. ⚠️ 关键步骤：重置复利起点
        stakeRecord.stakeTime = uint40(block.timestamp); // 重置为当前时间
        // stakeRecord.amount 保持不变（本金不变）
        // stakeRecord.originalEndTime 保持不变（到期时间不变）
        stakeRecord.totalWithdrawn += uint160(usdtReceived); // 记录累计提取

        // 7. 转账给用户
        IERC20(USDT).transfer(msg.sender, userPayout);

        // 8. 回收 SYI
        SYI.recycle(syiTokensUsed);

        // 9. 发出事件
        emit InterestWithdrawn(
            msg.sender,
            stakeIndex,
            newProfit,
            usdtReceived,
            userPayout,
            friendReward,
            teamFee,
            redemptionFeeUSDT,
            stakeRecord.stakeTime, // 新的 stakeTime
            stakeRecord.originalEndTime,
            block.timestamp
        );

        emit CompoundInterestReset(
            msg.sender,
            stakeIndex,
            currentValue,
            stakeRecord.amount,
            oldStakeTime,
            stakeRecord.stakeTime,
            stakeRecord.originalEndTime,
            block.timestamp
        );

        return newProfit;
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

        // ⭐ 验证推荐人资格（新逻辑）
        _validateReferrer(_referrer);

        // ⭐ 记录用户绑定时的系统配置快照
        _userReferralRequirementSnapshot[user] = requireReferrerStaked;

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

        emit BindReferral(user, _referrer, block.number);
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

        emit BindFriend(user, _friend, block.number);
    }

    /**
     * @notice 将质押合约中累积的 USDT 同步到 SYI/USDT 流动性池
     * @dev 这个函数用于增加流动性池的深度，提升交易体验
     *
     * 工作流程：
     * 1. 查询当前合约持有的 USDT 余额（来自质押奖励累积）
     * 2. 获取 SYI/USDT 交易对合约地址
     * 3. 将所有 USDT 转入流动性池
     * 4. 调用交易对的 sync() 更新储备量，使新增的 USDT 生效
     *
     * 注意：
     * - 这会增加池子中的 USDT 数量，导致 SYI 价格上涨
     * - 任何人都可以调用此函数（external）
     * - 不会产生 LP 代币，相当于向池子"捐赠"流动性
     */
    function sync() external {
        // 步骤1: 获取本合约当前持有的 USDT 余额
        // 这些 USDT 通常来自质押奖励的累积或其他收入
        uint256 w_bal = IERC20(USDT).balanceOf(address(this));

        // 步骤2: 从 SYI 代币合约获取其对应的 Uniswap V2 交易对地址
        // 该地址存储了 SYI/USDT 的流动性池合约
        address pair = SYI.getUniswapV2Pair();

        // 步骤3: 将所有 USDT 转账到交易对合约
        // 此时 USDT 已到达流动性池，但储备量（reserves）尚未更新
        IERC20(USDT).transfer(pair, w_bal);

        // 步骤4: 调用交易对的 sync() 方法
        // sync() 会重新读取合约的代币余额，更新内部储备量（reserves）
        // 这样新增的 USDT 才会真正参与到 AMM 定价中
        // 由于 USDT 增加而 SYI 不变，会导致 SYI 价格上涨（x*y=k 公式）
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
        if (stakeIndex == 1) return getStakePeriod30D();
        if (stakeIndex == 2) return getStakePeriod90D();
        if (stakeIndex == 3) return getStakePeriod180D();
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
                // ⚠️ 修改：使用 originalEndTime
                if (block.timestamp >= stakeRecord.originalEndTime) {
                    timeRemaining[i] = 0;
                } else {
                    timeRemaining[i] =
                        stakeRecord.originalEndTime -
                        block.timestamp;
                }
            } else {
                timeRemaining[i] = 0;
            }
        }
    }

    /**
     * @notice Gets detailed information about a user's stake
     * @param user User address
     * @param stakeIndex Index of the stake record
     */
    function getUserStakeDetails(
        address user,
        uint256 stakeIndex
    )
        external
        view
        returns (
            uint256 principal,
            uint256 currentValue,
            uint256 newProfit,
            uint256 totalWithdrawn,
            uint40 startTime,
            uint40 lastResetTime,
            uint40 originalEndTime,
            bool canWithdraw,
            uint256 timeRemaining
        )
    {
        require(
            stakeIndex < userStakeRecord[user].length,
            "Invalid stake index"
        );

        IStaking.Record storage stakeRecord = userStakeRecord[user][stakeIndex];

        principal = stakeRecord.amount;
        currentValue = _calculateStakeReward(stakeRecord);
        newProfit = currentValue - principal;
        totalWithdrawn = stakeRecord.totalWithdrawn;

        startTime = stakeRecord.startTime;
        lastResetTime = stakeRecord.stakeTime;
        originalEndTime = stakeRecord.originalEndTime;

        canWithdraw =
            block.timestamp >= originalEndTime &&
            !stakeRecord.status;

        timeRemaining = block.timestamp >= originalEndTime
            ? 0
            : originalEndTime - block.timestamp;
    }

    /**
     * @notice Checks if user can withdraw interest early
     * @param user User address
     * @param stakeIndex Index of the stake record
     */
    function canWithdrawInterest(
        address user,
        uint256 stakeIndex
    )
        external
        view
        returns (
            bool canWithdraw,
            uint256 withdrawableProfit,
            string memory reason
        )
    {
        if (userStakeRecord[user].length <= stakeIndex) {
            return (false, 0, "Invalid stake index");
        }

        IStaking.Record storage stakeRecord = userStakeRecord[user][stakeIndex];

        if (stakeRecord.status) {
            return (false, 0, "Already withdrawn");
        }

        if (block.timestamp >= stakeRecord.originalEndTime) {
            return (false, 0, "Stake period ended, use unstake()");
        }

        uint256 currentValue = _calculateStakeReward(stakeRecord);
        uint256 newProfit = currentValue - stakeRecord.amount;

        if (newProfit == 0) {
            return (false, 0, "No new profit");
        }

        return (true, newProfit, "");
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

        // ⚠️ 关键修改：使用 originalEndTime 而不是 stakeTime + period
        return block.timestamp >= stakeRecord.originalEndTime;
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
        rates[1] = getAPYRate30D();
        rates[2] = getAPYRate90D();
        rates[3] = getAPYRate180D();
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

    /**
     * @notice 验证推荐人资格（内部函数）
     * @param _referrer 推荐人地址
     * @dev 复杂的继承规则逻辑封装在此函数中
     */
    function _validateReferrer(address _referrer) private view {
        // rootAddress 永远合法
        if (_referrer == rootAddress) {
            return;
        }

        // 当前系统不要求质押，直接通过
        if (!requireReferrerStaked) {
            return;
        }

        // 当前系统要求质押，需要检查推荐人状态
        if (_hasLocked[_referrer]) {
            // 推荐人已绑定，检查其历史快照
            if (_userReferralRequirementSnapshot[_referrer]) {
                // 推荐人当时也需要质押，检查其当前质押状态
                if (balanceOf(_referrer) <= 1 ether) {
                    revert InvalidReferrer();
                }
            }
            // 推荐人当时不需要质押，永久豁免检查
        } else {
            // 推荐人未绑定（特殊情况），按当前规则检查
            if (balanceOf(_referrer) <= 1 ether) {
                revert InvalidReferrer();
            }
        }
    }

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

        uint40 currentTime = uint40(block.timestamp);
        uint40 endTime = currentTime + uint40(getStakePeriod(_stakeIndex));

        IStaking.Record memory order;
        order.startTime = currentTime;              // ⭐ 记录原始质押时间
        order.stakeTime = currentTime;              // 复利计算起点
        order.originalEndTime = endTime;            // ⭐ 记录原定到期时间
        order.amount = _amount;
        order.totalWithdrawn = 0;                   // ⭐ 初始化累计提取
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

        // ⚠️ 关键修改：使用 originalEndTime 而不是 stakeTime + period
        if (block.timestamp < user_record.originalEndTime) {
            revert StakingPeriodNotMet();
        }
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

        // ⚠️ 关键修改：计算复利时，限制最大时间不超过 originalEndTime
        uint40 effectiveEndTime = _min40(
            uint40(block.timestamp),
            stakeRecord.originalEndTime
        );

        unchecked {
            stakingDuration = effectiveEndTime - stakeStartTime;
        }

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

    /**
     * @notice 计算用户的最终等级
     * @param user 用户地址
     * @return tier 最终等级 (0-7)
     * @dev 逻辑：MAX(自然等级, 节点等级)
     * @dev 节点等级作为最低保障，不限制自然升级
     */
    function _getUserTier(address user) private view returns (uint8 tier) {
        // 1. rootAddress 永远返回 0
        if (user == rootAddress) {
            return 0;
        }

        // 2. 非 Preacher 用户返回 0（节点等级也无效）
        if (!isPreacher(user)) {
            return 0;
        }

        // 3. 计算自然等级（基于 teamKPI）
        uint8 naturalTier = _calculateNaturalTier(user);

        // 4. 检查节点等级
        NodeTierRecord memory record = nodeTiers[user];
        uint8 nodeTier = record.active ? record.tier : 0;

        // 5. 取最大值
        return _max8(naturalTier, nodeTier);
    }

    /**
     * @notice 计算用户的自然等级（不考虑节点等级）
     * @param user 用户地址
     * @return tier 自然等级 (0-7)
     * @dev 纯粹基于 teamKPI 计算
     */
    function _calculateNaturalTier(address user) private view returns (uint8 tier) {
        // rootAddress 或非 Preacher 返回 0
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

    /**
     * @notice 返回两个 uint8 的最大值
     */
    function _max8(uint8 a, uint8 b) private pure returns (uint8) {
        return a >= b ? a : b;
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

    /**
     * @notice 设置推荐人质押要求（仅限管理员）
     * @param _required 是否要求推荐人必须质押
     * @dev 只影响未来的新绑定，不影响已绑定用户
     */
    function setRequireReferrerStaked(bool _required) external onlyOwner {
        bool oldValue = requireReferrerStaked;
        requireReferrerStaked = _required;

        emit ReferrerStakeRequirementUpdated(oldValue, _required, block.timestamp);
    }

    // =========================================================================
    // NODE TIER MANAGEMENT FUNCTIONS
    // =========================================================================

    /**
     * @notice 设置节点等级管理员地址
     * @param _tierManager 新的管理员地址
     * @dev 只能由 owner 调用，0地址表示禁用功能
     */
    function setTierManager(address _tierManager) external onlyOwner {
        address oldManager = tierManager;
        tierManager = _tierManager;

        emit TierManagerUpdated(
            oldManager,
            _tierManager,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice 为用户设置节点等级（V1或V2）
     * @param user 目标用户地址
     * @param tier 等级 (1=V1, 2=V2)
     * @dev 只能由 tierManager 调用
     * @dev 节点等级作为最低保障，不限制自然升级
     */
    function setNodeTier(
        address user,
        uint8 tier
    ) external onlyTierManager {
        require(user != address(0), "NodeTier: invalid address");
        require(user != rootAddress, "NodeTier: cannot set for root");
        require(tier >= 1 && tier <= 2, "NodeTier: only tier 1 or 2 allowed");

        nodeTiers[user] = NodeTierRecord({
            tier: tier,
            setTime: uint40(block.timestamp),
            setBy: msg.sender,
            active: true
        });

        emit NodeTierSet(user, tier, msg.sender, block.timestamp);
    }

    /**
     * @notice 移除用户的节点等级
     * @param user 目标用户地址
     * @dev 只能由 tierManager 调用
     */
    function removeNodeTier(address user) external onlyTierManager {
        require(nodeTiers[user].active, "NodeTier: no active tier");

        uint8 previousTier = nodeTiers[user].tier;
        nodeTiers[user].active = false;

        emit NodeTierRemoved(user, previousTier, msg.sender, block.timestamp);
    }

    /**
     * @notice 批量设置节点等级
     * @param users 用户地址数组
     * @param tiers 对应等级数组
     * @dev 只能由 tierManager 调用
     * @dev 最多一次处理 100 个用户
     */
    function batchSetNodeTier(
        address[] calldata users,
        uint8[] calldata tiers
    ) external onlyTierManager {
        require(users.length == tiers.length, "NodeTier: array length mismatch");
        require(users.length > 0, "NodeTier: empty array");
        require(users.length <= 100, "NodeTier: max 100 users per batch");

        for (uint256 i = 0; i < users.length; ) {
            address user = users[i];
            uint8 tier = tiers[i];

            require(user != address(0), "NodeTier: invalid address in batch");
            require(user != rootAddress, "NodeTier: cannot set for root");
            require(tier >= 1 && tier <= 2, "NodeTier: invalid tier in batch");

            nodeTiers[user] = NodeTierRecord({
                tier: tier,
                setTime: uint40(block.timestamp),
                setBy: msg.sender,
                active: true
            });

            emit NodeTierSet(user, tier, msg.sender, block.timestamp);

            unchecked {
                ++i;
            }
        }

        emit NodeTierBatchSet(users, tiers, msg.sender, users.length, block.timestamp);
    }

    /**
     * @notice 批量移除节点等级
     * @param users 用户地址数组
     * @dev 只能由 tierManager 调用
     */
    function batchRemoveNodeTier(
        address[] calldata users
    ) external onlyTierManager {
        require(users.length > 0, "NodeTier: empty array");
        require(users.length <= 100, "NodeTier: max 100 users per batch");

        for (uint256 i = 0; i < users.length; ) {
            address user = users[i];
            if (nodeTiers[user].active) {
                uint8 previousTier = nodeTiers[user].tier;
                nodeTiers[user].active = false;
                emit NodeTierRemoved(user, previousTier, msg.sender, block.timestamp);
            }

            unchecked {
                ++i;
            }
        }
    }

    // =========================================================================
    // NODE TIER QUERY FUNCTIONS
    // =========================================================================

    /**
     * @notice 查询用户的节点等级详情
     * @param user 用户地址
     * @return hasNodeTier 是否设置了节点等级
     * @return tier 节点等级
     * @return setTime 设置时间
     * @return setBy 设置者地址
     * @return isActive 是否激活
     */
    function getNodeTierDetails(
        address user
    ) external view returns (
        bool hasNodeTier,
        uint8 tier,
        uint40 setTime,
        address setBy,
        bool isActive
    ) {
        NodeTierRecord memory record = nodeTiers[user];
        hasNodeTier = record.tier > 0;
        tier = record.tier;
        setTime = record.setTime;
        setBy = record.setBy;
        isActive = record.active;
    }

    /**
     * @notice 查询用户的完整等级信息
     * @param user 用户地址
     * @return isPreacherStatus 是否为 Preacher
     * @return naturalTier 自然等级 (基于 teamKPI)
     * @return nodeTier 节点等级
     * @return finalTier 最终等级 (实际生效)
     * @return usingNodeTier 是否使用了节点等级
     */
    function getUserTierBreakdown(
        address user
    ) external view returns (
        bool isPreacherStatus,
        uint8 naturalTier,
        uint8 nodeTier,
        uint8 finalTier,
        bool usingNodeTier
    ) {
        isPreacherStatus = isPreacher(user);

        // 计算自然等级（不考虑节点等级）
        naturalTier = _calculateNaturalTier(user);

        // 获取节点等级
        NodeTierRecord memory record = nodeTiers[user];
        nodeTier = (record.active && isPreacherStatus) ? record.tier : 0;

        // 最终等级（通过 _getUserTier 获取）
        finalTier = _getUserTier(user);

        // 判断是否使用了节点等级
        usingNodeTier = (nodeTier > 0 && finalTier == nodeTier && naturalTier < nodeTier);
    }
}
