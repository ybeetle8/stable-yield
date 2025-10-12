// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/*
================================================================================
 本文件为“阅读用注释版”拷贝，原始实现位于：
   contracts/LiquidityStaking/abstract/LiquidityStakingBase.sol
 用途：为审阅/学习提供最详细中文注释；不用于部署与编译的生产代码。
--------------------------------------------------------------------------------
 合约概要
 - 功能：LP 质押获取 USDT 奖励；奖励来自：
     1) SYI 税费累积（在阈值处批量 SYI→USDT）
     2) 利润税/外部直接注入的 USDT
 - 分配：7 天线性释放（rewardPerSecond = pendingRewards / 7 days）
 - 权重：amount × (1 + duration/365d)，随时间线性递增（约 1 年达 2 倍）
 - 主网：最小质押时长由子合约重写（主网实现为 24h）
 - 结算：采用“rewardPerToken 累积指标 + 用户上次已付指标”经典模式，避免每次迭代遍历
 - 安全：ReentrancyGuard 保护 stake/unstake/claim；onlyAdmin 控管奖励注入/紧急转出
--------------------------------------------------------------------------------
 重要术语
 - totalRewards：历史累计进入池子的 USDT 总额（包括已发放）
 - pendingRewards：尚未发放（待线性释放）的 USDT 总额
 - distributedRewards：已发放累计 USDT
 - rewardPerSecond：按 7 天平均线性释放的秒级速率
 - rewardPerTokenStored：全局“每个 LP token 对应的奖励累计值（1e18 精度）”，按时间推进
 - userRewardPerTokenPaid[user]：用户上次同步时的全局指标指针
 - userPendingRewards[user]：用户已累积、尚未取走的奖励
================================================================================
*/

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol"; // ERC20 最小接口（仅 balanceOf/transfer/transferFrom/approve）
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // 重入保护（nonReentrant 修饰）
import {IStaking} from "../interfaces/IStaking.sol"; // 单币质押接口（当前版本未直接使用，预留扩展）
import {ISYI} from "../interfaces/ISYI.sol"; // SYI Token 接口（触发费处理/资金中继分发）
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol"; // 所有权控制（owner = _admin）
import {IUniswapV2Router02} from "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol"; // Router 接口（支持含税转账的 swap）

/**
 * @title LiquidityStakingBase - LP 质押基础实现（主网/测试网共享逻辑）
 * @notice 环境相关常量（如最小质押时长）通过抽象函数由子合约覆盖
 */
