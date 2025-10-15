# SYI Recycle 机制流程图

## 流程图 1: 解质押完整流程 (含 Recycle)

```mermaid
sequenceDiagram
    autonumber
    participant User as 用户
    participant Staking as Staking合约
    participant SYI as SYI代币合约
    participant Router as PancakeRouter
    participant Pair as 流动性池(Pair)

    Note over User,Pair: 初始状态: 池子 4,000,000 SYI + 40,000 USDT<br/>Staking 200,000 SYI

    User->>Staking: unstake(stakeIndex)

    Note over Staking: 阶段1: 计算奖励
    Staking->>Staking: _burn(stakeIndex)
    Note over Staking: 返回:<br/>principalAmount = 1,000 USDT<br/>calculatedReward = 1,563.1 USDT

    Note over Staking: 阶段2: 卖 SYI 换 USDT
    Staking->>SYI: balanceOf(Staking)
    SYI-->>Staking: 200,000 SYI

    Staking->>Router: swapTokensForExactTokens(<br/>  1563.1 USDT,<br/>  200000 SYI,<br/>  [SYI,USDT]<br/>)

    Note over Router: 计算需要多少 SYI<br/>约 162,981 SYI

    Router->>SYI: transferFrom(Staking, Pair, 162981 SYI)
    SYI->>Pair: transfer 162,981 SYI
    Note over Pair: SYI balance: 4,000,000 + 162,981<br/>= 4,162,981 SYI

    Router->>Pair: swap(0, 1563.1, Staking)
    Pair->>Pair: USDT: 40,000 - 1,563.1 = 38,436.9
    Pair-->>Staking: transfer 1,563.1 USDT

    Router-->>Staking: 返回 1,563.1 USDT

    Note over Staking: 阶段3: 分配奖励
    Staking->>Staking: 计算利息: 563.1 USDT
    Staking->>User: 转账 1,337.86 USDT (净收益)
    Staking->>User: 转账 28.155 USDT 给 friend (5%)
    Staking->>User: 转账 84.465 USDT 给团队 (15%)

    Note over Staking,SYI: 阶段4: Recycle 回收 SYI (关键!)

    Staking->>SYI: recycle(162981)

    Note over SYI: recycle() 函数执行:
    SYI->>Pair: balanceOf(Pair)
    Pair-->>SYI: 4,162,981 SYI

    Note over SYI: maxRecyclable = 4,162,981 / 3<br/>= 1,387,660 SYI<br/>请求: 162,981 SYI ✅

    SYI->>SYI: _update(Pair, Staking, 162981)
    Note over SYI: Pair balance: 4,162,981 - 162,981<br/>= 4,000,000 SYI<br/>Staking balance: 37,019 + 162,981<br/>= 200,000 SYI ✅ 恢复!

    SYI->>Pair: sync()
    Note over Pair: 同步储备量:<br/>reserve_SYI = 4,000,000<br/>reserve_USDT = 38,436.9<br/>价格更新完成 ✅

    Note over User,Pair: 最终状态:<br/>池子: 4,000,000 SYI + 38,436.9 USDT<br/>Staking: 200,000 SYI (恢复)<br/>用户获得: 1,337.86 USDT
```

## 流程图 2: Recycle 函数详细执行流程

```mermaid
flowchart TD
    A[Staking.unstake 调用 SYI.recycle] --> B{权限检查}
    B -->|非 Staking 合约| C[❌ 拒绝: Only staking contract]
    B -->|✅ Staking 合约| D[获取池子 SYI 余额]

    D --> E[pairBalance = balanceOf<br/>uniswapV2Pair]
    E --> F[计算最大可回收数量<br/>maxRecyclable = pairBalance / 3]

    F --> G{比较请求数量}
    G -->|amount >= maxRecyclable| H[recycleAmount = maxRecyclable<br/>按上限回收]
    G -->|amount < maxRecyclable| I[recycleAmount = amount<br/>按请求回收]

    H --> J{recycleAmount > 0?}
    I --> J
    J -->|否| K[结束,不回收]
    J -->|是| L[执行回收操作]

    L --> M[_update<br/>from: Pair<br/>to: Staking<br/>amount: recycleAmount]

    M --> N[更新余额:<br/>Pair balance -= recycleAmount<br/>Staking balance += recycleAmount]

    N --> O[调用 Pair.sync]

    O --> P[Pair 同步储备量:<br/>reserve0 = balance0<br/>reserve1 = balance1]

    P --> Q[✅ 回收完成]

    style C fill:#ffcccc
    style Q fill:#ccffcc
    style L fill:#ffffcc
    style O fill:#cce5ff
```

## 流程图 3: 资金闭环示意图

