# SYI 三合约关系说明

## 架构总览

```
                        ┌──────────────┐
                        │  SYI Token   │ (核心代币 - ERC20)
                        │              │
                        └──────┬───────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
    ┌────────────────────┐          ┌──────────────────┐
    │   SYI-Staking      │          │ LiquidityStaking │
    │   (质押 SYI 代币)   │          │ (质押 LP 代币)    │
    │   奖励: sSYI       │          │ 奖励: USDT       │
    └────────────────────┘          └──────────────────┘
            │                                │
            │                                │
            └────────── 推荐系统关联 ─────────┘
```

## 合约详细说明

### 1. SYI Token (核心代币合约)

**文件位置**: `contracts/SYI/mainnet/SYI.sol` + `contracts/SYI/abstract/SYIBase.sol`

**基本信息**:
- **代币名称**: SYI Token
- **符号**: SYI
- **总供应量**: 100,000,000 SYI (1亿)
- **精度**: 18
- **标准**: ERC20

**核心特性**:
- ✅ 完整的 ERC20 代币功能
- ✅ 买卖税费机制
  - 买入税 3%: 1% burn + 2% LP 奖励池
  - 卖出税 3%: 1.5% marketing + 1.5% LP 奖励池
- ✅ 利润税 25% (对超过成本的卖出征税)
  - 40% → LiquidityStaking (LP 质押池)
  - 60% → 节点分红地址 (或 marketing)
- ✅ 预售期控制 (30天)
- ✅ 黑白名单管理
- ✅ 自动流动性添加
- ✅ 成本追踪系统 (用于计算利润税)

**对外接口**:
```solidity
// 供 Staking 合约调用
function recycle(uint256 amount) external;
function triggerFundRelayDistribution() external;
function triggerFeeProcessing() external;

// LP 奖励分发
function distributeRewards(uint256 depositAmount, bool forceDistribution)
    external returns (bool, uint256, uint256, bool);

// 配置接口
function setStaking(address newAddress) external;
function setMarketingAddress(address newAddress) external;
function setNodeDividendAddress(address newAddress) external;
```

**依赖合约**:
- ✅ USDT: `0x55d398326f99059fF775485246999027B3197955` (BSC 主网)
- ✅ PancakeRouter: `0x10ED43C718714eb63d5aA57B78B54704E256024E`
- ✅ PancakeFactory: `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73`
- ✅ SYI-Staking: 部署后配置
- ⏭️ LiquidityStaking: 部署后配置

---

### 2. SYI-Staking (单币质押合约)

**文件位置**: `contracts/SYI-Staking/mainnet/Staking.sol` + `contracts/SYI-Staking/abstract/StakingBase.sol`

**质押凭证**: Staked SYI (sSYI)
- 质押时铸造 sSYI
- 解除质押时销毁 sSYI
- sSYI 不可转账

**质押档位**:
| 档位 | 周期 | 日化收益 | 总收益率 |
|------|------|----------|----------|
| 0 | 1天 | 0.3% | 0.3% |
| 1 | 7天 | 0.612% | 4.28% |
| 2 | 15天 | 1.073% | 16.1% |
| 3 | 30天 | 1.876% | 56.31% |

**推荐奖励系统**:
- **直推奖励**: 5% (需绑定推荐人)
- **团队奖励**: V1-V7 层级奖励
  - V1: 0.5%
  - V2: 1.0%
  - V3: 1.5%
  - V4: 2.0%
  - V5: 2.5%
  - V6: 3.5%
  - V7: 5.0%

**核心流程**:
1. 用户绑定推荐人 (`lockReferral()`)
2. 质押 SYI 代币 (`stake()`)
3. 合约铸造等量 sSYI
4. 按复利公式计算收益
5. 解除质押 (`unstake()`)
6. 分发奖励给推荐人和团队
7. 销毁 sSYI

**与 SYI Token 关系**:
```solidity
// 初始化时设置
staking.setSYI(syiAddress);

// Staking 可以调用
syi.recycle(amount);  // 回收代币
syi.triggerFeeProcessing();  // 触发费用处理
```

**依赖合约**:
- ✅ SYI Token
- ✅ USDT
- ✅ PancakeRouter

---

### 3. LiquidityStaking (LP 质押合约) ⭐

**文件位置**: `contracts/LiquidityStaking/src/mainnet/LiquidityStaking.sol` + `contracts/abstract/LiquidityStakingBase.sol`

**质押资产**: SYI/USDT LP 代币 (PancakeSwap 流动性凭证)

**奖励资产**: USDT

**核心机制**:
- 用户质押 LP 代币
- 按质押时间计算权重 (时间越长权重越高)
- 权重公式: `weight = amount × (1 + duration / 365 days)`
- 最高权重: 2倍 (质押满 1 年)
- 奖励按权重比例分配

**奖励来源**:
1. **SYI Token 买入税的 2% LP 费用** → 累积后兑换 USDT → 分发
2. **SYI Token 卖出税的 1.5% LP 费用** → 累积后兑换 USDT → 分发
3. **SYI Token 利润税的 40%** → 直接分发 USDT
4. **外部注入的 USDT 奖励**

