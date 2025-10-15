# SYI LiquidityStaking 部署说明

## 概述

LiquidityStaking 是 SYI 生态系统的第三个核心合约，用于激励用户提供 SYI/USDT 流动性。用户质押 LP 代币后可获得 USDT 奖励，奖励来自 SYI Token 的交易税费。

## 合约特性

- **质押资产**: SYI/USDT LP Token (PancakeSwap)
- **奖励资产**: USDT
- **最小质押时间**: 24 小时
- **权重机制**: 质押时间越长，权重越高 (最高 2倍)
- **奖励来源**:
  - SYI Token 买入税的 2% (LP 费用)
  - SYI Token 卖出税的 1.5% (LP 费用)
  - SYI Token 利润税的 40% (USDT)

## 文件结构

```
contracts/LiquidityStaking/
├── abstract/
│   └── LiquidityStakingBase.sol  # 核心业务逻辑 (590 行)
├── mainnet/
│   └── LiquidityStaking.sol      # 主网环境配置
└── interfaces/
    ├── ISYI.sol                  # SYI Token 接口
    └── IStaking.sol              # Staking 接口
```

## 快速开始

### 1. 启动 BSC Fork 节点

确保在另一个终端窗口运行:

```bash
npx hardhat node --fork https://rpc.tornadoeth.cash/bsc --fork-block-number 64340000
```

### 2. 编译合约

```bash
npx hardhat compile
```

### 3. 部署合约

```bash
npx hardhat run scripts/deploySYILiquidityStaking.js --network localhost
```

### 4. 测试合约

```bash
npx hardhat run scripts/testSYILiquidityStaking.js --network localhost
```

## 部署流程

脚本会自动执行以下步骤:

1. **读取 SYI 部署信息**
   - 从 `syi-deployment.json` 获取已部署的合约地址

2. **部署 LiquidityStaking**
   - 构造函数参数:
     - `_usdt`: USDT 地址 (BSC 主网)
     - `_syiContract`: SYI Token 地址
     - `_lpToken`: SYI/USDT LP Token 地址
     - `_staking`: SYI-Staking 地址
     - `_marketingAddress`: Marketing 钱包
     - `_admin`: Owner 地址
     - `_router`: PancakeRouter 地址

3. **验证合约配置**
   - 检查所有地址是否正确设置

4. **保存部署信息**
   - 保存到 `syi-liquidity-staking-deployment.json`

## 部署后信息

部署完成后，合约地址和配置信息保存在 `syi-liquidity-staking-deployment.json`:

```json
{
  "network": "BSC Fork (localhost)",
  "timestamp": "2025-10-12T...",
  "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "marketingWallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "contracts": {
    "LiquidityStaking": "0xed923123063151faf9CA6Ae142301ee3F9c25Cf0",
    "SYI": "0xe5f1AC2c0236f350054ce9aE0eC8d7456ddBea8e",
    "Staking": "0xc91Ee7aC88fBfe34ffb5E1b22E611d39DBC8704D",
    "SYI_USDT_Pair": "0x8c5F0bdeD2b05cb2A8eBD2490cf4BCcB1a5cFD18",
    "USDT": "0x55d398326f99059fF775485246999027B3197955",
    "PancakeRouter": "0x10ED43C718714eb63d5aA57B78B54704E256024E"
  },
  "configuration": {
    "minStakeDuration": "24 hours",
    "minRewardAmount": "0.001 USDT",
    "distributionPeriod": "7 days",
    "weightFormula": "1 + (duration / 365 days)",
    "maxWeight": "2x (1 year)"
  }
}
```

## 核心功能

### 用户操作

#### 质押 LP

```solidity
function stake(uint256 amount) external;
```

- 用户需要先 approve LP Token 给 LiquidityStaking 合约
- 最小质押时间: 24 小时
- 质押后立即开始累积奖励

#### 解除质押

```solidity
function unstake(uint256 amount) external;
```

- 需要满足最小质押时间 (24小时)
- 自动领取所有待领取的奖励
- 如果全部解除质押，会从质押者列表移除

#### 领取奖励

```solidity
function claimReward() external;
```

- 不解除质押，仅领取当前待领取的奖励
- 最小领取金额: 0.001 USDT

### SYI Token 调用

#### 注入 USDT 奖励

```solidity
function depositRewards(uint256 amount) external;
```

- 只有 SYI Token 或 Owner 可以调用
- USDT 会在 7 天内线性分发

#### 注入 SYI 代币奖励

```solidity
function depositSYIRewards(uint256 syiAmount) external;
```

- 只有 SYI Token 或 Owner 可以调用
- SYI 代币会累积到 10 SYI 后自动兑换成 USDT
- 兑换后的 USDT 会在 7 天内线性分发

### 查询函数

#### 用户质押信息

