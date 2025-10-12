# SYI 代币快速参考

## 快速开始

### 1. 启动节点
```bash
npx hardhat node --fork https://rpc.tornadoeth.cash/bsc --fork-block-number 64340000
```

### 2. 部署 SYI
```bash
npx hardhat run scripts/deploySYI.js --network localhost
```

### 3. 运行测试
```bash
npx hardhat run scripts/testSYI.js --network localhost
```

## 已部署合约

根据 `syi-deployment.json`:

| 合约 | 地址 |
|------|------|
| SYI Token | `0xe5f1AC2c0236f350054ce9aE0eC8d7456ddBea8e` |
| FundRelay | `0xCdF6bE2a613A87A2cEbd029E75CD9F3E29FF012D` |
| Staking | `0xc91Ee7aC88fBfe34ffb5E1b22E611d39DBC8704D` |
| SYI/USDT Pair | `0x8c5F0bdeD2b05cb2A8eBD2490cf4BCcB1a5cFD18` |

## 代币信息

- **名称**: SYI Token
- **符号**: SYI
- **精度**: 18
- **总供应量**: 10,000,000 SYI

## 税费结构

### 买入税 (3%)
- 1% → 销毁 (Burn)
- 2% → LP 奖励

### 卖出税 (3%)
- 1.5% → 营销钱包
- 1.5% → LP 奖励累积

### 利润税 (25%)
- 仅对超过购买成本的利润征收
- 40% → LP 质押池
- 60% → 节点分红 (或营销地址)

## 常用命令

### 查看合约信息
```javascript
const SYI = await hre.ethers.getContractAt("contracts/SYI/mainnet/SYI.sol:SYI", syiAddress);

// 基本信息
await SYI.name();
await SYI.symbol();
await SYI.totalSupply();
await SYI.balanceOf(address);

// 配置信息
await SYI.getPresaleStatus();
await SYI.getDelayedBuyInfo();
await SYI.getAccumulatedFees();

// 用户信息
await SYI.getUserInvestment(address);
await SYI.feeWhitelisted(address);
```

### 管理功能 (Owner only)
```javascript
// 白名单管理
await SYI.setFeeWhitelisted(address, true);
await SYI.setBatchFeeWhitelisted([addr1, addr2], true);

// 黑名单管理
await SYI.setBlacklisted(address, true);

// 配置
await SYI.setMarketingAddress(address);
await SYI.setPresaleActive(false);
await SYI.setDelayedBuyEnabled(true);
```

## 状态检查

### 当前状态
- ✅ 部署成功
- ✅ 与 Staking 集成
- ✅ 交易对已创建
- ⚠️ 预售期中 (30天)
- ⚠️ 未添加流动性

### 预售期倒计时
剩余约 **30 天** (2,591,982 秒)

在预售期内，非白名单用户无法买入。

## 下一步操作

### 选项 1: 关闭预售期
```javascript
await SYI.setPresaleActive(false);
```

### 选项 2: 添加初始流动性
需要使用 PancakeRouter 添加 SYI/USDT 流动性

### 选项 3: 添加白名单用户
```javascript
await SYI.setFeeWhitelisted(userAddress, true);
```

## 测试结果

所有 8 项测试通过：
- ✅ 基本信息正确
- ✅ 配置查询成功
- ✅ 白名单功能正常
- ✅ 转账功能正常
- ✅ 交易对创建成功
- ✅ 投资记录追踪正常
- ✅ Staking 集成正常
- ✅ Owner 权限正常

## 文档

- 详细说明: `notes/SYI代币部署说明.md`
- Staking 说明: `notes/SYI-Staking部署说明.md`
- 部署信息: `syi-deployment.json`
- 测试脚本: `scripts/testSYI.js`

## 支持

参考文档中的常见问题部分或查看合约源码：
- `contracts/SYI/abstract/SYIBase.sol` - 核心逻辑
- `contracts/SYI/mainnet/SYI.sol` - 主网配置
