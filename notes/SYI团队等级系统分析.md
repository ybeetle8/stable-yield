# SYI 团队等级系统分析

## 一、等级体系概览

### 1.1 等级定义（V1-V7）

| 等级 | 团队KPI门槛 | 奖励比例 | 说明 |
|------|------------|---------|------|
| V1 | 10,000 SYI | 5% | 基础等级 |
| V2 | 50,000 SYI | 10% | 初级团队长 |
| V3 | 200,000 SYI | 15% | 中级团队长 |
| V4 | 500,000 SYI | 20% | 高级团队长 |
| V5 | 1,000,000 SYI | 25% | 区域总监 |
| V6 | 2,500,000 SYI | 30% | 高级总监 |
| V7 | 5,000,000 SYI | 35% | 战略合伙人 |

### 1.2 Preacher（传道者）资格

- **门槛**：个人质押金额 >= 200 SYI
- **作用**：只有满足 Preacher 条件才能获得团队奖励
- **个人质押和团队KPI的区别**：
  - 个人质押 = 自己质押的总金额（用于判断是否有资格领取奖励）
  - 团队KPI = 所有下级的质押总和（用于判断等级）

---

## 二、等级计算算法

### 2.1 核心算法流程

```
┌─────────────────────────────────────────┐
│  输入：用户地址 (user)                  │
└────────────┬────────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ 1. 检查 Preacher   │
    │ 资格判断           │
    └────────┬───────────┘
             │
             ├─── 否 ──→ 返回等级 0（无资格）
             │
             ▼ 是
    ┌────────────────────┐
    │ 2. 获取团队 KPI    │
    │ teamKPI = teamTotalInvestValue[user] │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ 3. 等级匹配        │
    │ 从 V7 → V1 依次检查│
    └────────┬───────────┘
             │
             ▼
    ┌──────────────────────────────┐
    │ teamKPI >= V7门槛(5,000,000)? │
    │      是 → 返回等级 7          │
    │      否 → 继续检查 V6         │
    └──────────┬───────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ teamKPI >= V6门槛(2,500,000)? │
    │      是 → 返回等级 6          │
    │      否 → 继续检查 V5         │
    └──────────────────────────────┘
               ...
               (依次类推到 V1)
               ...
               │
               ▼
    ┌──────────────────────────────┐
    │ 所有门槛都未达到？            │
    │      是 → 返回等级 0          │
    └──────────────────────────────┘
```

### 2.2 算法代码实现

```solidity
// contracts/SYI-Staking/abstract/StakingBase.sol: 1255-1273

function _getUserTier(address user) private view returns (uint8 tier) {
    // 步骤1: 检查是否为 rootAddress 或不满足 Preacher 资格
    if (user == rootAddress || !isPreacher(user)) {
        return 0;  // 不满足基本资格，返回 0
    }

    // 步骤2: 获取团队 KPI
    uint256 teamKPI = getTeamKpi(user);

    // 步骤3: 获取所有等级门槛（从高到低排列）
    IStaking.TeamTier[7] memory tiers = _getTeamTiers();
    // tiers[0] = V7: 5,000,000 SYI, 35%
    // tiers[1] = V6: 2,500,000 SYI, 30%
    // tiers[2] = V5: 1,000,000 SYI, 25%
    // tiers[3] = V4: 500,000 SYI, 20%
    // tiers[4] = V3: 200,000 SYI, 15%
    // tiers[5] = V2: 50,000 SYI, 10%
    // tiers[6] = V1: 10,000 SYI, 5%

    // 步骤4: 从最高等级开始匹配
    for (uint256 i = 0; i < tiers.length; ) {
        if (teamKPI >= tiers[i].threshold) {
            return uint8(7 - i);  // 匹配成功，返回等级
        }
        unchecked {
            ++i;
        }
    }

    // 步骤5: 所有门槛都未达到，返回 0
    return 0;
}
```

---

## 三、团队 KPI 更新机制

### 3.1 KPI 累积流程

