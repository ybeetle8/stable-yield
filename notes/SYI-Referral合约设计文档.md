# SYI-Referral 合约设计文档

## 一、概述

### 1.1 目标

将 SYI-Staking 合约中的推荐系统逻辑抽离为独立合约,实现:
- **独立部署**: 推荐关系管理与质押逻辑分离
- **可复用性**: 未来其他合约可调用推荐系统功能
- **数据统一**: 所有合约共享同一套推荐关系数据
- **功能完整**: 保留原有推荐系统的所有功能和安全机制

### 1.2 设计原则

- **最小化改动**: 保持与现有 Staking 合约的兼容性
- **向后兼容**: 不破坏已部署合约的推荐关系
- **权限分离**: 区分数据读取、绑定、管理员操作
- **Gas 优化**: 减少跨合约调用开销

---

## 二、核心功能模块

### 2.1 推荐关系管理

#### 2.1.1 推荐人绑定 (Referral)

**功能**: 用户绑定上级推荐人,用于团队层级奖励计算

**原合约位置**: `StakingBase.sol:467-498`

**数据结构**:
```solidity
// 推荐关系映射
mapping(address => address) private _referrals;  // user => referrer

// 子节点列表
mapping(address => address[]) private _children;  // referrer => [users]

// 绑定状态
mapping(address => bool) private _hasLocked;  // 是否已绑定
```

**核心逻辑**:
```solidity
function lockReferral(address _referrer) external {
    // 1. 验证绑定条件
    require(!_hasLocked[msg.sender], "Already bound");
    require(_referrer != msg.sender, "Cannot refer self");

    // 2. 验证推荐人资格(可配置)
    _validateReferrer(_referrer);

    // 3. 建立绑定关系
    _referrals[msg.sender] = _referrer;
    _children[_referrer].push(msg.sender);
    _hasLocked[msg.sender] = true;

    emit BindReferral(msg.sender, _referrer, block.timestamp);
}
```

#### 2.1.2 朋友绑定 (Friend)

**功能**: 用户绑定朋友地址,朋友可获得固定 5% 奖励

**原合约位置**: `StakingBase.sol:504-514`

**数据结构**:
```solidity
// 朋友关系映射
mapping(address => address) private _friends;  // user => friend
```

**核心逻辑**:
```solidity
function lockFriend(address _friend) external {
    require(_friends[msg.sender] == address(0), "Already bound");
    require(_friend != address(0) && _friend != msg.sender, "Invalid friend");

    _friends[msg.sender] = _friend;
    emit BindFriend(msg.sender, _friend, block.timestamp);
}
```

---

### 2.2 推荐链查询

#### 2.2.1 获取推荐链

**功能**: 从用户向上遍历推荐链,最多 30 层

**原合约位置**: `StakingBase.sol:910-932`

```solidity
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

    // 返回实际长度的数组
    address[] memory trimmed = new address[](count);
    for (uint8 i = 0; i < count; i++) {
        trimmed[i] = result[i];
    }
    return trimmed;
}
```

#### 2.2.2 获取直推数量

**功能**: 查询用户的直接推荐人数

**原合约位置**: `StakingBase.sol:591-593`

```solidity
function getReferralCount(address _user) external view returns (uint256) {
    return _children[_user].length;
}

function getDirectReferrals(address _user) external view returns (address[] memory) {
    return _children[_user];
}
```

---

### 2.3 推荐人资格验证

#### 2.3.1 动态配置系统

**原合约位置**: `StakingBase.sol:136-147`, `1163-1190`

**核心概念**:
- **全局配置**: `requireReferrerStaked` (是否要求推荐人质押)
- **快照机制**: 绑定时记录配置,后续修改不影响已绑定用户
- **质押检查**: 通过外部合约(Staking)检查推荐人质押状态

**设计难点**: 新合约需要访问 Staking 合约的质押数据

**解决方案**:
```solidity
// 引用外部验证器接口
interface IReferralValidator {
    function validateReferrer(address referrer) external view returns (bool);
}

contract SYIReferral {
    // 验证器地址(可更新)
    address public validator;

    // 是否启用验证
    bool public requireReferrerValidation;

    // 用户绑定时的配置快照
    mapping(address => bool) private _userRequirementSnapshot;

    function _validateReferrer(address _referrer) internal view {
        if (_referrer == rootAddress) return;
        if (!requireReferrerValidation) return;

        // 调用外部验证器
        if (validator != address(0)) {
            require(
                IReferralValidator(validator).validateReferrer(_referrer),
                "Referrer validation failed"
            );
        }
    }
}
```

---

### 2.4 团队 KPI 追踪 (可选)

**注意**: 这部分逻辑与 Staking 合约强耦合,建议保留在 Staking 合约中。