```solidity
function getUserStakeInfo(address account) external view
    returns (
        uint256 stakedAmount,    // 质押数量
        uint256 stakeTime,       // 质押时间
        uint256 pendingReward,   // 待领取奖励
        uint256 accumulatedReward, // 已累积奖励
        uint256 weight           // 当前权重
    );
```

#### 奖励池信息

```solidity
function getRewardPoolInfo() external view
    returns (
        uint256 totalRewards,      // 总奖励
        uint256 rewardPerSecond,   // 每秒奖励
        uint256 totalStaked,       // 总质押量
        uint256 totalWeight,       // 总权重
        uint256 stakersCount,      // 质押者数量
        uint256 distributedRewards, // 已分发奖励
        uint256 pendingRewards     // 待分发奖励
    );
```

#### 检查是否可以解除质押

```solidity
function canUnstake(address account) external view returns (bool);

function canWithdrawStake(address account) external view
    returns (
        bool canWithdraw,      // 是否可以解除质押
        uint256 stakedAmount,  // 质押数量
        uint256 timeRemaining  // 剩余时间 (秒)
    );
```

## 权重机制

质押时间越长，获得的权重越高，从而获得更多奖励。

**权重公式**:
```
weight = amount × (1 + stakeDuration / 365 days)
```

**示例**:
- 质押 100 LP，刚质押: 权重 = 100
- 质押 100 LP，30 天后: 权重 ≈ 108.2
- 质押 100 LP，90 天后: 权重 ≈ 124.7
- 质押 100 LP，180 天后: 权重 ≈ 149.3
- 质押 100 LP，365 天后: 权重 = 200 (最大)

## 奖励分配机制

### 1. SYI Token 税费累积

用户在 PancakeSwap 买卖 SYI 时:
- 买入: 2% → LP 费用 (SYI 代币)
- 卖出: 1.5% → LP 费用 (SYI 代币)
- 利润税: 40% → LP 质押池 (USDT)

### 2. SYI 代币累积

LP 费用会累积在 `accumulatedSYI` 变量中。

### 3. 自动兑换

当累积达到 10 SYI 时，合约会在以下时机自动兑换:
- 用户 stake()
- 用户 unstake()
- 用户 claimReward()

兑换通过 PancakeRouter 执行: SYI → USDT

### 4. 线性分发

兑换得到的 USDT 会在 7 天内线性分发给所有质押者，按权重比例。

**每秒奖励**:
```
rewardPerSecond = pendingRewards / 7 days
```

**用户每秒获得**:
```
userRewardPerSecond = rewardPerSecond × (userWeight / totalWeight)
```

## 管理功能

### 排除地址

```solidity
function setExcluded(address account, bool excluded) external;
```

- 只有 SYI Token 或 Owner 可以调用
- 被排除的地址无法质押
- 默认排除: LiquidityStaking 自身、SYI Token、Marketing 钱包

### 紧急提取

```solidity
function emergencyWithdraw(address token, uint256 amount) external;
```

- 只有 SYI Token 或 Owner 可以调用
- 提取的代币会发送到 SYI Token 合约

## 测试结果

已测试的功能:

1. ✅ **基本信息** - syiContract, usdt, lpToken, staking, router, owner
2. ✅ **奖励池信息** - totalRewards, rewardPerSecond, totalStaked, stakersCount
3. ✅ **质押参数** - 最小质押时间 24 小时
4. ✅ **地址排除** - LiquidityStaking、SYI、Marketing 已排除
5. ✅ **SYI 奖励累积** - accumulatedSYI, 自动兑换阈值 10 SYI
6. ✅ **用户质押信息** - stakedAmount, pendingReward, weight
7. ✅ **质押者列表** - stakersCount, stakers array
8. ✅ **解除质押检查** - canUnstake, canWithdrawStake

### 测试输出

```
[测试 1] 合约基本信息
✅ 基本信息读取成功

[测试 2] 奖励池信息
✅ 奖励池信息读取成功

[测试 3] 质押参数
最小质押时间: 86400 秒 ( 24 小时)
✅ 质押参数读取成功

[测试 4] 地址排除状态
LiquidityStaking 合约: ✅ 已排除
SYI Token 合约: ✅ 已排除
Marketing 钱包: ✅ 已排除
Deployer 地址: ✅ 可质押
✅ 排除状态检查完成

...

==========================================
✅ 所有测试通过！
==========================================
```

## 部署后配置 (重要)

### 1. 将 LiquidityStaking 添加到 SYI Token 白名单

这是**必须的**，否则 LiquidityStaking 无法接收 SYI 代币奖励。

```solidity
// 在 deploySYI.js 或单独脚本中执行
const syi = await ethers.getContractAt("SYI", syiAddress);
await syi.addToWhitelist(liquidityStakingAddress);
```

或使用 Hardhat console:

```bash
npx hardhat console --network localhost
```