abstract contract LiquidityStakingBase is ReentrancyGuard, Ownable {
    // =========================================================================
    // 抽象：环境特定常量
    // =========================================================================

    /// @notice 获取最小质押时长（由主网/测试网子合约各自覆盖）
    function getMinStakeDuration() internal pure virtual returns (uint256);

    // =========================================================================
    // 状态变量（核心地址/池/用户态等）
    // =========================================================================

    /// @dev SYI 代币合约地址（具备“管理员”权限，可注入奖励/转出等）
    address public immutable syiContract;

    /// @dev USDT 合约地址（奖励币种）
    address public immutable usdt;

    /// @dev SYI/USDT LP 合约地址（用户质押的 LP Token）
    address public immutable lpToken;

    /// @dev 单币质押合约接口（当前版本未直接使用，预留扩展）
    IStaking public immutable staking;

    /// @dev DEX Router（用于将累计 SYI 批量兑换为 USDT）
    IUniswapV2Router02 public immutable router;

    /// @notice 最小可发放奖励阈值（避免过小转账浪费 gas）。
    /// @dev 单位依赖 USDT 的 decimals；请在部署前确认 USDT 精度。
    uint256 public constant MIN_REWARD_AMOUNT = 1000; // 例如 USDT: 18 位时约 1e-15 USDT

    /// @notice 待批量兑换的 SYI 累积量（达到阈值时一次性兑换，减少频繁 swap）
    uint256 public accumulatedSYI;

    // --------------------- 用户质押相关结构 ---------------------

    /// @notice 用户单地址的质押信息
    struct StakeInfo {
        uint256 amount;            // 该地址当前质押 LP 数量
        uint256 stakeTime;         // 首次质押时间（用于时间权重）
        uint256 lastRewardTime;    // 上次奖励入账时间（统计用途）
        uint256 accumulatedReward; // 历史累计已领取的奖励（统计展示用）
    }

    /// @notice 奖励池全局状态
    struct RewardPool {
        uint256 totalRewards;        // 历史累计注入/兑换进池的 USDT 总量（不含 SYI 未换部分）
        uint256 rewardPerSecond;     // 当前生效的线性释放速率（秒）
        uint256 lastUpdateTime;      // 上次推进 rewardPerTokenStored 的时间戳
        uint256 rewardPerTokenStored;// “每个 LP 对应的累计奖励”指标（1e18 精度）
        uint256 totalStaked;         // 全网总质押 LP
        uint256 totalWeight;         // 预留字段（当前未直接使用，查询时动态计算）
        uint256 distributedRewards;  // 从池中已发放给用户的 USDT 累计
        uint256 pendingRewards;      // 尚未释放的 USDT（会按 7 天线性释放）
    }

    // --------------------- 映射/数组（用户索引、白名单等）---------------------

    mapping(address => StakeInfo) public stakes; // 用户地址 => 质押信息
    address[] public stakers;                    // 当前有质押余额的地址列表（用于遍历权重/统计）
    mapping(address => bool) public isStaker;    // 地址是否在 stakers 列表中
    RewardPool public rewardPool;                // 奖励池全局状态
    mapping(address => bool) public excludedFromStaking; // 被排除参与质押的地址（如营销/合约地址）

    // --------------------- 权重缓存（降低频繁遍历成本） ---------------------

    uint256 private cachedTotalWeight;      // 最近一次计算的“总权重”值
    uint256 private cachedWeightTimestamp;  // 缓存对应的时间戳（同一秒重复查询直接复用）

    // --------------------- 用户奖励快照与应计 ---------------------

    mapping(address => uint256) public userRewardPerTokenPaid; // 用户上次已结算到的全局指标
    mapping(address => uint256) public userPendingRewards;      // 用户累计但尚未领取的奖励

    // =========================================================================
    // 事件（对外观测用）
    // =========================================================================

    /// @notice 成功质押 LP
    event Staked(address indexed user, uint256 amount, uint256 timestamp);

    /// @notice 成功解押 LP（同时记录本次发放的奖励）
    event Unstaked(address indexed user, uint256 amount, uint256 reward);

    /// @notice 成功领取奖励（USDT）
    event RewardClaimed(address indexed user, uint256 reward);

    /// @notice 奖励 USDT 注入池子，并重算线性释放速率
    event RewardsDeposited(uint256 amount, uint256 newRewardRate);

    /// @notice SYI 奖励被累计（未立即兑换）
    event SYIRewardsAccumulated(uint256 syiAmount, uint256 totalAccumulated);

    /// @notice 累计的 SYI 成功兑换为 USDT，并进入释放池
    event SYISwappedToRewards(
        uint256 syiAmount,
        uint256 usdtAmount,
        uint256 newRewardRate
    );

    /// @notice 地址是否被排除参与质押的状态变更
    event AddressExcluded(address indexed account, bool excluded);

    // =========================================================================
    // 自定义错误（gas 更省）
    // =========================================================================

    error OnlyAdmin();              // 仅限 owner 或 syiContract 调用
    error InvalidAddress();         // 地址为 0
    error InvalidAmount();          // 金额为 0 或非法
    error InsufficientStakeTime();  // 未满足最小质押时间
    error NoStakeFound();           // 未找到质押记录
    error ExcludedFromStaking();    // 地址被排除参与质押
    error TransferFailed();         // ERC20 转账失败

    // =========================================================================
    // 修饰器
    // =========================================================================

    /// @dev 仅管理员（owner 或 SYI 合约）可调用
    modifier onlyAdmin() {
        if (msg.sender != syiContract && msg.sender != owner()) revert OnlyAdmin();
        _;
    }

    /// @dev 在状态变更前，先推进全局奖励指标，再同步用户的应计奖励
    ///      - _updateRewardPool()：推进 rewardPerTokenStored 到“当前时刻”
    ///      - _updateUserReward(account)：把 account 的新增收益计入 userPendingRewards
    modifier updateReward(address account) {
        _updateRewardPool();
        if (account != address(0)) {
            _updateUserReward(account);
        }
        _;
    }

    // =========================================================================
    // 构造函数
    // =========================================================================

    /**
     * @param _usdt USDT 合约地址（奖励币种）
     * @param _syiContract SYI 合约地址（具备管理员权限，可注入/触发分发等）
     * @param _lpToken SYI/USDT LP Token 地址（用户质押的资产）
     * @param _staking 单币质押合约地址（预留扩展）
     * @param _marketingAddress 营销地址（默认排除参与质押）
     * @param _admin owner 地址
     * @param _router DEX Router（用于 SYI→USDT 兑换）
     */
    constructor(
        address _usdt,
        address _syiContract,
        address _lpToken,
        address _staking,
        address _marketingAddress,
        address _admin,
        address _router
    ) Ownable(_admin) {
        // 基础地址合法性检验
        if (
            _usdt == address(0) ||
            _syiContract == address(0) ||
            _lpToken == address(0) ||
            _staking == address(0) ||
            _router == address(0)
        ) {
            revert InvalidAddress();
        }

        // 初始化核心地址与接口
        usdt = _usdt;
        syiContract = _syiContract;
        lpToken = _lpToken;
        staking = IStaking(_staking);
        router = IUniswapV2Router02(_router);

        // 初始化奖励推进起点
        rewardPool.lastUpdateTime = block.timestamp;

        // 配置默认排除地址（不参与质押权重/奖励）
        if (_marketingAddress != address(0)) {
            excludedFromStaking[_marketingAddress] = true;
            emit AddressExcluded(_marketingAddress, true);
        }
        excludedFromStaking[address(this)] = true; // 本合约地址
        excludedFromStaking[_syiContract] = true;  // SYI 合约地址
        emit AddressExcluded(address(this), true);
        emit AddressExcluded(_syiContract, true);
    }

    // =========================================================================
    // 质押相关外部函数（带重入保护）
    // =========================================================================

    /**
     * @notice 质押 LP 代币，开始计权重并累积奖励
     * @dev 流程：
     *   1) updateReward(msg.sender)：推进全局指标并同步用户应计
     *   2) transferFrom 用户 LP 至本合约
     *   3) 初次质押用户写入时间与指标指针
     *   4) 增加用户与全局的质押额；刷新权重缓存
     *   5) emit 事件
     *   6) 尝试处理累计 SYI（可能触发批量 SYI→USDT 并更新释放速率）
     * @param amount 质押 LP 数量
     */
    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert InvalidAmount();
        if (excludedFromStaking[msg.sender]) revert ExcludedFromStaking();

        // 转入 LP
        if (!IERC20(lpToken).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        StakeInfo storage userStake = stakes[msg.sender];

        // 首次进入：注册为 staker，并初始化奖励指针
        if (!isStaker[msg.sender]) {
            stakers.push(msg.sender);
            isStaker[msg.sender] = true;
            userStake.stakeTime = block.timestamp;
            userStake.lastRewardTime = block.timestamp;
            userRewardPerTokenPaid[msg.sender] = _rewardPerToken();
            userPendingRewards[msg.sender] = 0;
        }

        // 累计质押余额并更新全局总质押
        userStake.amount += amount;
        rewardPool.totalStaked += amount;
        _updateCachedTotalWeight();

        emit Staked(msg.sender, amount, block.timestamp);

        // 尝试触发 SYI 批量处理（含资金中继触发 + 达阈值则 swap）
        _processAccumulatedSYI();
    }

    /**
     * @notice 解押部分/全部 LP；如存在应计奖励则先发放
     * @dev 流程：
     *   1) updateReward(msg.sender)：推进到当前并同步应计
     *   2) 检查最小质押时长（主网 24h）
     *   3) 计算并发放 USDT 奖励（若 > 0）；从 pendingRewards 扣减，分发计入 distributedRewards
     *   4) 减少用户与全局质押；若用户清零则从 stakers 列表移除
     *   5) 返还 LP
     *   6) emit 事件
     *   7) 尝试处理累计 SYI
     * @param amount 解押的 LP 数量（必须 <= 当前质押）
     */
    function unstake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        StakeInfo storage userStake = stakes[msg.sender];

        if (userStake.amount == 0) revert NoStakeFound();
        if (amount == 0 || amount > userStake.amount) revert InvalidAmount();
        if (block.timestamp < userStake.stakeTime + getMinStakeDuration()) {
            revert InsufficientStakeTime();
        }

        // 先处理奖励发放
        uint256 reward = _calculatePendingReward(msg.sender);
        if (reward > 0) {
            userPendingRewards[msg.sender] = 0;
            userRewardPerTokenPaid[msg.sender] = _rewardPerToken();

            userStake.accumulatedReward += reward;            // 仅统计展示
            userStake.lastRewardTime = block.timestamp;
            rewardPool.distributedRewards += reward;          // 已分发累加
            rewardPool.pendingRewards = rewardPool.pendingRewards > reward
                ? rewardPool.pendingRewards - reward
                : 0; // 防御性：不让 underflow 发生（极端并发下）

            if (!IERC20(usdt).transfer(msg.sender, reward)) {
                revert TransferFailed();
            }
        }

        // 变更质押余额
        userStake.amount -= amount;
        rewardPool.totalStaked -= amount;

        // 若用户清仓则移出 stakers 列表
        if (userStake.amount == 0) {
            _removeStaker(msg.sender);
        }

        _updateCachedTotalWeight();

        // 返还 LP
        if (!IERC20(lpToken).transfer(msg.sender, amount)) {
            revert TransferFailed();
        }

        emit Unstaked(msg.sender, amount, reward);

        _processAccumulatedSYI();
    }

    /**
     * @notice 领取当前应计 USDT 奖励
     * @dev 小于 MIN_REWARD_AMOUNT 时直接返回（节省 gas）；
     *      发放后会重置用户的 pending，并推进其指标指针到当前。
     */
    function claimReward() external nonReentrant updateReward(msg.sender) {
        uint256 reward = _calculatePendingReward(msg.sender);
        if (reward < MIN_REWARD_AMOUNT) return;

        StakeInfo storage userStake = stakes[msg.sender];

        userPendingRewards[msg.sender] = 0;
        userRewardPerTokenPaid[msg.sender] = _rewardPerToken();

        userStake.accumulatedReward += reward;      // 统计项
        userStake.lastRewardTime = block.timestamp;

        rewardPool.distributedRewards += reward;    // 已分发累加
        rewardPool.pendingRewards = rewardPool.pendingRewards > reward
            ? rewardPool.pendingRewards - reward
            : 0;

        if (!IERC20(usdt).transfer(msg.sender, reward)) {
            revert TransferFailed();
        }

        emit RewardClaimed(msg.sender, reward);

        _processAccumulatedSYI();
    }

    // =========================================================================
    // 奖励注入（通常由 SYI 合约或 owner 调用）
    // =========================================================================

    /**
     * @notice 直接注入 USDT 奖励（立即按 7 天重算线性释放速率）
     * @dev 仅管理员；使用 transferFrom 从调用者处拉取 USDT
     * @param amount 注入 USDT 数量
     */
    function depositRewards(uint256 amount) external onlyAdmin updateReward(address(0)) {
        if (amount == 0) return;

        if (!IERC20(usdt).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        rewardPool.totalRewards += amount;
        rewardPool.pendingRewards += amount;

        uint256 distributionPeriod = 7 days;
        rewardPool.rewardPerSecond = rewardPool.pendingRewards / distributionPeriod;
        emit RewardsDeposited(amount, rewardPool.rewardPerSecond);
    }

    /**
     * @notice 注入 SYI（不立即兑换），累积到阈值后在用户操作时批量兑换为 USDT
     * @dev 仅管理员；使用 transferFrom 从调用者处拉取 SYI
     * @param syiAmount 注入 SYI 数量
     */
    function depositSYIRewards(uint256 syiAmount) external onlyAdmin {
        if (syiAmount == 0) return;

        if (!IERC20(syiContract).transferFrom(msg.sender, address(this), syiAmount)) {
            revert TransferFailed();
        }

        // 仅做累积，实际兑换在 _processAccumulatedSYI 中达阈值时触发
        accumulatedSYI += syiAmount;
        emit SYIRewardsAccumulated(syiAmount, accumulatedSYI);
    }

    // =========================================================================
    // 内部：奖励计算/推进/权重
    // =========================================================================

    /// @notice 计算“时间加权后的权重”：amount × (1 + duration/365d)
    function _calculateWeight(uint256 amount, uint256 duration) internal pure returns (uint256) {
        uint256 timeMultiplier = 1e18 + (duration * 1e18) / (365 days);
        return (amount * timeMultiplier) / 1e18;
    }

    /// @notice 推进全局指标：将 rewardPerTokenStored 按时间增量推进到当前
    function _updateRewardPool() internal {
        rewardPool.rewardPerTokenStored = _rewardPerToken();
        rewardPool.lastUpdateTime = block.timestamp;
    }

    /// @notice 计算“当前应有的 rewardPerToken 值”（只读，不修改状态）
    /// @dev 当 totalStaked=0 时保持不变；否则：
    ///      rewardPerToken += (deltaTime * rewardPerSecond * 1e18) / totalStaked
    function _rewardPerToken() internal view returns (uint256) {
        if (rewardPool.totalStaked == 0) {
            return rewardPool.rewardPerTokenStored;
        }

        uint256 timeDelta = block.timestamp - rewardPool.lastUpdateTime;
        uint256 additionalRewardPerToken = (timeDelta * rewardPool.rewardPerSecond * 1e18)
            / rewardPool.totalStaked;

        return rewardPool.rewardPerTokenStored + additionalRewardPerToken;
    }

    /// @notice 把“从上次同步到当前时刻”的新增收益计入用户 pending，并推进其指针
    function _updateUserReward(address account) internal {
        if (account == address(0)) return;

        StakeInfo storage userStake = stakes[account];
        if (userStake.amount == 0) return;

        uint256 currentRewardPerToken = _rewardPerToken();
        uint256 earnedRewards = _calculateEarnedRewards(account, currentRewardPerToken);

        userPendingRewards[account] += earnedRewards;           // 只增不减（发放时清零）
        userRewardPerTokenPaid[account] = currentRewardPerToken; // 推进用户指标指针
    }

    /// @notice 基于“rewardPerToken 增量 × 用户时间权重”计算新增收益
    function _calculateEarnedRewards(address account, uint256 currentRewardPerToken)
        internal
        view
        returns (uint256)
    {
        StakeInfo memory userStake = stakes[account];
        if (userStake.amount == 0) return 0;

        uint256 rewardPerTokenDelta = currentRewardPerToken - userRewardPerTokenPaid[account];

        uint256 stakeDuration = block.timestamp - userStake.stakeTime;
        uint256 timeMultiplier = 1e18 + (stakeDuration * 1e18) / (365 days);

        uint256 baseRewards = (userStake.amount * rewardPerTokenDelta) / 1e18;
        return (baseRewards * timeMultiplier) / 1e18;
    }

    /// @notice 返回“当前可领取”的奖励 = pending + 刚刚新计算的应计
    function _calculatePendingReward(address account) internal view returns (uint256) {
        StakeInfo memory userStake = stakes[account];
        if (userStake.amount == 0) return 0;

        uint256 currentRewardPerToken = _rewardPerToken();
        uint256 newlyEarned = _calculateEarnedRewards(account, currentRewardPerToken);

        return userPendingRewards[account] + newlyEarned;
    }

    /// @notice 计算当前总权重（遍历 stakers），同一秒内复用缓存以省 gas（主要用于 view 查询）
    function _calculateCurrentTotalWeight() internal view returns (uint256) {
        if (cachedWeightTimestamp == block.timestamp && cachedTotalWeight > 0) {
            return cachedTotalWeight;
        }

        uint256 currentTotalWeight = 0;
        for (uint256 i = 0; i < stakers.length; i++) {
            address staker = stakers[i];
            StakeInfo memory userStake = stakes[staker];

            if (userStake.amount > 0) {
                uint256 stakeDuration = block.timestamp - userStake.stakeTime;
                uint256 weight = _calculateWeight(userStake.amount, stakeDuration);
                currentTotalWeight += weight;
            }
        }

        return currentTotalWeight;
    }

    /// @notice 刷新权重缓存（在 stake/unstake 等会改变权重时调用）
    function _updateCachedTotalWeight() internal {
        cachedTotalWeight = _calculateCurrentTotalWeight();
        cachedWeightTimestamp = block.timestamp;
    }

    /// @notice 当用户清空质押后，从 stakers 列表 O(1) 移除（swap-pop）
    function _removeStaker(address account) internal {
        if (!isStaker[account]) return;

        for (uint256 i = 0; i < stakers.length; i++) {
            if (stakers[i] == account) {
                stakers[i] = stakers[stakers.length - 1];
                stakers.pop();
                isStaker[account] = false;
                break;
            }
        }
    }

    /// @notice 处理累计的 SYI：
    ///         1) 先尝试触发 SYI 的 FundRelay 分发（try/catch 忽略失败）
    ///         2) 若累计 SYI >= 10 ether（以 18 位计），则一次性兑换为 USDT 并进入 7 天释放池
    function _processAccumulatedSYI() internal {
        // 触发资金中继分发（若外部实现失败，不中断主流程）
        try ISYI(syiContract).triggerFundRelayDistribution() {} catch {}

        if (accumulatedSYI == 0 || accumulatedSYI < 10 ether) return; // 阈值控制，减少频繁 swap

        uint256 syiToSwap = accumulatedSYI;
        accumulatedSYI = 0; // 先行清零，防止重入/重复

        uint256 usdtAmount = _swapSYIForUSDT(syiToSwap);

        if (usdtAmount > 0) {
            rewardPool.totalRewards += usdtAmount;
            rewardPool.pendingRewards += usdtAmount;

            uint256 distributionPeriod = 7 days;
            rewardPool.rewardPerSecond = rewardPool.pendingRewards / distributionPeriod;

            emit SYISwappedToRewards(syiToSwap, usdtAmount, rewardPool.rewardPerSecond);
        }
    }

    /// @notice 通过 Router 将 SYI 兑换为 USDT
    /// @dev 使用 SupportingFeeOnTransferTokens 版本以兼容含税代币；最小接收量=0（接受任意滑点）
    /// @param syiAmount 待兑换的 SYI 数量
    /// @return usdtAmount 实际收到的 USDT（基于余额差）
    function _swapSYIForUSDT(uint256 syiAmount) internal returns (uint256 usdtAmount) {
        if (syiAmount == 0) return 0;

        IERC20(syiContract).approve(address(router), syiAmount);

        address[] memory path = new address[](2);
        path[0] = syiContract;
        path[1] = usdt;

        uint256 initialBalance = IERC20(usdt).balanceOf(address(this));

        // try/catch：避免因流动性不足/路由异常而回滚主流程
        try router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            syiAmount,
            0,                 // 接受任意 USDT 数量（由外部阈值与批量化来控制风险）
            path,
            address(this),
            block.timestamp + 300
        ) {
            uint256 finalBalance = IERC20(usdt).balanceOf(address(this));
            usdtAmount = finalBalance > initialBalance ? finalBalance - initialBalance : 0;
        } catch {
            // 兑换失败：返回 0，不影响主流程
            usdtAmount = 0;
        }
    }

    // =========================================================================
    // 只读视图：用户与池信息
    // =========================================================================

    /**
     * @notice 查询用户质押与奖励信息
     * @return stakedAmount 用户质押 LP 数量
     * @return stakeTime 首次质押时间（Unix 时间）
     * @return pendingReward 当前可领取奖励（含刚刚新应计）
     * @return accumulatedReward 历史累计已领取奖励（统计展示用）
     * @return weight 当前时刻的时间加权权重
     */
    function getUserStakeInfo(address account)
        external
        view
        returns (
            uint256 stakedAmount,
            uint256 stakeTime,
            uint256 pendingReward,
            uint256 accumulatedReward,
            uint256 weight
        )
    {
        StakeInfo memory userStake = stakes[account];
        stakedAmount = userStake.amount;
        stakeTime = userStake.stakeTime;
        pendingReward = _calculatePendingReward(account);
        accumulatedReward = userStake.accumulatedReward;

        if (userStake.amount > 0) {
            uint256 stakeDuration = block.timestamp - userStake.stakeTime;
            weight = _calculateWeight(userStake.amount, stakeDuration);
        }
    }

    /**
     * @notice 查询奖励池总体信息
     * @return totalRewards 历史累计注入 USDT
     * @return rewardPerSecond 当前线性释放速率（秒）
     * @return totalStaked 全网总质押 LP
     * @return totalWeight 当前计算得到的总权重（动态）
     * @return stakersCount 参与质押地址数
     * @return distributedRewards 累计已发放 USDT
     * @return pendingRewards 尚待释放 USDT
     */
    function getRewardPoolInfo()
        external
        view
        returns (
            uint256 totalRewards,
            uint256 rewardPerSecond,
            uint256 totalStaked,
            uint256 totalWeight,
            uint256 stakersCount,
            uint256 distributedRewards,
            uint256 pendingRewards
        )
    {
        totalRewards = rewardPool.totalRewards;
        rewardPerSecond = rewardPool.rewardPerSecond;
        totalStaked = rewardPool.totalStaked;
        totalWeight = _calculateCurrentTotalWeight();
        stakersCount = stakers.length;
        distributedRewards = rewardPool.distributedRewards;
        pendingRewards = rewardPool.pendingRewards;
    }

    /// @notice 返回当前 stakers 数量
    function getStakersCount() external view returns (uint256) {
        return stakers.length;
    }

    /// @notice 判断账户是否已达到可解押（最小质押时间）
    function canUnstake(address account) external view returns (bool) {
        StakeInfo memory userStake = stakes[account];
        if (userStake.amount == 0) return false;
        return block.timestamp >= userStake.stakeTime + getMinStakeDuration();
    }

    /**
     * @notice 查询解押资格与剩余时间
     * @return canWithdraw 是否可解押
     * @return stakedAmount 质押数量
     * @return timeRemaining 若不可解押，返回剩余秒数
     */
    function canWithdrawStake(address account)
        external
        view
        returns (bool canWithdraw, uint256 stakedAmount, uint256 timeRemaining)
    {
        StakeInfo memory userStake = stakes[account];
        stakedAmount = userStake.amount;

        if (stakedAmount == 0) {
            canWithdraw = false;
            timeRemaining = 0;
            return (canWithdraw, stakedAmount, timeRemaining);
        }

        uint256 minDuration = getMinStakeDuration();
        uint256 stakeEndTime = userStake.stakeTime + minDuration;

        if (block.timestamp >= stakeEndTime) {
            canWithdraw = true;
            timeRemaining = 0;
        } else {
            canWithdraw = false;
            timeRemaining = stakeEndTime - block.timestamp;
        }
    }

    /// @notice 对外暴露“最小质押时长”（由子合约覆盖的内部常量）
    function getMinStakeDurationExternal() external pure returns (uint256 duration) {
        return getMinStakeDuration();
    }

    // =========================================================================
    // 管理员函数
    // =========================================================================

    /// @notice 设置地址是否被排除参与质押（如系统/营销地址）
    function setExcluded(address account, bool excluded) external onlyAdmin {
        excludedFromStaking[account] = excluded;
        emit AddressExcluded(account, excluded);
    }

    /// @notice 紧急转出任意代币到 syiContract（风控/运维使用）
    function emergencyWithdraw(address token, uint256 amount) external onlyAdmin {
        IERC20(token).transfer(syiContract, amount);
    }
}
