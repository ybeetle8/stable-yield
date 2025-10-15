# SYI Recycle 机制详细分析

## 一、核心概念

Recycle 机制是 SYI 系统中最关键的资金循环机制，它解决了质押奖励分发与流动性池平衡的问题。

### 1.1 设计目标

```
问题: Staking 合约需要 SYI 代币来支付用户的质押奖励
      但 Staking 合约本身没有 SYI 代币储备

解决: 当用户解质押时，Staking 将 SYI 卖给流动性池换取 USDT 奖励
      卖出导致池子里 SYI 增加，通过 recycle() 回收这些 SYI
      形成闭环: Staking → 池子 → recycle → Staking
```

## 二、核心函数分析

### 2.1 recycle() 函数 (SYIBase.sol:453-553)

```solidity
function recycle(uint256 amount) external {
    // 1. 权限检查：只允许 Staking 合约调用
    require(msg.sender == address(staking), "Only staking contract");

    // 2. 获取流动性池中的 SYI 代币余额
    uint256 pairBalance = balanceOf(address(uniswapV2Pair));

    // 3. 计算最大可回收数量（安全上限：1/3）
    uint256 maxRecyclable = pairBalance / 3;

    // 4. 确定实际回收数量（取较小值）
    uint256 recycleAmount = amount >= maxRecyclable ? maxRecyclable : amount;

    // 5. 执行回收操作
    if (recycleAmount > 0) {
        // 直接更新余额：从 Pair 转移到 Staking
        _update(address(uniswapV2Pair), address(staking), recycleAmount);

        // 同步 Pair 合约的储备量
        uniswapV2Pair.sync();
    }
}
```

#### 关键点解析：

**a) 为什么要限制回收 1/3？**
```
池子余额: 400万 SYI
最大回收: 400万 / 3 = 133.3万 SYI

原因:
1. 保护流动性不被过度抽取
2. 避免价格剧烈波动
3. 防止恶意耗尽流动性攻击
```

**b) balance vs reserve 的区别**
```
balance (实际余额):
  - SYI 代币合约记录的："Pair 地址拥有多少 SYI"
  - 真实的、即时的代币数量
  - 每次转账立即更新

reserve (账面储备量):
  - Pair 合约自己记录的："我认为我有多少 SYI"
  - 只在 mint/burn/swap/sync 时更新
  - 用于 AMM 价格计算 (x * y = k)

为什么会不一致？
  示例: 直接转账 100万 SYI 给 Pair
    → balance = 1100万 (立即更新)
    → reserve = 1000万 (不知道收到钱)
    → 差额 100万 可被 recycle 或 skim 取走
```

**c) 为什么必须调用 sync()？**
```
_update() 修改了 Pair 的 balance
但 reserve 还是旧值

不调用 sync() 会导致:
  ❌ 价格计算错误
  ❌ 交易滑点异常
  ❌ K 值验证失败

sync() 的作用:
  reserve0 = balance0  ✅
  reserve1 = balance1  ✅
  强制同步账面和实际余额
```

### 2.2 unstake() 函数 (StakingBase.sol:200-264)

用户解质押的完整流程：

```solidity
function unstake(uint256 stakeIndex) external onlyEOA returns (uint256 totalReward) {
    // 步骤1: 计算奖励并销毁质押记录
    (uint256 calculatedReward, uint256 principalAmount) = _burn(stakeIndex);

    // 步骤2: 将 SYI 换成 USDT (关键步骤！)
    (uint256 usdtReceived, uint256 syiTokensUsed) = _swapSYIForReward(calculatedReward);

    // 步骤3: 计算利息收益
    uint256 interestEarned = usdtReceived > principalAmount
        ? usdtReceived - principalAmount
        : 0;

    // 步骤4: 分配推荐奖励和团队奖励
    uint256 friendReward = _distributeFriendReward(msg.sender, interestEarned);
    uint256 teamFee = _distributeTeamReward(referralChain, interestEarned);

    // 步骤5: 计算用户实际获得的 USDT
    uint256 userPayout = usdtReceived - friendReward - teamFee;

    // 步骤6: 1% 赎回费
    uint256 expectedRedemptionFeeUSDT = (userPayout * 100) / 10000;

    // 步骤7: 转账 USDT 给用户
    IERC20(USDT).transfer(msg.sender, userPayout);

    // 步骤8: 从流动性池回收使用的 SYI (关键步骤！)
    SYI.recycle(syiTokensUsed);

    return calculatedReward;
}
```