```
用户质押事件发生
       │
       ▼
┌──────────────────┐
│ 1. 质押记录创建  │
│ _mintStakeRecord │
└─────┬────────────┘
      │
      ▼
┌────────────────────────────────┐
│ 2. 更新团队投资金额             │
│ _updateTeamInvestmentValues     │
│ (sender, amount, isIncrease=true)│
└─────┬──────────────────────────┘
      │
      ▼
┌──────────────────────────────────┐
│ 3. 获取推荐链                     │
│ getReferrals(user, maxDepth=30)  │
│ 返回：[推荐人1, 推荐人2, ...]    │
└─────┬────────────────────────────┘
      │
      ▼
┌──────────────────────────────────┐
│ 4. 遍历推荐链，逐级更新 KPI      │
│ for each referrer in chain:      │
│   teamTotalInvestValue[referrer] │
│     += amount                    │
└──────────────────────────────────┘
```

**示例**：

```
假设推荐关系：用户A ← 用户B ← 用户C ← 用户D
                  (根)   (直推)  (二级)  (三级)

用户D 质押 1000 SYI 时：
1. 用户C 的 teamKPI += 1000
2. 用户B 的 teamKPI += 1000
3. 用户A 的 teamKPI += 1000

假设用户D 解除质押 600 SYI 时：
1. 用户C 的 teamKPI -= 600
2. 用户B 的 teamKPI -= 600
3. 用户A 的 teamKPI -= 600
```

### 3.2 KPI 更新代码实现

```solidity
// contracts/SYI-Staking/abstract/StakingBase.sol: 804-820

function _updateTeamInvestmentValues(
    address user,
    uint256 amount,
    bool isIncrease  // true = 质押增加，false = 解除质押减少
) internal {
    // 获取该用户的所有上级（最多30层）
    address[] memory referralChain = getReferrals(user, maxD);

    // 遍历推荐链，更新每个上级的团队 KPI
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
```

---

## 四、差额奖励算法

### 4.1 差额奖励原理

**核心思想**：只奖励等级差，避免重复分配。

```
示例场景：
推荐链：Root ← V1(Alice) ← V3(Bob) ← V0(Charlie)

Charlie 解除质押，产生 100 USDT 利息
团队奖励池 = 100 * 35% = 35 USDT

分配逻辑：
1. 扫描推荐链：[Alice(V1), Bob(V3), Root]
2. Bob 是第一个达标的，等级 V3 (15%)
   - 累计已分配 = 0%
   - Bob 获得差额 = 15% - 0% = 15%
   - Bob 实际奖励 = 100 * 15% = 15 USDT
   - 更新累计已分配 = 15%

3. Alice 等级 V1 (5%)
   - 累计已分配 = 15%
   - Alice 差额 = 5% - 15% = -10% (负数)
   - Alice 实际奖励 = 0 USDT（等级太低，无法获得奖励）

4. Root 获得剩余 = 35 - 15 = 20 USDT
```

### 4.2 差额奖励流程图

```
解除质押产生利息
       │
       ▼
┌────────────────────────┐
│ 利息 = 1000 USDT       │
│ 团队奖励池 = 1000 * 35% = 350 USDT │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────────────┐
│ 获取推荐链                      │
│ [直推, 二级, 三级, ...]         │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│ 初始化累计分配率 = 0%           │
│ 总分配金额 = 0 USDT             │
└────────┬───────────────────────┘
         │
         ▼
    ┌────────────────┐
    │ 遍历推荐链成员 │◄───────┐
    └────┬───────────┘        │
         │                    │
         ▼                    │
┌──────────────────────┐      │
│ 获取成员等级          │      │
│ tier = _getUserTier() │      │
└────────┬─────────────┘      │
         │                    │
         ▼                    │
┌──────────────────────┐      │
│ 成员是否为 Preacher?  │      │
└────────┬─────────────┘      │
         │                    │
         ├─── 否 ──→ 跳过该成员 │
         │                    │
         ▼ 是                 │
┌──────────────────────┐      │
│ 该等级是否已被分配?   │      │
└────────┬─────────────┘      │
         │                    │
         ├─── 是 ──→ 跳过该成员 │
         │                    │
         ▼ 否                 │
┌────────────────────────────┐ │
│ 计算差额奖励              │ │
│ 该等级奖励率 = getTierRewardRate(tier) │
│ 实际奖励率 = 该等级奖励率 - 累计分配率 │
└────────┬───────────────────┘ │
         │                    │
         ▼                    │
┌────────────────────────────┐ │
│ 实际奖励率 > 0?           │ │
└────────┬───────────────────┘ │
         │                    │
         ├─── 否 ──→ 跳过该成员 │
         │                    │
         ▼ 是                 │
┌────────────────────────────┐ │
│ 计算奖励金额              │ │
│ reward = 利息 * 实际奖励率│ │
│ 转账 USDT 给该成员        │ │
└────────┬───────────────────┘ │
         │                    │
         ▼                    │
┌────────────────────────────┐ │
│ 更新状态                  │ │
│ 累计分配率 = 该等级奖励率  │ │
│ 总分配金额 += reward      │ │
│ 标记该等级已分配          │ │
└────────┬───────────────────┘ │
         │                    │
         └────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 推荐链遍历完成             │
│ 剩余金额 = 350 - 总分配金额│
│ 转账剩余金额给 rootAddress │
└────────────────────────────┘
```

