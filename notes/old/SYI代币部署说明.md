# SYI 代币合约部署说明

## 概述

SYI 是一个功能完整的 DeFi 代币，包含以下特性：
- 完整的 ERC20 代币功能
- 买卖税费机制 (买入 3%: 1% burn + 2% LP | 卖出 3%: 1.5% marketing + 1.5% LP)
- 利润税 (25% 对超过成本的卖出征税)
- 预售期控制 (30天)
- 黑白名单管理
- 自动流动性添加
- 与 Staking 系统集成

## 文件结构

```
contracts/SYI/
├── abstract/
│   └── SYIBase.sol          # SYI 核心业务逻辑 (1473行)
├── mainnet/
│   └── SYI.sol              # 主网环境配置 (30天预售期)
├── interfaces/
│   ├── ILiquidityStaking.sol  # LP 质押接口
│   ├── IStaking.sol           # Staking 接口
│   ├── IUniswapV2Factory.sol  # Uniswap V2 Factory 接口
│   ├── IUniswapV2Pair.sol     # Uniswap V2 Pair 接口
│   └── IUniswapV2Router02.sol # Uniswap V2 Router 接口
└── utils/
    ├── FundRelay.sol          # 资金中继合约
    └── Helper.sol             # 工具函数库
```

## 依赖合约

部署 SYI 之前必须先部署 SYI-Staking 合约：

- ✅ **Staking**: `0xc91Ee7aC88fBfe34ffb5E1b22E611d39DBC8704D`
- ✅ **USDT**: `0x55d398326f99059fF775485246999027B3197955` (BSC 主网)
- ✅ **PancakeRouter**: `0x10ED43C718714eb63d5aA57B78B54704E256024E` (BSC 主网)
- ✅ **PancakeFactory**: `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` (BSC 主网)

## 快速开始

### 1. 启动 BSC Fork 节点

```bash
# 在一个终端窗口运行
npx hardhat node --fork https://rpc.tornadoeth.cash/bsc --fork-block-number 64340000
```

### 2. 编译合约

```bash
npx hardhat compile
```

### 3. 部署合约

```bash
npx hardhat run scripts/deploySYI.js --network localhost
```

## 部署流程

脚本会自动执行以下步骤：

1. **部署 FundRelay (临时)**
   - 用临时地址创建 FundRelay 合约

2. **部署 SYI 代币**
   - 总供应量: 10,000,000 SYI
   - 初始全部分配给 deployer

3. **配置 Staking**
   - 调用 `Staking.setSYI(syiAddress)`

4. **重新部署 FundRelay**
   - 使用正确的 SYI 地址重新部署

5. **配置 SYI**
   - 初始化白名单
   - 设置 FundRelay
   - 创建 SYI/USDT 交易对
   - 设置交易对地址

## 部署后信息

部署完成后，合约地址和配置信息保存在 `syi-deployment.json`：

```json
{
  "network": "BSC Fork (localhost)",
  "timestamp": "2025-10-12T...",
  "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "marketingWallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "contracts": {
    "SYI": "0x9e267C0a277e52180D2CCE40C11FcE61135dDdC6",
    "FundRelay": "0xce1D3fA721419568D5830Ea020718bdCE6960784",
    "Staking": "0xc91Ee7aC88fBfe34ffb5E1b22E611d39DBC8704D",
    "USDT": "0x55d398326f99059fF775485246999027B3197955",
    "PancakeRouter": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    "PancakeFactory": "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    "SYI_USDT_Pair": "0xFB3b9B9e44B64552fE60C70e094D92F0362441Af"
  },
  "tokenInfo": {
    "name": "SYI Token",
    "symbol": "SYI",
    "decimals": "18",
    "totalSupply": "10000000000000000000000000"
  }
}
```

## 核心功能

### 税费机制

#### 买入税 (3%)
- 1% → 销毁
- 2% → LP 奖励池

#### 卖出税 (3%)
- 1.5% → 营销钱包
- 1.5% → LP 奖励累积

#### 利润税 (25%)
- 仅对超过初始购买成本的部分征税
- 40% 给 LP 质押池
- 60% 给节点分红地址 (如未设置则给营销地址)

### 预售期

- 默认 30 天预售期
- 预售期内禁止买入 (白名单除外)
- 可以手动开启/关闭预售模式

### 白名单