### 2.3 _swapSYIForReward() 函数 (StakingBase.sol:922-950)

这是 Recycle 机制的触发点：

```solidity
function _swapSYIForReward(uint256 calculatedReward)
    private
    returns (uint256 usdtReceived, uint256 syiTokensUsed)
{
    // 记录 Staking 合约的 SYI 和 USDT 余额
    uint256 syiBalanceBefore = SYI.balanceOf(address(this));
    uint256 usdtBalanceBefore = IERC20(USDT).balanceOf(address(this));

    // 交易路径: SYI → USDT
    address[] memory swapPath = new address[](2);
    swapPath[0] = address(SYI);
    swapPath[1] = address(USDT);

    // 计算最大 SYI 输入量
    uint256 maxSYIInput = _calculateMaxSYIInput(calculatedReward, syiBalanceBefore);

    // 关键: 使用 swapTokensForExactTokens
    // 输入: 不确定的 SYI
    // 输出: 精确的 calculatedReward USDT
    ROUTER.swapTokensForExactTokens(
        calculatedReward,          // 需要换取的精确 USDT 数量
        maxSYIInput,              // 最大愿意支付的 SYI 数量
        swapPath,
        address(this),
        block.timestamp
    );

    // 计算实际使用的 SYI 和收到的 USDT
    uint256 syiBalanceAfter = SYI.balanceOf(address(this));
    usdtReceived = IERC20(USDT).balanceOf(address(this)) - usdtBalanceBefore;
    syiTokensUsed = syiBalanceBefore - syiBalanceAfter;
}
```

#### 关键交易流程：

```
┌─────────────────────────────────────────────────────────────────┐
│ swapTokensForExactTokens 的影响                                 │
├─────────────────────────────────────────────────────────────────┤
│ 交易前:                                                         │
│   池子: 4,000,000 SYI + 40,000 USDT                            │
│   Staking 合约: 100,000 SYI + 0 USDT                           │
│                                                                 │
│ 交易 (假设需要 1,100 USDT):                                    │
│   Staking 发送: ~111,000 SYI                                   │
│   Staking 收到: 1,100 USDT                                     │
│                                                                 │
│ 交易后:                                                         │
│   池子: 4,111,000 SYI + 38,900 USDT  ← SYI 增加了！           │
│   Staking 合约: (100,000-111,000) SYI + 1,100 USDT            │
│                        ↑                                        │
│                    负数! 需要 recycle 补充                      │
└─────────────────────────────────────────────────────────────────┘
```

## 三、模拟场景：1000 USDT 质押 30 天

### 3.1 初始状态

```
流动性池:
  - SYI: 4,000,000 枚
  - USDT: 40,000 枚
  - 价格: 1 SYI = 0.01 USDT (100 SYI = 1 USDT)

用户操作:
  - 质押金额: 1,000 USDT
  - 质押期限: 30 天
  - 年化收益: 56.31%
  - 复利方式: 每日复利
```

### 3.2 质押时 (_swapAndAddLiquidity)

```
步骤1: 用户转入 1,000 USDT 到 Staking 合约
  Staking USDT: 1,000

步骤2: 将 500 USDT 换成 SYI
  交易: 500 USDT → ? SYI

  使用 AMM 公式: Δy = (x·Δx) / (y + Δx)
  x = 40,000 USDT (池子 USDT 储备)
  y = 4,000,000 SYI (池子 SYI 储备)
  Δx = 500 USDT (输入)

  Δy = (4,000,000 × 500) / (40,000 + 500)
     = 2,000,000,000 / 40,500
     = 49,382.7 SYI

  扣除 PancakeSwap 0.3% 手续费:
  实际收到 = 49,382.7 × 0.997 = 49,234.6 SYI

步骤3: 添加流动性 (500 USDT + 49,234.6 SYI)
  池子变为:
  - SYI: 4,000,000 + 49,234.6 = 4,049,234.6 SYI
  - USDT: 40,000 + 500 = 40,500 USDT

  新价格: 1 SYI = 40,500 / 4,049,234.6 = 0.010003 USDT

步骤4: Staking 合约记录
  用户质押本金: 1,000 USDT
  质押时间: 开始计时
```

### 3.3 30 天后本息计算

