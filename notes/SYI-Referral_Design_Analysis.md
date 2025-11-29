# SYI-Referral 合约设计与重构分析

## 1. 背景与目标

当前推荐人（Referral）逻辑深度耦合在 `SYI-Staking` 项目的 `StakingBase.sol` 抽象合约中。为了提高系统的模块化程度、复用性以及降低单一合约的复杂度，计划将推荐人逻辑拆分为独立的 `SYI-Referral` 合约。

该新合约将负责：
1.  **存储关系**：维护用户与其推荐人（Referrer）的绑定关系。
2.  **提供查询**：为 `Staking` 合约及未来其他合约提供推荐人查询、层级查询（Ancestors）和下级查询（Children）接口。
3.  **权限控制**：管理绑定规则（如是否允许修改、是否需要根节点等）。

## 2. 现状分析 (基于 SYI-Staking/abstract/StakingBase.sol)

通过代码分析，目前的推荐人系统包含以下核心组件：

### 2.1 核心数据结构
```solidity
// 位于 StakingBase.sol
mapping(address => address) private _referrals;         // 用户 -> 推荐人
mapping(address => address[]) private _children;        // 用户 -> 直推列表
mapping(address => bool) private _hasLocked;            // 记录用户是否已锁定推荐人
address private rootAddress;                            // 根节点地址
mapping(address => bool) private _userReferralRequirementSnapshot; // 绑定时的快照
bool public requireReferrerStaked;                      // 全局配置：是否要求推荐人质押
```

### 2.2 核心业务逻辑
1.  **绑定 (`lockReferral`)**:
    *   检查是否已绑定 (`_referrals[user] != 0`).
    *   检查自身不能作为推荐人。
    *   **外部依赖验证**: `_validateReferrer` 函数会调用 `balanceOf(_referrer)` 检查推荐人是否在 Staking 合约中有质押（如果 `requireReferrerStaked` 为 true）。
    *   记录快照 `_userReferralRequirementSnapshot`。
    *   更新 `_referrals` 和 `_children`。
    *   触发 `_syncExistingInvestmentToReferralChain` (同步旧业绩，这部分逻辑应留在 Staking，但需要 Referral 提供链条)。

2.  **查询 (`getReferrals`, `getReferral`, etc.)**:
    *   提供获取上级链条（用于分红计算）。
    *   提供获取下级数量（用于统计）。

3.  **依赖耦合**:
    *   **Staking -> Referral**: 分红 (`_distributeTeamReward`) 和业绩统计 (`_updateTeamInvestmentValues`) 严重依赖 `getReferrals` 返回的链条。
    *   **Referral -> Staking**: 绑定时 (`_validateReferrer`) 依赖 Staking 合约的 `balanceOf` 来验证推荐人资格。

## 3. 新合约架构设计 (SYI-Referral)

我们将创建一个独立的 `SYIReferral` 合约。

### 3.1 数据结构迁移
所有关系型数据将迁移至新合约：
*   `_referrals`
*   `_children`
*   `rootAddress`
*   `_hasLocked`

*注意：`_userReferralRequirementSnapshot` 和 `requireReferrerStaked` 涉及具体的业务资格验证。建议将"验证逻辑"保留为接口调用，或者由 Referral 合约持有“资格验证器(Verifier)”的地址。鉴于需求是完全剥离，我们将把 Staking 合约视为“资格验证器”。*

### 3.2 接口设计 (ISYIReferral)

```solidity
interface ISYIReferral {
    event BindReferral(address indexed user, address indexed referrer, uint256 timestamp);
    
    // 核心写操作
    function bindReferral(address user, address referrer) external;
    
    // 核心读操作
    function getReferrer(address user) external view returns (address);
    function getReferralChain(address user, uint256 depth) external view returns (address[] memory);
    function getChildren(address user) external view returns (address[] memory);
    function getChildrenCount(address user) external view returns (uint256);
    function hasReferrer(address user) external view returns (bool);
    function rootAddress() external view returns (address);
}
```

### 3.3 交互流程与改造点