以下地址自动加入白名单 (免税):
- Owner
- SYI 合约本身
- Staking 合约
- Marketing 地址
- Router 地址
- FundRelay 地址

### 延迟买入

- 可选功能，用于防止狙击
- 启用后需等待 30 天才能买入
- 白名单用户不受影响

## 管理功能

### Owner 可执行操作

```solidity
// 白名单管理
setFeeWhitelisted(address, bool)
setBatchFeeWhitelisted(address[], bool)

// 黑名单管理
setBlacklisted(address, bool)
setBatchBlacklisted(address[], bool)

// 配置
setMarketingAddress(address)
setNodeDividendAddress(address)
setSwapAtAmount(uint256)
setColdTime(uint256)
setPresaleActive(bool)
setDelayedBuyEnabled(bool)

// 紧急功能
recoverStuckTokens(address, uint256)
```

## 与 Staking 集成

SYI 与 Staking 系统完全集成：
- 用户需在 Staking 绑定推荐关系
- 利润税部分分配给 LP 质押池
- Staking 可以回收 LP 中的代币

## 测试

已提供完整的测试脚本 `scripts/testSYI.js`，涵盖以下测试项：

### 测试内容

1. ✅ **基本信息** - name, symbol, decimals, totalSupply, balance
2. ✅ **合约配置** - 预售状态, 延迟买入, 累积手续费, 关键地址
3. ✅ **白名单状态** - Owner, SYI, Staking, 普通用户
4. ✅ **转账功能** - 白名单间免税转账
5. ✅ **交易对信息** - LP token, 储备量, token0/token1
6. ✅ **投资记录** - 用户 USDT 投资额追踪
7. ✅ **Staking 集成** - 名称, 符号, Root 地址
8. ✅ **Owner 权限** - 添加/移除白名单

### 运行测试

```bash
npx hardhat run scripts/testSYI.js --network localhost
```

### 测试输出示例

```
==========================================
SYI 代币合约测试
==========================================

[测试 1] 代币基本信息
─────────────────────────────────────────
名称: SYI Token
符号: SYI
精度: 18
总供应量: 10000000.0 SYI
✅ 基本信息正确

[测试 2] 合约配置
─────────────────────────────────────────
预售状态: true (剩余 2591982 秒)
✅ 配置查询成功

...

==========================================
✅ 所有测试通过！
==========================================
```

## 注意事项

⚠️ **重要提示**

1. **预售期**: 部署后默认进入 30 天预售期，期间非白名单用户无法买入
2. **初始流动性**: 部署脚本不会自动添加流动性，需要手动操作
3. **LiquidityStaking**: 如需 LP 质押功能，需要单独部署 LiquidityStaking 合约
4. **FundRelay**: 该合约用于解决 swap 时的 INVALID_TO 问题，必须正确配置
5. **节点分红**: 如需节点分红功能，需调用 `setNodeDividendAddress()`

## 下一步

1. ✅ 部署 SYI 代币
2. ⏭️ 部署 LiquidityStaking (如需 LP 质押功能)
3. ⏭️ 添加初始流动性到 SYI/USDT 交易对
4. ⏭️ 配置预售期和白名单
5. ⏭️ 测试完整交易流程

## 常见问题

### Q: 如何添加初始流动性？
A: 使用 PancakeRouter 的 `addLiquidity()` 方法，或通过前端界面操作。

### Q: 如何关闭预售期？
A: 调用 `setPresaleActive(false)`

### Q: 如何添加白名单？
A: 调用 `setFeeWhitelisted(address, true)` 或批量 `setBatchFeeWhitelisted(addresses, true)`

### Q: LP 税费如何分配？
A: 买入的 2% LP 税费和卖出的 1.5% LP 税费会累积，达到阈值后自动或手动触发分配到 LiquidityStaking 合约。

### Q: 如何查看用户的购买成本？
A: 调用 `getUserInvestment(address)` 查看用户的 USDT 投资额和最后购买时间。

## 技术支持

如有问题，请参考：
- CLAUDE.md - 项目完整说明
- notes/SYI-Staking部署说明.md - Staking 合约说明
- othercode/OLA - 原始 OLA 合约参考

## Solidity 版本

- **编译器**: 0.8.20+
- **优化器**: 启用 (runs: 200)
- **EVM 版本**: paris

## 依赖库

- @openzeppelin/contracts ^5.4.0
- @uniswap/v2-core (接口)
- @uniswap/v2-periphery (接口)