```
质押本金: 1,000 USDT
质押天数: 30 天
日利率: 1.5%^(1/30) - 1 = 1.0150004281^(1/30) - 1 ≈ 0.05% / 天

复利公式: FV = PV × (1 + r)^n
  PV = 1,000 USDT (本金)
  r = 0.015000428130702600 (每日利率，来自合约配置)
  n = 30 (天数)

  FV = 1,000 × (1.015000428130702600)^30
     = 1,000 × 1.5631
     = 1,563.1 USDT

总计算奖励 (calculatedReward): 1,563.1 USDT
其中:
  - 本金: 1,000 USDT
  - 利息: 563.1 USDT
```

### 3.4 解质押时的详细流程

#### 阶段1: 计算和销毁质押记录

```
_burn(stakeIndex) 返回:
  - principalAmount = 1,000 USDT
  - calculatedReward = 1,563.1 USDT (本金 + 利息的 USDT 价值)
```

#### 阶段2: 将 SYI 换成 USDT (_swapSYIForReward)

```
需要兑换: 1,563.1 USDT

步骤1: 计算需要多少 SYI

  当前池子状态 (假设30天内有其他交易，池子略有变化):
  - SYI: 4,100,000 枚
  - USDT: 41,000 枚
  - 价格: 1 SYI ≈ 0.01 USDT

  反向 AMM 公式: Δx = (y·Δy) / (x - Δy)
  x = 41,000 USDT (池子 USDT 储备)
  y = 4,100,000 SYI (池子 SYI 储备)
  Δy = 1,563.1 USDT (需要的 USDT)

  Δx = (4,100,000 × 1,563.1) / (41,000 - 1,563.1)
     = 6,408,710,000 / 39,436.9
     = 162,492.8 SYI

  加上 0.3% 手续费:
  实际需要 = 162,492.8 / 0.997 = 162,981.0 SYI

步骤2: Staking 合约执行交易

  交易前:
    Staking 合约 SYI 余额: 假设有 200,000 SYI (来自之前的回收)
    池子: 4,100,000 SYI + 41,000 USDT

  swapTokensForExactTokens(
    1,563.1 USDT,      // 需要的精确 USDT
    200,000 SYI,       // 最大愿意支付的 SYI
    [SYI, USDT],
    Staking,
    deadline
  )

  交易后:
    Staking 合约:
      - SYI: 200,000 - 162,981.0 = 37,019.0 SYI
      - USDT: 1,563.1 USDT

    池子:
      - SYI: 4,100,000 + 162,981.0 = 4,262,981.0 SYI ← 增加了！
      - USDT: 41,000 - 1,563.1 = 39,436.9 USDT

  返回值:
    usdtReceived = 1,563.1 USDT
    syiTokensUsed = 162,981.0 SYI
```

#### 阶段3: 分配推荐奖励和团队奖励

```
interestEarned = 1,563.1 - 1,000 = 563.1 USDT

a) 直推奖励 (5%):
  friendReward = 563.1 × 5% = 28.155 USDT

  如果用户绑定了 friend 地址:
    → 转账 28.155 USDT 给 friend
  否则:
    → 转账给 rootAddress

b) 团队奖励 (最多 35%):
  teamFee = 563.1 × 35% = 197.085 USDT

  根据用户的推荐链和层级分配:
  - 假设用户有推荐人，且推荐人是 V3 层级 (15%)
  - 实际分配: 563.1 × 15% = 84.465 USDT → 推荐人
  - 剩余: 197.085 - 84.465 = 112.62 USDT → rootAddress

  (注: 实际分配根据差额制度计算)

c) 用户净收益:
  userPayout = 1,563.1 - 28.155 - 197.085
             = 1,337.86 USDT
```

#### 阶段4: 1% 赎回费

```
expectedRedemptionFeeUSDT = 1,337.86 × 1% = 13.38 USDT

实际转给用户: 1,337.86 USDT (赎回费在后续处理)
```

#### 阶段5: 从流动性池回收 SYI (关键！)