**最小质押时间**: 24 小时 (主网)

**核心函数**:
```solidity
// 用户操作
function stake(uint256 amount) external;  // 质押 LP
function unstake(uint256 amount) external;  // 解除质押
function claimReward() external;  // 领取奖励

// SYI Token 调用 (注入奖励)
function depositRewards(uint256 amount) external;  // 注入 USDT
function depositBLARewards(uint256 blaAmount) external;  // 注入 SYI (会自动兑换成 USDT)

// 查询函数
function getUserStakeInfo(address account) external view
    returns (uint256 stakedAmount, uint256 stakeTime, uint256 pendingReward,
             uint256 accumulatedReward, uint256 weight);
function getRewardPoolInfo() external view
    returns (uint256 totalRewards, uint256 rewardPerSecond, uint256 totalStaked,
             uint256 totalWeight, uint256 stakersCount, uint256 distributedRewards,
             uint256 pendingRewards);
```

**权限控制**:
```solidity
modifier onlyAdmin() {
    require(msg.sender == olaContract || msg.sender == owner());
    _;
}
```
- SYI Token 合约可以调用管理函数
- Owner 可以调用管理函数

**依赖合约**:
- ✅ SYI Token (olaContract)
- ✅ USDT
- ✅ SYI/USDT LP Token (PancakeSwap Pair)
- ✅ SYI-Staking (用于推荐系统查询)
- ✅ PancakeRouter (用于 SYI → USDT 兑换)

---

## 合约交互流程

### 流程 1: 用户添加流动性并质押

```
1. 用户在 PancakeSwap 添加流动性
   - 存入: 1000 SYI + 100 USDT
   - 获得: X LP 代币

2. 用户质押 LP 到 LiquidityStaking
   - 调用: liquidityStaking.stake(X)
   - LP 代币转入合约
   - 开始累积奖励

3. 等待 24 小时后可解除质押
   - 调用: liquidityStaking.claimReward() (领取奖励)
   - 或: liquidityStaking.unstake(X) (解除质押 + 领取奖励)
```

### 流程 2: SYI Token 税费分配到 LP 质押池

```
1. 用户在 PancakeSwap 买入/卖出 SYI
   ↓
2. SYI Token 收取税费
   - 买入: 2% → LP 奖励累积 (SYI 代币)
   - 卖出: 1.5% → LP 奖励累积 (SYI 代币)
   ↓
3. 累积到阈值 (10 SYI) 后自动触发
   ↓
4. SYI Token 调用 LiquidityStaking
   - liquidityStaking.depositBLARewards(累积的 SYI)
   ↓
5. LiquidityStaking 自动兑换
   - SYI → USDT (通过 PancakeRouter)
   ↓
6. USDT 进入奖励池
   - 按 7 天周期分配
   - rewardPerSecond = pendingRewards / 7 days
   ↓
7. 所有 LP 质押者按权重获得奖励
```

### 流程 3: 利润税分配

```
1. 用户在 PancakeSwap 卖出 SYI (且有利润)
   ↓
2. SYI Token 计算利润税 (25%)
   - 利润 = (卖出获得的 USDT) - (用户购买成本)
   - 利润税 = 利润 × 25%
   ↓
3. 利润税分配:
   - 40% → LiquidityStaking (USDT)
   - 60% → 节点分红地址 或 Marketing (USDT)
   ↓
4. SYI Token 调用 LiquidityStaking
   - liquidityStaking.depositRewards(利润税的 40%)
   ↓
5. USDT 直接进入奖励池 (无需兑换)
   - 按 7 天周期分配
   ↓
6. 所有 LP 质押者按权重获得奖励
```

---

## 部署顺序与配置

### 已完成部署

1. ✅ **SYI-Staking**
   - 地址: `0xc91Ee7aC88fBfe34ffb5E1b22E611d39DBC8704D`
   - 部署脚本: `scripts/deploySYIStaking.js`
   - 测试脚本: `scripts/testSYIStaking.js`

2. ✅ **SYI Token**
   - 地址: `0x9e267C0a277e52180D2CCE40C11FcE61135dDdC6`
   - 部署脚本: `scripts/deploySYI.js`
   - 测试脚本: `scripts/testSYI.js`
   - 配置完成:
     - `Staking.setSYI(syiAddress)` ✅
     - 创建 SYI/USDT Pair ✅
     - 白名单配置 ✅

### 待部署

3. ⏭️ **LiquidityStaking**
   - 源码位置: `othercode/LiquidityStaking/src/`
   - 目标位置: `contracts/LiquidityStaking/` (需要从 OLA 改名为 SYI)
   - 构造函数参数:
     ```solidity
     constructor(
         address _usdt,           // 0x55d398326f99059fF775485246999027B3197955
         address _olaContract,    // SYI Token 地址
         address _lpToken,        // SYI/USDT Pair 地址
         address _staking,        // SYI-Staking 地址
         address _marketingAddress, // Marketing 地址
         address _admin,          // Owner 地址
         address _router          // PancakeRouter 地址
     )
     ```