**如果抽离,需要**:
1. Staking 合约在质押/解除质押时调用 Referral 合约更新 KPI
2. 增加跨合约调用开销

**推荐方案**:
- Referral 合约: 只管理推荐关系
- Staking 合约: 管理 teamTotalInvestValue 和层级计算

---

## 三、合约架构设计

### 3.1 目录结构

```
contracts/SYI-Referral/
├── abstract/
│   └── ReferralBase.sol          # 完整业务逻辑
├── interfaces/
│   ├── IReferral.sol              # 核心接口
│   └── IReferralValidator.sol     # 验证器接口
└── mainnet/
    └── Referral.sol               # 主网版本
```

### 3.2 接口设计 (IReferral.sol)

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

interface IReferral {
    // =========================================================================
    // EVENTS
    // =========================================================================

    event BindReferral(
        address indexed user,
        address indexed referrer,
        uint256 timestamp
    );

    event BindFriend(
        address indexed user,
        address indexed friend,
        uint256 timestamp
    );

    event RootAddressUpdated(
        address indexed oldRoot,
        address indexed newRoot
    );

    event ValidatorUpdated(
        address indexed oldValidator,
        address indexed newValidator
    );

    event ReferrerValidationToggled(bool enabled);

    // =========================================================================
    // ERRORS
    // =========================================================================

    error AlreadyBound();
    error CannotReferSelf();
    error InvalidReferrer();
    error InvalidAddress();

    // =========================================================================
    // CORE FUNCTIONS
    // =========================================================================

    /// @notice 绑定推荐人
    /// @param _referrer 推荐人地址 (address(0) 将绑定到 rootAddress)
    function lockReferral(address _referrer) external;

    /// @notice 绑定朋友
    /// @param _friend 朋友地址
    function lockFriend(address _friend) external;

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /// @notice 获取推荐人
    function getReferral(address _user) external view returns (address);

    /// @notice 获取朋友
    function getFriend(address _user) external view returns (address);

    /// @notice 检查是否已绑定推荐人
    function isBindReferral(address _user) external view returns (bool);

    /// @notice 获取推荐链
    /// @param _user 用户地址
    /// @param _maxDepth 最大深度 (建议 30)
    function getReferrals(
        address _user,
        uint8 _maxDepth
    ) external view returns (address[] memory);

    /// @notice 获取直推数量
    function getReferralCount(address _user) external view returns (uint256);

    /// @notice 获取直推列表
    function getDirectReferrals(address _user) external view returns (address[] memory);

    /// @notice 获取 rootAddress
    function getRootAddress() external view returns (address);

    /// @notice 获取用户绑定时的验证快照
    function getUserRequirementSnapshot(address _user) external view returns (bool);

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    /// @notice 设置 rootAddress (仅 owner)
    function setRootAddress(address _rootAddress) external;

    /// @notice 设置验证器地址 (仅 owner)
    function setValidator(address _validator) external;

    /// @notice 设置是否启用推荐人验证 (仅 owner)
    function setRequireReferrerValidation(bool _required) external;
}
```

### 3.3 验证器接口 (IReferralValidator.sol)

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * @title IReferralValidator
 * @notice 推荐人资格验证器接口
 * @dev 外部合约(如 Staking)实现此接口以提供验证逻辑
 */
interface IReferralValidator {
    /**
     * @notice 验证推荐人是否满足资格要求
     * @param referrer 推荐人地址
     * @return valid 是否合格
     * @dev 由 Referral 合约在 lockReferral() 时调用
     */
    function validateReferrer(address referrer) external view returns (bool valid);
}
```

---

## 四、数据迁移方案

### 4.1 情景分析

**情景 1: 全新部署**
- 直接部署新的 Referral 合约
- Staking 合约调用 Referral 合约

**情景 2: 已有 Staking 合约**
- 已有推荐关系数据在旧 Staking 合约中
- 需要迁移或双合约并存

### 4.2 推荐方案:双合约并存

**适用场景**: 已有用户推荐数据,不希望强制迁移

**架构**:
```
旧 Staking 合约 (已部署)
    ├─ 保留现有推荐数据
    └─ 继续服务已绑定用户

新 Referral 合约 (新部署)
    ├─ 管理新用户的推荐关系
    └─ 提供统一查询接口

适配器层 (可选)
    └─ 优先查询 Referral 合约,如无数据则查询旧 Staking
```

**实现示例**:
```solidity
contract ReferralAdapter {
    IReferral public newReferral;
    address public oldStaking;

    function getReferral(address user) external view returns (address) {
        address ref = newReferral.getReferral(user);
        if (ref != address(0)) return ref;

        // 回退到旧合约查询
        return IStaking(oldStaking).getReferral(user);
    }
}
```

### 4.3 强制迁移方案 (不推荐)