```
SYI.recycle(syiTokensUsed);
  ↓
SYI.recycle(162,981.0);

recycle() 函数执行:

  步骤1: 检查权限
    ✅ msg.sender == Staking 合约地址

  步骤2: 获取池子余额
    pairBalance = balanceOf(uniswapV2Pair)
                = 4,262,981.0 SYI

  步骤3: 计算最大可回收
    maxRecyclable = 4,262,981.0 / 3
                  = 1,420,993.67 SYI

  步骤4: 确定实际回收数量
    请求: 162,981.0 SYI
    上限: 1,420,993.67 SYI
    实际: min(162,981.0, 1,420,993.67) = 162,981.0 SYI ✅

  步骤5: 执行回收
    _update(
      uniswapV2Pair,      // from
      Staking,            // to
      162,981.0           // amount
    )

    结果:
      Pair 余额: 4,262,981.0 - 162,981.0 = 4,100,000 SYI
      Staking 余额: 37,019.0 + 162,981.0 = 200,000 SYI

      ✅ Staking 合约的 SYI 余额恢复到交易前！

  步骤6: 同步 Pair 储备量
    uniswapV2Pair.sync();

    更新:
      reserve_SYI = balanceOf(pair) = 4,100,000 SYI
      reserve_USDT = balanceOf(pair) = 39,436.9 USDT

    价格更新:
      新价格 = 39,436.9 / 4,100,000
             = 0.009619 USDT/SYI

      相比初始价格 0.01 USDT/SYI，下跌了 3.81%
      原因: 本次交易从池子取走了 1,563.1 USDT
```

### 3.5 最终资金流向总结

```
┌─────────────────────────────────────────────────────────────┐
│ 资金流向汇总 (1000 USDT 质押 30 天)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 质押时:                                                     │
│   用户 → Staking: 1,000 USDT                               │
│   Staking → 池子: 500 USDT + 49,234.6 SYI (添加流动性)    │
│                                                             │
│ 30天后解质押:                                               │
│   池子 → Staking: 1,563.1 USDT (卖出 162,981 SYI)         │
│   ├─ 用户: 1,337.86 USDT (本金+部分利息)                  │
│   ├─ Friend: 28.155 USDT (5% 直推奖励)                    │
│   ├─ 团队: 84.465 USDT (实际团队奖励)                     │
│   └─ Root: 112.62 USDT (剩余团队奖励)                     │
│                                                             │
│   Staking ← 池子: 162,981 SYI (recycle 回收)              │
│                                                             │
│ 用户总收益:                                                 │
│   投入: 1,000 USDT                                         │
│   获得: 1,337.86 USDT                                      │
│   净利润: 337.86 USDT (33.79%)                            │
│                                                             │
│ 池子变化:                                                   │
│   USDT: 40,000 → 40,500 (质押时+500)                      │
│           → 39,436.9 (解质押时-1,063.1)                    │
│   净变化: -563.1 USDT (用于支付利息)                       │
│                                                             │
│   SYI: 4,000,000 → 4,049,234.6 (质押时+49,234.6)         │
│          → 4,100,000 (解质押时回到平衡)                    │
│   净变化: +100,000 SYI (流动性增加)                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 四、Recycle 机制的资金闭环

```
┌──────────────────────────────────────────────────────────────┐
│                  Recycle 资金闭环示意图                       │
│                                                              │
│  ┌──────────────┐                                           │
│  │   用户质押   │  1000 USDT                                │
│  └───────┬──────┘                                           │
│          │                                                   │
│          ↓                                                   │
│  ┌─────────────────────────────────────────────┐            │
│  │  _swapAndAddLiquidity (质押时)              │            │
│  ├─────────────────────────────────────────────┤            │
│  │ • 500 USDT 买 SYI                           │            │
│  │ • 500 USDT + SYI 添加流动性                 │            │
│  │ • 池子: USDT↑ SYI↑                          │            │
│  └─────────┬───────────────────────────────────┘            │
│            │                                                 │
│            │  质押记录 (1000 USDT)                          │
│            │                                                 │
│            ↓ [30天后]                                       │
│  ┌─────────────────────────────────────────────┐            │
│  │  unstake (解质押)                           │            │
│  │  ├─ _burn(): 计算奖励                       │            │
│  │  │    calculatedReward = 1,563.1 USDT      │            │
│  │  │                                          │            │
│  │  ├─ _swapSYIForReward(): 卖 SYI 换 USDT    │            │
│  │  │    输入: 1,563.1 USDT (需要的)          │            │
│  │  │    输出: 162,981 SYI (实际花费)         │            │
│  │  │    ┌──────────────────────────┐         │            │
│  │  │    │  Staking 合约发送 SYI    │         │            │
│  │  │    │         ↓                │         │            │
│  │  │    │    流动性池接收 SYI      │         │            │
│  │  │    │         ↓                │         │            │
│  │  │    │    Staking 收到 USDT     │         │            │
│  │  │    └──────────────────────────┘         │            │
│  │  │    结果: 池子 SYI 增加 162,981 枚       │            │
│  │  │         Staking SYI 减少 162,981 枚    │            │
│  │  │                                          │            │
│  │  └─ recycle(162,981): 回收 SYI             │            │
│  │       ┌──────────────────────────┐         │            │
│  │       │  从流动性池取回 SYI      │         │            │
│  │       │         ↓                │         │            │
│  │       │  Staking 合约收到 SYI    │         │            │
│  │       │         ↓                │         │            │
│  │       │  调用 sync() 同步储备    │         │            │
│  │       └──────────────────────────┘         │            │
│  │       结果: Staking SYI 余额恢复           │            │
│  │            池子 SYI 余额恢复平衡            │            │
│  └─────────────────────────────────────────────┘            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 五、关键数学公式