#### A. 绑定流程 (Bind Logic)
目前的绑定逻辑中包含 `balanceOf` 检查。拆分后，`SYIReferral` 需要知道去哪里检查这个条件。

**方案**: `SYIReferral` 引入 `IReferralValidator` 接口或直接引用 `Staking` 合约地址。

**新合约 `SYIReferral.sol` 伪代码结构**:
```solidity
contract SYIReferral is Ownable {
    mapping(address => address) public referrers;
    mapping(address => address[]) public children;
    address public rootAddress;
    
    // 外部依赖：用于验证推荐人是否合规（即原 _validateReferrer 逻辑）
    address public stakingContract; 
    bool public requireReferrerStaked = true;

    function bindReferral(address referrer) external {
        address user = msg.sender;
        // 1. 基础检查 (非自身，未绑定等)
        // ...
        
        // 2. 资格验证 (回调 Staking 合约查询余额)
        if (requireReferrerStaked && referrer != rootAddress) {
             require(IStaking(stakingContract).balanceOf(referrer) > 1 ether, "Invalid Referrer");
        }

        // 3. 存储关系
        referrers[user] = referrer;
        children[referrer].push(user);
        emit BindReferral(user, referrer, block.timestamp);
    }
}
```

#### B. 业绩同步与分红 (Staking Logic Update)
原 `StakingBase.sol` 将删除上述映射，改为持有 `SYIReferral` 的实例。

**修改后的 `StakingBase.sol`**:
```solidity
// 引入接口
ISYIReferral public referralContract;

// 修改 getReferrals 辅助函数
function getReferrals(address _user, uint8 _maxDepth) public view returns (address[] memory) {
    return referralContract.getReferralChain(_user, _maxDepth);
}

// 修改 lockReferral
function lockReferral(address _referrer) external {
    // 转发请求到 Referral 合约，或者让用户直接去 Referral 合约绑定
    // 建议：用户直接与 Referral 合约交互，Staking 合约只负责读取
    revert("Please interact with SYIReferral contract directly");
}

// 修改 _mintStakeRecord 中的检查
function _mintStakeRecord(...) private {
    if (referralContract.getReferrer(sender) == address(0)) revert MustBindReferral();
    // ...
}
```

## 4. 详细实施计划

### 步骤 1: 创建 ISYIReferral 接口
定义清晰的交互标准，确保未来其他合约（如 IDO、NFT 市场等）也能方便接入。

### 步骤 2: 实现 SYIReferral 合约
*   **Root 节点管理**: 构造函数初始化 Root。
*   **绑定逻辑**: 复刻 `lockReferral` 的安全检查。
*   **验证逻辑**: 增加 `setStakingContract` 用于设置验证源。

### 步骤 3: 改造 SYI-Staking
*   移除 `_referrals`, `_children`, `_hasLocked` 等状态变量。
*   移除 `lockReferral` 实现。
*   在 `StakingBase` 中注入 `SYIReferral` 地址。
*   将所有 `_referrals[user]` 读取操作替换为 `referralContract.getReferrer(user)`。
*   将所有 `getReferrals(...)` 调用替换为跨合约调用。

## 5. 风险与注意事项

1.  **Gas 消耗**: 跨合约调用（External Calls）比读取内部 Storage 会消耗略多的 Gas，特别是在 `_distributeTeamReward` 这种循环读取层级的功能中。
    *   *优化建议*: `SYIReferral` 提供 `getReferralChain` 一次性返回数组，避免在循环中多次调用 `getReferrer`。
2.  **循环依赖**:
    *   `Referral` 依赖 `Staking` 查余额 (Validate)。
    *   `Staking` 依赖 `Referral` 查关系 (Reward)。
    *   *部署顺序*: 部署 Referral (设 Staking 为 0) -> 部署 Staking (传入 Referral) -> 设置 Referral 的 Staking 地址。
3.  **数据迁移**: 如果是在现有主网上升级，旧数据的 `_referrals` 必须迁移到新合约，这通常非常昂贵且复杂。如果是新部署，则无此问题。

此文档主要基于现有 `contracts/SYI-Staking` 代码逻辑进行分析，确保新合约能够无缝承接原有业务逻辑。