**缺点**: 需要读取旧合约所有数据,Gas 成本极高

**实现**:
```solidity
function migrateReferrals(
    address[] calldata users,
    address[] calldata referrers
) external onlyOwner {
    require(users.length == referrers.length, "Length mismatch");
    for (uint256 i = 0; i < users.length; i++) {
        _referrals[users[i]] = referrers[i];
        _children[referrers[i]].push(users[i]);
        _hasLocked[users[i]] = true;
    }
}
```

---

## 五、与 Staking 合约的集成

### 5.1 Staking 合约调用 Referral

**场景**: 质押前检查推荐关系

**修改前 (StakingBase.sol)**:
```solidity
function _mintStakeRecord(...) private {
    if (!isBindReferral(sender)) revert MustBindReferral();
    // ...
}
```

**修改后**:
```solidity
contract StakingBase {
    IReferral public referralContract;

    function _mintStakeRecord(...) private {
        if (!referralContract.isBindReferral(sender)) {
            revert MustBindReferral();
        }
        // ...
    }

    function setReferralContract(address _referral) external onlyOwner {
        referralContract = IReferral(_referral);
    }
}
```

### 5.2 Staking 合约实现验证器接口

**目的**: 为 Referral 合约提供质押状态验证

```solidity
contract StakingBase is IReferralValidator {
    function validateReferrer(address referrer)
        external
        view
        override
        returns (bool valid)
    {
        // 检查推荐人是否有足够质押
        return balanceOf(referrer) > 1 ether;
    }
}
```

---

## 六、常量和配置

### 6.1 核心常量

```solidity
// 最大推荐链深度
uint8 public constant MAX_REFERRAL_DEPTH = 30;

// 推荐奖励率 (5%)
uint256 public constant REFERRAL_REWARD_RATE = 5;

// 百分比基数
uint256 public constant PERCENTAGE_BASE = 100;
```

### 6.2 可配置参数

```solidity
// Root 地址 (默认推荐人)
address public rootAddress;

// 验证器合约地址
address public validator;

// 是否启用推荐人验证
bool public requireReferrerValidation;
```

---

## 七、安全考虑

### 7.1 绑定保护

- **一次性绑定**: 用户只能绑定一次推荐人,防止更换上级
- **循环检测**: 虽然设计上不会出现循环,但遍历时限制最大深度
- **自引用保护**: 禁止用户推荐自己

### 7.2 权限管理

```solidity
// 只有 owner 可以修改
- setRootAddress()
- setValidator()
- setRequireReferrerValidation()

// 任何人可以调用
- lockReferral()
- lockFriend()
- getReferral()
- getReferrals()
```

### 7.3 数据一致性

- **快照机制**: 记录用户绑定时的配置,避免后续修改影响
- **事件记录**: 所有绑定操作发出事件,便于链下索引

---

## 八、Gas 优化

### 8.1 存储优化

```solidity
// ❌ 不推荐: 存储冗余信息
struct ReferralInfo {
    address referrer;
    address friend;
    uint256 timestamp;  // 浪费存储
    bool locked;        // 可通过 referrer != address(0) 判断
}

// ✅ 推荐: 最小化存储
mapping(address => address) private _referrals;
mapping(address => address) private _friends;
mapping(address => bool) private _hasLocked;  // 用于区分 "未绑定" vs "绑定到 address(0)"
```

### 8.2 查询优化

```solidity
// 提供批量查询接口,减少前端调用次数
function getUserReferralInfo(address user) external view returns (
    address referrer,
    address friend,
    bool hasLocked,
    uint256 referralCount
) {
    return (
        _referrals[user],
        _friends[user],
        _hasLocked[user],
        _children[user].length
    );
}
```

---

## 九、测试用例

### 9.1 基础绑定测试

- [ ] 用户成功绑定推荐人
- [ ] 禁止重复绑定
- [ ] 禁止自己推荐自己
- [ ] 推荐链正确更新

### 9.2 验证器测试

- [ ] 启用验证后,未质押推荐人被拒绝
- [ ] 禁用验证后,任何推荐人都可绑定
- [ ] rootAddress 永远可作为推荐人
- [ ] 配置快照机制正确工作

### 9.3 查询测试

- [ ] 正确返回推荐链 (多层)
- [ ] 推荐链深度限制 (30 层)
- [ ] 直推列表正确
- [ ] 未绑定用户返回 address(0)

### 9.4 与 Staking 集成测试

- [ ] Staking 合约能正确读取推荐关系
- [ ] 质押前必须绑定推荐人
- [ ] 团队奖励计算正确

---

## 十、部署流程

### 10.1 部署顺序