### 5.1 AMM 交易公式 (Uniswap V2)

**买入 (USDT → SYI):**
```
Δy = (y · Δx · 997) / (x · 1000 + Δx · 997)

其中:
  x = USDT 储备量
  y = SYI 储备量
  Δx = 输入的 USDT 数量
  Δy = 输出的 SYI 数量
  997/1000 = 扣除 0.3% 手续费
```

**卖出 (SYI → USDT):**
```
Δy = (y · Δx · 997) / (x · 1000 + Δx · 997)

其中:
  x = SYI 储备量
  y = USDT 储备量
  Δx = 输入的 SYI 数量
  Δy = 输出的 USDT 数量
```

**反向计算 (已知输出求输入):**
```
Δx = (x · Δy · 1000) / ((y - Δy) · 997)

用于 swapTokensForExactTokens:
  已知需要 Δy USDT
  计算需要多少 Δx SYI
```

### 5.2 复利计算公式

```
FV = PV × (1 + r)^n

其中:
  FV = 未来价值 (本金 + 利息)
  PV = 现值 (本金)
  r = 每日利率 (从合约 rates[] 读取)
  n = 复利天数

30天质押:
  r = 1.015000428130702600 (rate30D)
  n = 30
  FV = 1000 × (1.015000428130702600)^30
     = 1000 × 1.5631
     = 1,563.1 USDT
```

### 5.3 Recycle 回收上限

```
maxRecyclable = balanceOf(pair) / 3

安全边界:
  如果池子有 4,000,000 SYI
  最多回收 1,333,333 SYI (33.33%)

保证:
  池子始终保留至少 66.67% 的 SYI
  避免流动性枯竭
```

## 六、常见问题解答

### Q1: Recycle 机制的 SYI 从哪里来？

**A:** 来自用户解质押时的卖出交易。

```
完整流程:
1. Staking 合约持有 SYI (来自之前的回收)
2. 用户解质押，Staking 将 SYI 卖给流动性池换 USDT
3. 卖出导致池子里 SYI 增加
4. recycle() 从池子取回这些 SYI
5. Staking 合约 SYI 余额恢复，可以服务下一个用户
```

### Q2: 如果 Staking 合约没有足够的 SYI 怎么办？

**A:** 系统设计确保 Staking 始终有足够的 SYI。

```
机制保障:
1. 初始部署时，Owner 向 Staking 转入足够的 SYI
2. 每次解质押后，recycle() 立即回收使用的 SYI
3. 回收数量 = 卖出数量，确保余额不会减少
4. 只要流动性池有 SYI，recycle 就能工作

失败情况:
  如果池子 SYI 余额不足 (极端情况)
  → maxRecyclable = pairBalance / 3
  → 最多回收池子的 1/3
  → 部分回收，不会失败
```

### Q3: Recycle 会影响价格吗？

**A:** 会，但影响是中性的。

```
卖出交易:
  SYI 增加, USDT 减少 → SYI 价格下跌

Recycle 回收:
  SYI 减少 (从池子取回)
  但不影响 USDT → 需要调用 sync()

sync() 后:
  reserve 更新为实际余额
  价格重新平衡

净效果:
  价格主要由卖出交易决定
  recycle 只是把多余的 SYI 取回
  不会造成额外价格影响
```

### Q4: 为什么限制回收 1/3？

**A:** 保护流动性和防止攻击。

