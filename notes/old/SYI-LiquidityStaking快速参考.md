# SYI-LiquidityStaking 快速参考

## 合约地址

- **LiquidityStaking**: `0xf5F5f5F9985242F7d380E5764D3469fC73C71d5e`
- **SYI Token**: `0x23D4dA0FEe7C17C4DC55C0A10A545565797daB5f`
- **SYI-Staking**: `0xc91Ee7aC88fBfe34ffb5E1b22E611d39DBC8704D`
- **SYI/USDT Pair**: `0xE08F6A3Bb14634480712b3dC1eDDD7b638682587`
- **USDT**: `0x55d398326f99059fF775485246999027B3197955`
- **PancakeRouter**: `0x10ED43C718714eb63d5aA57B78B54704E256024E`

## 快速命令

### 编译
```bash
npx hardhat compile
```

### 部署
```bash
npx hardhat run scripts/deploySYILiquidityStaking.js --network localhost
```

### 测试
```bash
npx hardhat run scripts/testSYILiquidityStaking.js --network localhost
```

### 配置 (重要！)

将 LiquidityStaking 添加到 SYI Token 白名单:

```bash
npx hardhat console --network localhost
```

```javascript
const syi = await ethers.getContractAt("SYI", "0x23D4dA0FEe7C17C4DC55C0A10A545565797daB5f");
await syi.addToWhitelist("0xf5F5f5F9985242F7d380E5764D3469fC73C71d5e");
```

(可选) 设置节点分红地址:

```javascript
await syi.setNodeDividendAddress("0xf5F5f5F9985242F7d380E5764D3469fC73C71d5e");
```

## 核心参数

- **最小质押时间**: 24 小时
- **最小奖励**: 0.001 USDT
- **分配周期**: 7 天
- **自动兑换阈值**: 10 SYI
- **权重公式**: 1 + (质押时间 / 365 天)
- **最大权重**: 2x (1 年)

## 合约功能

### 用户函数

```solidity
stake(uint256 amount)           // 质押 LP
unstake(uint256 amount)         // 解除质押 + 领取奖励
claimReward()                   // 仅领取奖励
getUserStakeInfo(address)       // 查询质押信息
canUnstake(address)             // 是否可以解除质押
```

### SYI Token 调用

```solidity
depositRewards(uint256 amount)        // 注入 USDT 奖励
depositSYIRewards(uint256 syiAmount)  // 注入 SYI 代币
```

### 查询函数

```solidity
getRewardPoolInfo()             // 奖励池信息
getStakersCount()               // 质押者数量
accumulatedSYI()                // 累积的 SYI
```

## 奖励来源

1. SYI Token 买入税 2% (LP 费用) → 自动兑换成 USDT
2. SYI Token 卖出税 1.5% (LP 费用) → 自动兑换成 USDT
3. SYI Token 利润税 40% → 直接 USDT

## 用户流程

1. 在 PancakeSwap 添加 SYI/USDT 流动性 → 获得 LP Token
2. Approve LP Token 给 LiquidityStaking
3. 调用 `stake(amount)` 质押 LP
4. 等待 24 小时
5. 调用 `claimReward()` 领取奖励 或 `unstake(amount)` 解除质押

## 文件位置

- **合约**: `contracts/LiquidityStaking/`
- **部署脚本**: `scripts/deploySYILiquidityStaking.js`
- **测试脚本**: `scripts/testSYILiquidityStaking.js`
- **部署信息**: `syi-liquidity-staking-deployment.json`
- **说明文档**: `notes/SYI-LiquidityStaking部署说明.md`

## 相关文档

- `notes/SYI三合约关系说明.md` - 三个合约的关系架构
- `notes/SYI代币部署说明.md` - SYI Token 说明
- `notes/SYI-Staking部署说明.md` - SYI-Staking 说明
- `CLAUDE.md` - 项目完整说明

---

**更新时间**: 2025-10-12