### 4.3 差额奖励代码实现

```solidity
// contracts/SYI-Staking/abstract/StakingBase.sol: 1080-1165

function _distributeHybridRewards(
    address[] memory referralChain,
    uint8[] memory memberTiers,
    uint256 _interset  // 利息金额
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

    // 初始化记录数组
    for (uint8 j = 0; j < 7; j++) {
        tierRecipients[j] = address(0);
        tierAmounts[j] = 0;
    }

    bool[8] memory tierAllocated;  // 记录每个等级是否已分配
    uint256 cumulativeAllocatedRate = 0;  // 累计已分配的奖励比例

    // 遍历推荐链
    for (uint256 i = 0; i < referralChain.length; ) {
        uint8 currentTier = memberTiers[i];

        // 检查：等级 > 0 && 该等级未分配 && 是 Preacher
        if (
            currentTier > 0 &&
            !tierAllocated[currentTier] &&
            isPreacher(referralChain[i])
        ) {
            // 获取该等级的完整奖励率 (5%, 10%, 15%, ...)
            uint256 tierRewardRate = _getTierRewardRate(currentTier);

            // 计算差额（该等级奖励率 - 累计已分配率）
            uint256 actualRewardRate;
            if (tierRewardRate > cumulativeAllocatedRate) {
                actualRewardRate = tierRewardRate - cumulativeAllocatedRate;
            } else {
                actualRewardRate = 0;  // 等级太低，无奖励
            }

            // 如果差额 > 0，则发放奖励
            if (actualRewardRate > 0) {
                uint256 memberReward = (_interset * actualRewardRate) / PERCENTAGE_BASE;

                if (memberReward > 0) {
                    // 转账 USDT 给成员
                    IERC20(USDT).transfer(referralChain[i], memberReward);
                    totalDistributed += memberReward;

                    // 记录分配信息
                    tierRecipients[currentTier - 1] = referralChain[i];
                    tierAmounts[currentTier - 1] = memberReward;
                    activeTiers = activeTiers | uint8(1 << (currentTier - 1));

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

            // 标记该等级已分配，更新累计分配率
            tierAllocated[currentTier] = true;
            cumulativeAllocatedRate = tierRewardRate;
        } else if (
            currentTier > 0 &&
            !tierAllocated[currentTier] &&
            !isPreacher(referralChain[i])
        ) {
            // 等级达标但不是 Preacher，记录失败原因
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
```

---

## 五、等级升降机制

### 5.1 等级升级触发条件

```
等级升级条件：
1. 个人质押 >= 200 SYI (Preacher 资格)
2. 团队 KPI 达到目标等级门槛
3. 实时计算，无需手动申请

升级示例：
用户 Alice:
- 个人质押：300 SYI ✓ (满足 Preacher)
- 团队 KPI：180,000 SYI

下级质押 20,000 SYI 后：
- 团队 KPI：200,000 SYI → 达到 V3 门槛
- 自动升级到 V3 (15% 奖励率)
```

### 5.2 等级降级触发条件

```
等级降级条件：
1. 团队 KPI 下降（下级解除质押）
2. 个人质押低于 200 SYI (失去 Preacher 资格)

降级示例1（团队 KPI 下降）：
用户 Bob:
- 个人质押：500 SYI ✓
- 团队 KPI：520,000 SYI → V4 等级

下级解除质押 50,000 SYI 后：
- 团队 KPI：470,000 SYI → 低于 V4 门槛
- 自动降级到 V3 (15% 奖励率)

降级示例2（失去 Preacher 资格）：
用户 Charlie:
- 个人质押：250 SYI → V3 等级
- 团队 KPI：300,000 SYI

解除部分质押后：
- 个人质押：150 SYI ✗ (低于 200 SYI)
- 等级降为 0，无法获得团队奖励
```

### 5.3 等级变化时序图