```mermaid
graph TB
    subgraph 质押时
    U1[用户存入 1000 USDT] --> S1[Staking 合约]
    S1 --> |500 USDT| R1[Router: 买 SYI]
    R1 --> |49,234 SYI| S1
    S1 --> |500 USDT + 49,234 SYI| P1[添加流动性到 Pair]
    end

    subgraph 解质押时
    U2[用户解质押] --> S2[Staking 合约]
    S2 --> |计算奖励| C1[1,563.1 USDT]
    C1 --> S3[Staking 卖出 162,981 SYI]
    S3 --> |162,981 SYI| P2[Pair 接收 SYI]
    P2 --> |1,563.1 USDT| S3
    end

    subgraph Recycle回收
    S3 --> RC1[调用 recycle<br/>162,981 SYI]
    RC1 --> P3[从 Pair 取回 SYI]
    P3 --> |162,981 SYI| S4[Staking 余额恢复]
    S4 --> SY1[调用 sync<br/>同步储备]
    end

    subgraph 最终结果
    S4 --> |1,337.86 USDT| U3[用户收益]
    S4 --> |28.155 USDT| F1[Friend 奖励 5%]
    S4 --> |197.085 USDT| T1[团队奖励 35%]
    end

    style RC1 fill:#ff9999
    style S4 fill:#99ff99
    style SY1 fill:#9999ff
```

## 流程图 4: 池子状态变化时间线

```mermaid
gantt
    title SYI 池子状态变化 (1000 USDT 质押 30 天)
    dateFormat X
    axisFormat %s

    section 池子 USDT
    初始状态 40,000 :done, 0, 1
    质押时 +500 → 40,500 :active, 1, 2
    解质押时 -1,563.1 → 38,436.9 :crit, 2, 3

    section 池子 SYI
    初始状态 4,000,000 :done, 0, 1
    质押时 +49,234.6 → 4,049,234.6 :active, 1, 2
    解质押卖出 +162,981 → 4,212,215.6 :crit, 2, 2.5
    Recycle -162,981 → 4,049,234.6 :milestone, 2.5, 3

    section Staking SYI
    初始状态 200,000 :done, 0, 1
    保持不变 200,000 :active, 1, 2
    卖出 -162,981 → 37,019 :crit, 2, 2.5
    Recycle +162,981 → 200,000 :milestone, 2.5, 3
```

## 流程图 5: 决策树 - 是否能成功 Recycle

```mermaid
flowchart TD
    Start[用户调用 unstake] --> Check1{是否是 Staking<br/>合约调用 recycle?}

    Check1 -->|否| Fail1[❌ 失败:<br/>Only staking contract]
    Check1 -->|是| Check2{池子是否有 SYI?}

    Check2 -->|pairBalance = 0| Fail2[❌ 无法回收:<br/>池子无 SYI]
    Check2 -->|pairBalance > 0| Calc1[计算 maxRecyclable<br/>= pairBalance / 3]

    Calc1 --> Check3{请求数量 vs 上限}

    Check3 -->|请求 <= 上限| Success1[✅ 全额回收<br/>recycleAmount = 请求数量]
    Check3 -->|请求 > 上限| Success2[✅ 部分回收<br/>recycleAmount = maxRecyclable]

    Success1 --> Execute[执行 _update]
    Success2 --> Execute

    Execute --> Sync[调用 sync<br/>同步储备]
    Sync --> Done[✅ 回收完成]

    style Fail1 fill:#ffcccc
    style Fail2 fill:#ffcccc
    style Success1 fill:#ccffcc
    style Success2 fill:#ffffcc
    style Done fill:#99ff99
```

## 数据流图

### 场景: 用户解质押时的数据流

```
┌─────────────────────────────────────────────────────────────────┐
│ 第一步: 计算奖励                                                │
├─────────────────────────────────────────────────────────────────┤
│ 输入: stakeIndex = 0                                            │
│ 计算: 本金 1,000 + 利息 563.1 = 1,563.1 USDT                   │
│ 输出: calculatedReward = 1,563.1 USDT                          │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 第二步: 卖 SYI 换 USDT                                         │
├─────────────────────────────────────────────────────────────────┤
│ 输入: calculatedReward = 1,563.1 USDT (需要)                   │
│      Staking 余额 = 200,000 SYI                                │
│                                                                 │
│ Router 计算:                                                    │
│   池子: 4,000,000 SYI + 40,000 USDT                            │
│   需要: 1,563.1 USDT                                           │
│   反向 AMM: Δx = (y·Δy) / (x - Δy)                            │
│   Δx = (4,000,000 × 1,563.1) / (40,000 - 1,563.1)            │
│   Δx ≈ 162,981 SYI                                             │
│                                                                 │
│ 执行交易:                                                       │
│   Staking → Pair: 162,981 SYI                                  │
│   Pair → Staking: 1,563.1 USDT                                 │
│                                                                 │
│ 输出: usdtReceived = 1,563.1 USDT                              │
│      syiTokensUsed = 162,981 SYI                               │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 第三步: 分配奖励                                                │
├─────────────────────────────────────────────────────────────────┤
│ 利息 = 1,563.1 - 1,000 = 563.1 USDT                            │
│                                                                 │
│ 分配:                                                           │
│   Friend (5%):  563.1 × 5%  = 28.155 USDT                     │
│   Team (15%):   563.1 × 15% = 84.465 USDT                     │
│   User (剩余):  1,563.1 - 28.155 - 84.465 = 1,450.48 USDT     │
│   赎回费 (1%):  1,450.48 × 1% = 14.50 USDT                    │
│                                                                 │
│ 用户实际获得: 1,450.48 - 14.50 = 1,435.98 USDT                │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 第四步: Recycle 回收 SYI (关键!)                               │
├─────────────────────────────────────────────────────────────────┤
│ 输入: syiTokensUsed = 162,981 SYI                              │
│                                                                 │
│ 检查:                                                           │
│   pairBalance = balanceOf(Pair) = 4,162,981 SYI               │
│   maxRecyclable = 4,162,981 / 3 = 1,387,660 SYI               │
│   请求: 162,981 SYI                                            │
│   判断: 162,981 < 1,387,660 ✅ 可以全额回收                    │
│                                                                 │
│ 执行:                                                           │
│   _update(Pair, Staking, 162,981)                              │
│   Pair balance: 4,162,981 - 162,981 = 4,000,000 SYI           │
│   Staking balance: 37,019 + 162,981 = 200,000 SYI ✅          │
│                                                                 │
│ 同步:                                                           │
│   Pair.sync()                                                   │
│   reserve_SYI = 4,000,000                                       │
│   reserve_USDT = 38,436.9                                       │
│                                                                 │
│ 输出: Staking 余额恢复到初始状态 200,000 SYI                   │
└─────────────────────────────────────────────────────────────────┘
```