```bash
1. 部署 Referral 合约
   - 初始化 rootAddress
   - 初始化 requireReferrerValidation = false (宽松模式)

2. 部署 Staking 合约
   - 设置 referralContract 地址

3. 配置 Referral 合约
   - setValidator(stakingAddress)  # 设置验证器为 Staking 合约
   - setRequireReferrerValidation(true)  # 启用验证

4. 测试绑定流程
   - 用户 A 绑定推荐人
   - 用户 A 质押
   - 验证推荐关系正确
```

### 10.2 部署脚本示例

```javascript
// scripts/deployReferral.js
const rootAddress = "0x...";  // 配置 root 地址

const Referral = await ethers.getContractFactory("Referral");
const referral = await Referral.deploy(rootAddress);
await referral.deployed();

console.log("Referral deployed to:", referral.address);

// 保存地址
const deployment = {
    referral: referral.address,
    rootAddress: rootAddress
};
fs.writeFileSync('referral-deployment.json', JSON.stringify(deployment, null, 2));
```

---

## 十一、后续扩展

### 11.1 多合约支持

未来其他合约(如流动性挖矿、NFT 等)也可以使用同一套推荐系统:

```solidity
contract LiquidityMining {
    IReferral public referralContract;

    function distributeRewards(address user) internal {
        // 读取推荐关系
        address referrer = referralContract.getReferral(user);
        if (referrer != address(0)) {
            // 分配奖励给推荐人
        }
    }
}
```

### 11.2 链下索引

通过事件构建推荐关系图谱:

```javascript
// 监听 BindReferral 事件
contract.on("BindReferral", (user, referrer, timestamp) => {
    // 更新数据库
    db.referrals.insert({
        user: user,
        referrer: referrer,
        bindTime: timestamp
    });
});
```

### 11.3 推荐奖励代币化 (可选)

未来可以发行 "推荐权益 NFT",推荐关系可转让/交易。

---

## 十二、总结

### 12.1 核心优势

✅ **独立部署**: 推荐系统与业务逻辑解耦
✅ **可复用性**: 多个合约共享推荐关系
✅ **向后兼容**: 不影响现有 Staking 合约
✅ **灵活配置**: 支持动态验证器
✅ **Gas 优化**: 最小化存储和跨合约调用

### 12.2 风险点

⚠️ **跨合约调用开销**: 每次查询推荐关系需要调用外部合约
⚠️ **数据迁移复杂**: 如已有推荐数据,需要设计迁移方案
⚠️ **验证器依赖**: 依赖 Staking 合约提供验证,增加耦合

### 12.3 建议

**如果是新项目**: 强烈推荐使用独立 Referral 合约
**如果已有用户**: 建议保留旧 Staking 中的推荐数据,新用户使用新 Referral 合约
**如果频繁查询**: 考虑在调用合约中缓存推荐关系,减少跨合约调用

---

## 附录 A: 完整数据结构

```solidity
contract ReferralBase {
    // =========================================================================
    // STATE VARIABLES
    // =========================================================================

    // 推荐关系
    mapping(address => address) private _referrals;      // user => referrer
    mapping(address => address[]) private _children;     // referrer => [users]
    mapping(address => bool) private _hasLocked;         // 是否已绑定

    // 朋友关系
    mapping(address => address) private _friends;        // user => friend

    // 配置
    address public rootAddress;                          // 默认推荐人
    address public validator;                            // 验证器合约
    bool public requireReferrerValidation;               // 是否启用验证

    // 快照
    mapping(address => bool) private _userRequirementSnapshot;  // 用户绑定时的配置

    // 常量
    uint8 public constant MAX_REFERRAL_DEPTH = 30;
    uint256 public constant REFERRAL_REWARD_RATE = 5;
    uint256 public constant PERCENTAGE_BASE = 100;
}
```

---

## 附录 B: 关键代码位置对照表

| 功能 | 原合约位置 | 新合约位置 |
|------|-----------|-----------|
| 推荐人绑定 | `StakingBase.sol:467-498` | `ReferralBase.sol:lockReferral()` |
| 朋友绑定 | `StakingBase.sol:504-514` | `ReferralBase.sol:lockFriend()` |
| 推荐链查询 | `StakingBase.sol:910-932` | `ReferralBase.sol:getReferrals()` |
| 验证推荐人 | `StakingBase.sol:1163-1190` | `ReferralBase.sol:_validateReferrer()` |
| 推荐数量 | `StakingBase.sol:591-593` | `ReferralBase.sol:getReferralCount()` |
| 配置快照 | `StakingBase.sol:136-147` | `ReferralBase.sol:_userRequirementSnapshot` |

---

**文档版本**: v1.0
**创建日期**: 2025-11-29
**作者**: Claude Code
**审核状态**: 待审核

下一步: 根据本文档开始实现 `contracts/SYI-Referral/` 合约代码