```
时间轴：
t0: 初始状态
│
├─ 用户 Alice: 个人质押 100 SYI, 团队 KPI 0 → 等级 0
│
│
t1: Alice 质押 150 SYI (累计 250 SYI)
│
├─ 用户 Alice: 个人质押 250 SYI ✓, 团队 KPI 0 → 等级 0
│                (有 Preacher 资格，但团队 KPI 不足)
│
│
t2: Bob 绑定 Alice 为推荐人，质押 15,000 SYI
│
├─ 用户 Alice: 个人质押 250 SYI ✓, 团队 KPI 15,000 → 等级 V1 (5%)
│
│
t3: Charlie 绑定 Bob 为推荐人，质押 40,000 SYI
│
├─ 用户 Alice: 个人质押 250 SYI ✓, 团队 KPI 55,000 → 等级 V2 (10%)
│  用户 Bob:   个人质押 15,000 SYI ✓, 团队 KPI 40,000 → 等级 V1 (5%)
│
│
t4: David 绑定 Charlie 为推荐人，质押 150,000 SYI
│
├─ 用户 Alice: 个人质押 250 SYI ✓, 团队 KPI 205,000 → 等级 V3 (15%)
│  用户 Bob:   个人质押 15,000 SYI ✓, 团队 KPI 190,000 → 等级 V2 (10%)
│  用户 Charlie: 个人质押 40,000 SYI ✓, 团队 KPI 150,000 → 等级 V2 (10%)
│
│
t5: David 解除质押 100,000 SYI
│
└─ 用户 Alice: 个人质押 250 SYI ✓, 团队 KPI 105,000 → 等级 V2 (10%) ⬇️
   用户 Bob:   个人质押 15,000 SYI ✓, 团队 KPI 90,000 → 等级 V2 (10%)
   用户 Charlie: 个人质押 40,000 SYI ✓, 团队 KPI 50,000 → 等级 V2 (10%)
```

---

## 六、完整奖励分配案例

### 6.1 案例场景

```
推荐关系：
Root ← Alice(V2, 10%) ← Bob(V4, 20%) ← Charlie(V1, 5%) ← David(无质押)

假设：
- Alice: 个人质押 500 SYI ✓, 团队 KPI 80,000 SYI → V2 等级
- Bob:   个人质押 1000 SYI ✓, 团队 KPI 600,000 SYI → V4 等级
- Charlie: 个人质押 300 SYI ✓, 团队 KPI 20,000 SYI → V1 等级
- David: 个人质押 0 SYI ✗ → 无等级

David 解除质押 50,000 SYI，产生利息 10,000 USDT
```

### 6.2 奖励计算过程

```
┌─────────────────────────────────────────────────────┐
│ 第一步：计算奖励池                                   │
├─────────────────────────────────────────────────────┤
│ 利息金额：10,000 USDT                               │
│ 直推奖励 (5%)：10,000 * 5% = 500 USDT → Charlie 的 Friend │
│ 团队奖励池 (35%)：10,000 * 35% = 3,500 USDT        │
│ 用户实际获得：10,000 - 500 - 3,500 = 6,000 USDT    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 第二步：差额奖励分配（遍历推荐链）                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 成员1: Charlie (V1, 5%)                            │
│ ├─ 是否 Preacher? 是 ✓ (300 >= 200)               │
│ ├─ V1 等级完整奖励率：5%                           │
│ ├─ 累计已分配率：0%                                │
│ ├─ 实际奖励率：5% - 0% = 5%                        │
│ ├─ 奖励金额：10,000 * 5% = 500 USDT → Charlie      │
│ └─ 更新累计已分配率：5%                            │
│                                                     │
│ 成员2: Bob (V4, 20%)                               │
│ ├─ 是否 Preacher? 是 ✓ (1000 >= 200)              │
│ ├─ V4 等级完整奖励率：20%                          │
│ ├─ 累计已分配率：5%                                │
│ ├─ 实际奖励率：20% - 5% = 15%                      │
│ ├─ 奖励金额：10,000 * 15% = 1,500 USDT → Bob      │
│ └─ 更新累计已分配率：20%                           │
│                                                     │
│ 成员3: Alice (V2, 10%)                             │
│ ├─ 是否 Preacher? 是 ✓ (500 >= 200)               │
│ ├─ V2 等级完整奖励率：10%                          │
│ ├─ 累计已分配率：20%                               │
│ ├─ 实际奖励率：10% - 20% = -10% (负数)            │
│ ├─ 奖励金额：0 USDT (等级低于前面的成员)           │
│ └─ 累计已分配率保持：20%                           │
│                                                     │
│ 成员4: Root                                        │
│ └─ 接收剩余奖励：3,500 - 500 - 1,500 = 1,500 USDT │
│                                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 第三步：最终分配汇总                                │
├─────────────────────────────────────────────────────┤
│ David (解除质押者)：6,000 USDT                      │
│ Charlie 的 Friend：500 USDT (直推奖励)             │
│ Charlie：500 USDT (团队奖励 V1)                     │
│ Bob：1,500 USDT (团队奖励 V4-V1 差额)               │
│ Alice：0 USDT (等级太低)                            │
│ Root：1,500 USDT (剩余奖励)                         │
├─────────────────────────────────────────────────────┤
│ 合计：10,000 USDT ✓                                 │
└─────────────────────────────────────────────────────┘
```