```javascript
const syi = await ethers.getContractAt("SYI", "0xe5f1AC2c0236f350054ce9aE0eC8d7456ddBea8e");
await syi.addToWhitelist("0xed923123063151faf9CA6Ae142301ee3F9c25Cf0");
```

### 2. 设置节点分红地址 (可选)

如果希望利润税的 60% 部分也发送到 LiquidityStaking:

```solidity
await syi.setNodeDividendAddress(liquidityStakingAddress);
```

⚠️ **注意**: 如果设置了 NodeDividendAddress，利润税将分配为:
- 40% → LiquidityStaking (通过 depositRewards)
- 60% → LiquidityStaking (通过 setNodeDividendAddress)

如果不设置，利润税分配为:
- 40% → LiquidityStaking
- 60% → Marketing 地址

## 用户使用流程

### 1. 添加流动性到 PancakeSwap

```javascript
// 用户需要在 PancakeSwap 添加 SYI/USDT 流动性
// 获得 LP Token
```

### 2. Approve LP Token

```javascript
const lpToken = await ethers.getContractAt("IERC20", lpTokenAddress);
await lpToken.approve(liquidityStakingAddress, amount);
```

### 3. 质押 LP

```javascript
const liquidityStaking = await ethers.getContractAt("LiquidityStaking", liquidityStakingAddress);
await liquidityStaking.stake(amount);
```

### 4. 等待 24 小时

最小质押时间为 24 小时。

### 5. 领取奖励或解除质押

```javascript
// 仅领取奖励
await liquidityStaking.claimReward();

// 或解除质押 (会自动领取奖励)
await liquidityStaking.unstake(amount);
```

## 与其他合约的关系

```
SYI Token
  ↓ (买卖税 2% + 1.5% LP 费用)
  ↓ (depositSYIRewards)
LiquidityStaking
  ↓ (自动兑换 SYI → USDT)
  ↓ (按权重分配)
LP 质押者
```

```
SYI Token
  ↓ (利润税 40% USDT)
  ↓ (depositRewards)
LiquidityStaking
  ↓ (按权重分配)
LP 质押者
```

## 注意事项

⚠️ **重要提示**

1. **最小质押时间**: 24 小时内无法解除质押
2. **最小奖励**: 单次领取至少 0.001 USDT
3. **自动兑换**: 累积达到 10 SYI 才会自动兑换，避免频繁交易
4. **白名单**: LiquidityStaking 必须加入 SYI Token 白名单
5. **权重计算**: 基于区块时间戳，时间越长权重越高
6. **奖励分配**: 7 天线性分发，避免奖励池快速耗尽

## 常见问题

### Q1: 为什么需要 24 小时锁定期?
A: 防止用户频繁进出套利，稳定 LP 流动性。

### Q2: SYI 代币什么时候兑换成 USDT?
A: 当累积达到 10 SYI 且用户触发 stake/unstake/claimReward 时自动兑换。

### Q3: 质押时间怎么计算?
A: 从第一次 stake 的时间开始计算，后续追加质押不会重置时间。

### Q4: 可以部分解除质押吗?
A: 可以，但需要满足 24 小时锁定期。

### Q5: 奖励从哪里来?
A: SYI Token 的买卖税费 (自动兑换成 USDT) + 利润税 (直接 USDT)。

### Q6: 如果没有人质押，奖励怎么办?
A: 奖励会累积在合约中，等待有人质押后再分配。

### Q7: 权重最大是多少?
A: 2倍，质押满 1 年可达到最大权重。

### Q8: 如何查看我的待领取奖励?
A: 调用 `getUserStakeInfo(yourAddress)`，查看 `pendingReward`。

## 下一步

1. ✅ 部署 LiquidityStaking 合约
2. ⏭️ 将 LiquidityStaking 添加到 SYI Token 白名单
3. ⏭️ (可选) 设置节点分红地址
4. ⏭️ 用户添加 SYI/USDT 流动性
5. ⏭️ 用户质押 LP Token
6. ⏭️ 测试完整流程 (质押 → 奖励累积 → 领取)

## 技术支持

如有问题，请参考:
- `CLAUDE.md` - 项目完整说明
- `notes/SYI三合约关系说明.md` - 三个合约的关系
- `notes/SYI-Staking部署说明.md` - Staking 合约说明
- `notes/SYI代币部署说明.md` - SYI 代币说明
- `othercode/LiquidityStaking` - 原始 LiquidityStaking 参考

## Solidity 版本

- **编译器**: 0.8.20+
- **优化器**: 启用 (runs: 200)
- **EVM 版本**: paris

## 依赖库

- @openzeppelin/contracts ^5.4.0
- @uniswap/v2-periphery (接口)

---

**文档版本**: v1.0
**更新时间**: 2025-10-12
**状态**: ✅ 已部署并测试通过