### 部署后配置

4. **配置 SYI Token**
   ```solidity
   // 设置 LiquidityStaking 地址 (用于利润税分配)
   syi.setNodeDividendAddress(liquidityStakingAddress);

   // 将 LiquidityStaking 加入白名单 (免税)
   syi.addToWhitelist(liquidityStakingAddress);
   ```

---

## 资金流向图

```
                        用户购买 SYI
                             ↓
                ┌────────────────────────┐
                │   PancakeSwap 交易     │
                │   (SYI/USDT Pair)     │
                └───────────┬────────────┘
                            │
                            ↓
                    ┌───────────────┐
                    │  SYI Token    │
                    │  (税费收取)    │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ↓                   ↓                   ↓
   买入税 3%            卖出税 3%           利润税 25%
   1% burn            1.5% marketing       40% LP
   2% LP              1.5% LP              60% 节点/marketing
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ↓
                ┌─────────────────────┐
                │  LiquidityStaking   │
                │  (奖励池累积)        │
                └──────────┬──────────┘
                           │
                           ↓
                    自动兑换 SYI → USDT
                           ↓
                    按权重分配给 LP 质押者
                           ↓
                    ┌──────────────┐
                    │  用户领取奖励  │
                    │  (USDT)      │
                    └──────────────┘
```

---

## 关键数值参数

### SYI Token
- 总供应量: 100,000,000 SYI
- 预售期: 30 天 (2,592,000 秒)
- 买入税: 3% (1% burn + 2% LP)
- 卖出税: 3% (1.5% marketing + 1.5% LP)
- 利润税: 25% (40% LP + 60% 节点)

### SYI-Staking
- 最小质押: 无限制 (根据代码)
- 最大单次质押: 10,000 USDT
- 最大总质押: 200,000 USDT
- 赎回手续费: 1%
- 复利频率: 每秒计算

### LiquidityStaking
- 最小质押时间: 24 小时
- 最小奖励: 0.001 USDT (1000 wei)
- 自动兑换阈值: 10 SYI
- 奖励分配周期: 7 天
- 权重公式: `1 + (质押时间 / 365 天)`
- 最大权重: 2x (质押满 1 年)

---

## 常见问题

### Q1: 为什么需要 LiquidityStaking?
A: 为了激励用户提供流动性。用户添加 SYI/USDT 流动性后可以质押 LP 代币赚取额外的 USDT 奖励，从而减少 LP 撤出，稳定价格。

### Q2: LP 奖励从哪里来?
A:
1. SYI Token 的买入税 2% (LP 费用)
2. SYI Token 的卖出税 1.5% (LP 费用)
3. SYI Token 的利润税 40% (直接 USDT)

### Q3: 质押时间越长奖励越多吗?
A: 是的。权重公式 `weight = amount × (1 + duration / 365 days)`，质押满 1 年可获得 2 倍权重。

### Q4: 可以提前解除质押吗?
A: 可以，但需要满足最小质押时间 (24小时)。

### Q5: SYI-Staking 和 LiquidityStaking 有什么区别?
A:
- SYI-Staking: 质押 SYI 代币，获得 sSYI 凭证，奖励来自 SYI 代币池
- LiquidityStaking: 质押 LP 代币 (SYI/USDT)，无凭证代币，奖励来自交易税费 (USDT)

### Q6: 三个合约之间如何通信?
A:
- SYI Token → SYI-Staking: `recycle()`
- SYI Token → LiquidityStaking: `depositRewards()`, `depositBLARewards()`
- SYI-Staking → SYI Token: `triggerFeeProcessing()`
- LiquidityStaking → SYI Token: `triggerFundRelayDistribution()`

---

## 技术栈

- **Solidity**: 0.8.28
- **编译器优化**: 启用 (runs: 200)
- **框架**: Hardhat 2.26.3
- **依赖库**:
  - OpenZeppelin Contracts v5.4.0
  - PRB Math v4.1.0 (复利计算)
  - Uniswap V2 Core & Periphery
- **网络**: BSC (Binance Smart Chain)
- **DEX**: PancakeSwap V2

---

## 参考资料

- **原始合约参考**: `othercode/OLA`, `othercode/OLA-Staking`, `othercode/LiquidityStaking`
- **BSC 主网原合约**:
  - OLA Token: `0xfc548e35c4a3603b09204acead0cd16908423eea`
  - Staked OLA: `0x39f403ca78c08317a03401acff4113d992b3c071`
  - LP Staking: `0xfb9690de036711027c062d043ec3fde4ab5849fd`
- **项目说明**: `CLAUDE.md`
- **部署说明**:
  - `notes/SYI-Staking部署说明.md`
  - `notes/SYI代币部署说明.md`
  - `notes/SYI-LiquidityStaking部署说明.md` (待创建)

---

**文档版本**: v1.0
**更新时间**: 2025-10-12
**状态**: SYI Token 和 SYI-Staking 已部署，LiquidityStaking 待部署