---

## 七、关键要点总结

### 7.1 等级升级关键点

1. **实时计算**：等级不是固定的，每次查询时动态计算
2. **双重条件**：必须同时满足"个人质押"和"团队KPI"两个条件
3. **自动升降**：无需手动申请，KPI变化后自动生效
4. **推荐链深度**：最多追溯 30 层推荐关系

### 7.2 团队 KPI 关键点

1. **只累加下级质押**：只有直接或间接推荐的下级质押会增加自己的 KPI
2. **实时更新**：每次质押/解除质押都会更新整条推荐链的 KPI
3. **双向同步**：质押增加 KPI，解除质押减少 KPI
4. **后绑定同步**：如果用户先质押后绑定推荐人，会补同步已有质押到推荐链

### 7.3 奖励分配关键点

1. **差额制度**：只奖励等级差，避免重复分配
2. **Preacher 门槛**：必须满足个人质押 >= 200 SYI 才能领取团队奖励
3. **单次分配**：每个等级在同一条推荐链中只分配一次
4. **剩余给 Root**：未分配完的奖励转给 rootAddress

### 7.4 常见误区

❌ **错误理解1**：只要团队 KPI 达标就能获得奖励
✅ **正确理解**：必须同时满足"个人质押 >= 200"和"团队 KPI 达标"

❌ **错误理解2**：等级高的人会拿走所有团队奖励
✅ **正确理解**：差额制度保证每个等级只拿自己多出来的部分

❌ **错误理解3**：KPI 是自己的质押金额
✅ **正确理解**：KPI 是所有下级的质押总和，不包括自己

❌ **错误理解4**：等级升级需要申请
✅ **正确理解**：等级实时计算，KPI 达标后自动生效

---

## 八、代码位置索引

| 功能 | 文件 | 行号 |
|------|------|------|
| 等级门槛配置 | contracts/SYI-Staking/mainnet/Staking.sol | 61-87 |
| 等级计算算法 | contracts/SYI-Staking/abstract/StakingBase.sol | 1255-1273 |
| 团队 KPI 更新 | contracts/SYI-Staking/abstract/StakingBase.sol | 804-820 |
| 差额奖励分配 | contracts/SYI-Staking/abstract/StakingBase.sol | 1080-1165 |
| Preacher 判断 | contracts/SYI-Staking/abstract/StakingBase.sol | 669-671 |
| 推荐链获取 | contracts/SYI-Staking/abstract/StakingBase.sol | 613-635 |
| 质押记录创建 | contracts/SYI-Staking/abstract/StakingBase.sol | 863-895 |
| 解除质押流程 | contracts/SYI-Staking/abstract/StakingBase.sol | 200-264 |

---

## 附录：术语表

| 术语 | 英文 | 说明 |
|------|------|------|
| 团队等级 | Team Tier | V1-V7 七个等级 |
| 团队 KPI | Team KPI | 团队总投资金额 (teamTotalInvestValue) |
| 传道者 | Preacher | 个人质押 >= 200 SYI 的用户 |
| 推荐链 | Referral Chain | 用户往上追溯的所有推荐人 |
| 差额奖励 | Differential Reward | 只奖励等级差的奖励机制 |
| 直推奖励 | Friend Reward | 固定 5% 的直推奖励 |
| 累计分配率 | Cumulative Allocated Rate | 已分配的奖励比例总和 |
| 个人质押 | Personal Stake | 用户自己质押的金额 |