## 边界情况流程图

```mermaid
flowchart TD
    Start[请求回收 amount SYI] --> GetBalance[获取 pairBalance]

    GetBalance --> Case1{pairBalance 情况}

    Case1 -->|= 0| Empty[池子空了<br/>recycleAmount = 0]
    Case1 -->|< amount × 3| Limited[池子不足<br/>recycleAmount = pairBalance/3]
    Case1 -->|>= amount × 3| Full[池子充足<br/>recycleAmount = amount]

    Empty --> Skip[跳过回收<br/>不执行 _update]
    Limited --> Partial[部分回收<br/>只能回收 1/3]
    Full --> Complete[完整回收<br/>按需回收]

    Partial --> UpdateP[_update 部分数量]
    Complete --> UpdateC[_update 完整数量]

    UpdateP --> SyncP[sync 同步]
    UpdateC --> SyncC[sync 同步]

    Skip --> Result1[结果: 0 SYI 回收]
    SyncP --> Result2[结果: 部分回收<br/>Staking 可能不足]
    SyncC --> Result3[结果: 完整回收<br/>Staking 余额恢复]

    style Empty fill:#ffcccc
    style Limited fill:#ffffcc
    style Full fill:#ccffcc
    style Result3 fill:#99ff99
```

## 时序图: Balance vs Reserve 的变化

```mermaid
sequenceDiagram
    autonumber
    participant Staking
    participant SYI
    participant Pair

    Note over Pair: 初始状态<br/>balance: 4,000,000 SYI<br/>reserve: 4,000,000 SYI<br/>✅ 一致

    Note over Staking,Pair: 用户解质押,卖出 SYI

    Staking->>+Pair: transfer(162,981 SYI)
    Note over Pair: balance: 4,162,981 SYI<br/>reserve: 4,000,000 SYI<br/>❌ 不一致!

    Staking->>Pair: swap(获取 USDT)
    Pair->>-Staking: 返回 1,563.1 USDT

    Note over Pair: balance: 4,162,981 SYI<br/>reserve: 需要更新<br/>但 swap 时会自动 sync

    Note over Staking,Pair: 调用 recycle()

    Staking->>SYI: recycle(162,981)
    SYI->>SYI: balanceOf(Pair)
    Note over SYI: 读取的是 balance<br/>不是 reserve!

    SYI->>Pair: _update(-162,981 SYI)
    Note over Pair: balance: 4,000,000 SYI<br/>reserve: 可能还是旧值<br/>❌ 不一致!

    SYI->>Pair: sync()
    Note over Pair: balance: 4,000,000 SYI<br/>reserve: 4,000,000 SYI<br/>✅ 重新一致!

    Note over Pair: 价格更新完成<br/>可以正常交易
```

## 核心计算公式流程

```mermaid
flowchart LR
    subgraph 解质押计算
    A1[本金 1000 USDT] --> B1[复利公式]
    B1 --> C1[FV = 1000 × 1.015^30]
    C1 --> D1[= 1,563.1 USDT]
    end

    subgraph AMM 计算
    D1 --> E1[需要 1,563.1 USDT]
    E1 --> F1[反向 AMM]
    F1 --> G1[Δx = y·Δy / x-Δy]
    G1 --> H1[= 162,981 SYI]
    end

    subgraph Recycle 计算
    H1 --> I1[请求回收 162,981 SYI]
    I1 --> J1[池子余额 4,162,981]
    J1 --> K1[上限 = 余额 / 3]
    K1 --> L1[= 1,387,660 SYI]
    L1 --> M1{比较}
    M1 -->|162,981 < 1,387,660| N1[✅ 全额回收]
    M1 -->|> 上限| O1[⚠️ 部分回收]
    end

    style N1 fill:#ccffcc
    style O1 fill:#ffffcc
```