```
安全考虑:
1. 避免流动性枯竭
   如果一次取走太多 SYI
   → 池子深度不足
   → 交易滑点过大
   → 影响用户体验

2. 防止价格操纵
   如果没有限制
   → 恶意地址可以反复调用
   → 耗尽流动性
   → 导致价格失控

3. 渐进式回收
   如果需要回收超过 1/3
   → 可以分多次调用
   → 每次最多 1/3
   → 避免单次冲击过大
```

### Q5: 用户质押的利息从哪里来？

**A:** 来自新用户的质押和系统的经济模型。

```
资金来源:
1. 新用户质押时，50% USDT 添加到流动性池
   → 池子 USDT 增加

2. 老用户解质押时，从池子取出 USDT (本金+利息)
   → 池子 USDT 减少

3. 只要新质押 > 老解质押
   → 系统可持续

4. Recycle 机制确保 SYI 循环
   → 不需要额外铸造 SYI
   → 避免通胀
```

### Q6: Recycle 和 sync() 的区别？

**A:** 两个完全不同的函数。

```
recycle() (SYI 合约的函数):
  作用: 从流动性池回收 SYI 到 Staking
  调用者: 只能 Staking 合约
  影响:
    - Pair 的 SYI balance 减少
    - Staking 的 SYI balance 增加
    - 必须调用 sync() 同步

sync() (Pair 合约的函数):
  作用: 同步 balance 和 reserve
  调用者: 任何人
  影响:
    - reserve0 = balance0
    - reserve1 = balance1
    - 更新 AMM 价格

组合使用:
  recycle() 修改 balance
  sync() 同步 reserve
  两者配合使用确保价格正确
```

## 七、技术细节补充

### 7.1 _update() vs transfer()

```solidity
// recycle() 使用 _update() 而不是 transfer()
_update(address(uniswapV2Pair), address(staking), recycleAmount);

为什么不用 transfer()?
1. _update() 是内部函数，效率更高
2. transfer() 会触发税费逻辑
3. recycle 是特殊操作，不应收税
4. _update() 直接修改 balances，干净利落
```

### 7.2 swapTokensForExactTokens vs swapExactTokensForTokens

```
swapExactTokensForTokens:
  输入: 精确的代币数量
  输出: 不确定的代币数量
  用途: 质押时，用固定 USDT 买 SYI

swapTokensForExactTokens:
  输入: 不确定的代币数量 (设置最大值)
  输出: 精确的代币数量
  用途: 解质押时，需要精确的 USDT 奖励

为什么解质押要用精确输出?
  因为 calculatedReward 是合约计算的精确值
  必须给用户恰好这么多 USDT
  不能多也不能少
```

### 7.3 最大 SYI 输入计算 (_calculateMaxSYIInput)

```solidity
function _calculateMaxSYIInput(uint256 usdtNeeded, uint256 availableSYI)
    private view returns (uint256 maxInput)
{
    // 1. 获取池子储备
    (uint112 syiReserve, uint112 usdtReserve) = ...

    // 2. 限制 USDT 需求不超过储备的一半 (避免价格冲击)
    uint256 maxSafeUsdtRequest = usdtReserve / 2;
    uint256 safeUsdtNeeded = min(usdtNeeded, maxSafeUsdtRequest);

    // 3. 反向计算需要的 SYI
    uint256 estimatedSYI = (safeUsdtNeeded * syiReserve) / (usdtReserve - safeUsdtNeeded);

    // 4. 加上 50% 滑点保护
    uint256 withSlippage = (estimatedSYI * 150) / 100;

    // 5. 不能超过可用余额
    maxInput = min(withSlippage, availableSYI);
}
```

## 八、总结

Recycle 机制是 SYI 生态的核心创新：

✅ **解决痛点**: Staking 合约不需要预留大量 SYI，通过回收实现循环使用
✅ **保护流动性**: 限制回收上限 1/3，避免流动性枯竭
✅ **价格稳定**: 配合 sync() 同步储备，确保 AMM 价格正确
✅ **资金闭环**: 质押 → 交易 → 回收 → 再质押，形成完整生态

关键要点：
1. Recycle 只在用户解质押时触发
2. 回收数量 = 卖出使用的 SYI 数量
3. 必须调用 sync() 同步 Pair 储备量
4. 最多回收池子余额的 1/3
5. 确保 Staking 合约始终有足够的 SYI
