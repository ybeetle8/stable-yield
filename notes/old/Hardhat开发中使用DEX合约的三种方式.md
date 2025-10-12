# Hardhat 开发中使用 DEX 合约的三种方式

## 目录

- [概述](#概述)
- [方式一：Mainnet Forking（推荐用于测试）](#方式一mainnet-forking推荐用于测试)
- [方式二：使用 NPM 包和插件（推荐用于快速开发）](#方式二使用-npm-包和插件推荐用于快速开发)
  - [PancakeSwap NPM 包完整清单](#pancakeswap-npm-包完整清单)
  - [使用示例](#使用示例)
- [方式三：复制源码自行编写/修改（当前项目采用）](#方式三复制源码自行编写修改当前项目采用)
- [三种方式对比](#三种方式对比)
- [推荐的工作流](#推荐的工作流)
- [当前项目的策略](#当前项目的策略)
- [实践建议](#实践建议)
- [总结](#总结)
- [附录: PancakeSwap NPM 包完整清单](#附录-pancakeswap-npm-包完整清单)

---

## 概述

在使用 Hardhat 开发 DeFi 项目时，集成像 Uniswap、PancakeSwap 这样的 DEX 合约有三种主流方式，**不一定需要自己从头编写所有合约代码**。

---

## 方式一：Mainnet Forking（推荐用于测试）

### 原理
使用 Hardhat 的 **mainnet forking** 功能，在本地创建一个主网的完整快照，直接使用已部署在主网上的合约。

### 优点
- ✅ **零部署成本**：不需要重新部署 DEX 合约
- ✅ **真实环境**：使用的是真实主网的合约和状态
- ✅ **快速测试**：可以立即测试与现有协议的集成
- ✅ **免费**：本地测试不消耗真实 Gas

### 配置方法

#### 1. 修改 `hardhat.config.js`
```javascript
module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: "https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY", // Ethereum
        // 或
        url: "https://bsc-dataseed.binance.org/", // BSC
        blockNumber: 12799760 // 可选：锁定在特定区块
      }
    }
  }
};
```

#### 2. 启动 Fork 节点
```bash
npx hardhat node --fork https://bsc-dataseed.binance.org/
```

#### 3. 使用已部署的合约（仅需接口）
```javascript
// 只需要接口文件，不需要完整实现
const IUniswapV2Router02 = require('./interfaces/IUniswapV2Router02.sol');

const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E"; // BSC 主网地址

const router = await ethers.getContractAt(
  'IUniswapV2Router02',
  PANCAKE_ROUTER
);

// 直接调用真实合约
await router.swapExactTokensForTokens(...);
```

### 适用场景
- 测试你的代币与现有 DEX 的集成
- 测试交易、流动性添加等功能
- 快速验证业务逻辑
- **不适合**：需要修改 DEX 合约本身的逻辑

### 需要的工具
- Alchemy 或 Infura 节点 API（免费层足够）
- 只需要 DEX 的接口文件（`interfaces/`）

---

## 方式二：使用 NPM 包和插件（推荐用于快速开发）

### 原理
通过 NPM 安装官方或社区维护的合约包和部署插件，一键部署到本地网络。

### 可用的包

#### Uniswap 相关
```bash
# Uniswap V2 一键部署插件
npm install uniswap-v2-deploy-plugin

# Uniswap V3 部署插件
npm install uniswap-v3-deploy-plugin

# Hardhat Uniswap 完整插件（V2 + V3）
npm install hardhat-uniswap

# Uniswap V3 外围合约
npm install @uniswap/v3-periphery
```

#### PancakeSwap 相关

##### 官方维护的包（推荐）

```bash
# PancakeSwap V2 SDK（活跃维护）
npm install @pancakeswap/sdk
# 最新版本: 5.8.17 (每日更新)
# 用途: 构建基于 PancakeSwap V2 的应用

# PancakeSwap V3 SDK
npm install @pancakeswap/v3-sdk
# 最新版本: 3.9.5
# 用途: 构建基于 PancakeSwap V3 的应用

# PancakeSwap V3 核心合约
npm install @pancakeswap/v3-core
# 用途: 导入 V3 合约接口到 Solidity 中，或部署到本地测试网

# PancakeSwap Swap SDK 核心
npm install @pancakeswap/swap-sdk-core
# 最新版本: 1.5.1
# 用途: 底层交换 SDK 核心库

# PancakeSwap 智能路由
npm install @pancakeswap/smart-router
# 最新版本: 7.5.3 (活跃更新)
# 用途: 从 AMM 获取最佳路由
# 包含: SmartRouter (链上查询) + InfinityRouter (链下计算)

# PancakeSwap 通用路由 SDK
npm install @pancakeswap/universal-router-sdk
# 用途: 与 Universal Router 交互 (兼容 UniswapLabs 的 Universal Router)
```

##### 社区维护的包

```bash
# 社区核心合约包
npm install @pancakeswap-libs/pancake-swap-core
# 注意: 更新可能不及时

# Hardhat Uniswap V2 部署插件（兼容 PancakeSwap）
npm install @onmychain/hardhat-uniswap-v2-deploy-plugin
# 用途: 一键部署 Uniswap V2 兼容的 PancakeSwap 合约

# 简化的 PancakeSwap SDK（社区）
npm install simple-pancakeswap-sdk
# GitHub: https://github.com/joshstevens19/simple-pancakeswap-sdk
# 用途: 简化的交易接口
```

##### 通用部署插件

```bash
# Hardhat Deploy (适用于所有合约部署)
npm install hardhat-deploy
# 用途: 管理合约部署，跟踪部署状态，复现测试环境
# 可用于部署 PancakeSwap 合约

# Hardhat Deploy + Ethers
npm install hardhat-deploy-ethers @nomicfoundation/hardhat-ethers
```

### 使用示例

#### 示例 1: Hardhat Uniswap 插件（快速部署 V2 兼容合约）

```bash
# 1. 安装插件
npm install hardhat-uniswap
```

```javascript
// 2. 配置 hardhat.config.js
require('hardhat-uniswap');

module.exports = {
  // ... 其他配置
};
```

```javascript
// 3. 一键部署（scripts/deploy.js）
const { deployUniswapV2 } = require('hardhat-uniswap');

async function main() {
  // 部署完整的 Uniswap V2 环境 (也适用于 PancakeSwap V2 兼容合约)
  const contracts = await deployUniswapV2(hre);

  console.log('Factory:', contracts.factory.address);
  console.log('Router:', contracts.router.address);
  console.log('WETH:', contracts.weth.address);
}

main();
```

#### 示例 2: PancakeSwap SDK（前端集成）

```bash
# 安装 PancakeSwap V2 SDK
npm install @pancakeswap/sdk
```

```javascript
// 使用 SDK 进行交易
import { ChainId, Token, WETH, Fetcher, Route, Trade, TokenAmount, TradeType } from '@pancakeswap/sdk';

// 定义代币
const CAKE = new Token(
  ChainId.MAINNET,
  '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  18,
  'CAKE',
  'PancakeSwap Token'
);

// 获取交易对数据
const pair = await Fetcher.fetchPairData(CAKE, WETH[ChainId.MAINNET], provider);

// 创建路由
const route = new Route([pair], WETH[ChainId.MAINNET]);

// 创建交易
const trade = new Trade(
  route,
  new TokenAmount(WETH[ChainId.MAINNET], '1000000000000000000'),
  TradeType.EXACT_INPUT
);

console.log(`执行价格: ${trade.executionPrice.toSignificant(6)}`);
console.log(`最小输出: ${trade.minimumAmountOut(slippageTolerance).toSignificant(6)}`);
```

#### 示例 3: PancakeSwap Smart Router（最佳路由）

```bash
# 安装智能路由 SDK
npm install @pancakeswap/smart-router
```

```javascript
// 使用智能路由获取最佳交易路径
import { SmartRouter } from '@pancakeswap/smart-router';

// 初始化 SmartRouter
const router = new SmartRouter({
  chainId: 56, // BSC 主网
  provider: ethersProvider,
});

// 获取最佳路由
const route = await router.getBestRoute({
  amount: '1000000000000000000', // 1 BNB
  currencyIn: WBNB,
  currencyOut: CAKE,
  tradeType: TradeType.EXACT_INPUT,
});

console.log('最佳路由:', route.path);
console.log('预期输出:', route.outputAmount);
```

#### 示例 4: 使用 V3 核心合约接口（Solidity）

```bash
# 安装 V3 核心合约包
npm install @pancakeswap/v3-core
```

```solidity
// 在 Solidity 合约中导入 PancakeSwap V3 接口
pragma solidity ^0.8.0;

import '@pancakeswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@pancakeswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';

contract MyDeFiContract {
    IUniswapV3Factory public factory;

    constructor(address _factory) {
        factory = IUniswapV3Factory(_factory);
    }

    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool) {
        pool = factory.getPool(tokenA, tokenB, fee);
    }
}
```

#### 示例 5: Hardhat Deploy 通用部署方案

```bash
# 安装 hardhat-deploy
npm install hardhat-deploy hardhat-deploy-ethers
```

```javascript
// deploy/001_deploy_pancake.js
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // 部署 WBNB
  const wbnb = await deploy('WBNB', {
    from: deployer,
    args: [],
    log: true,
  });

  // 部署 PancakeFactory
  const factory = await deploy('PancakeFactory', {
    from: deployer,
    args: [deployer], // feeToSetter
    log: true,
  });

  // 部署 PancakeRouter
  await deploy('PancakeRouter', {
    from: deployer,
    args: [factory.address, wbnb.address],
    log: true,
  });
};

module.exports.tags = ['Pancake'];
```

```bash
# 运行部署
npx hardhat deploy --network localhost
```

### 优点
- ✅ **快速部署**：一个函数部署整套合约
- ✅ **官方支持**：部分包由协议官方维护
- ✅ **版本管理**：使用 npm 管理依赖版本
- ✅ **适合本地开发**：完全控制合约实例

### 缺点
- ⚠️ **版本可能过时**：部分社区插件更新不及时
- ⚠️ **兼容性问题**：需要匹配 Solidity 版本
- ⚠️ **有限的定制**：如果需要修改合约逻辑，仍需复制源码

---

## 方式三：复制源码自行编写/修改（当前项目采用）

### 原理
从官方仓库或区块浏览器获取合约源码，复制到自己的 `contracts/` 目录中。

### 获取源码的途径

#### 1. 从 GitHub 官方仓库
```bash
# Uniswap V2
https://github.com/Uniswap/v2-core
https://github.com/Uniswap/v2-periphery

# PancakeSwap V2
https://github.com/pancakeswap/pancake-swap-core
https://github.com/pancakeswap/pancake-swap-periphery
```

#### 2. 从区块浏览器（已验证的合约）
- BSCScan: https://bscscan.com/
- Etherscan: https://etherscan.io/

搜索合约地址 → Contract → Code → 复制源码

#### 3. 当前项目的做法
```
contracts/
├── PancakeFactory.sol     # 从 PancakeSwap 源码复制
├── PancakeRouter.sol      # 从 PancakeSwap 源码复制
├── PancakePair.sol        # 自动创建的交易对合约
└── interfaces/
    └── IPancake*.sol      # 接口定义
```

### 优点
- ✅ **完全控制**：可以修改任何逻辑
- ✅ **无外部依赖**：不依赖 npm 包的更新
- ✅ **学习价值**：深入理解 AMM 机制
- ✅ **适合生产**：自己审计和优化合约

### 缺点
- ⚠️ **手动维护**：需要手动同步上游更新
- ⚠️ **编译器兼容性**：可能需要调整 Solidity 版本
- ⚠️ **代码量大**：增加项目复杂度

### 适用场景
- 需要修改 DEX 的手续费、税费机制
- 需要深度集成和定制（如当前项目的 OLA 税费）
- 学习 AMM 算法和实现细节
- 准备上线生产环境的项目

---

## 三种方式对比

| 特性 | Mainnet Forking | NPM 插件 | 复制源码 |
|------|-----------------|----------|----------|
| **部署速度** | 极快（无需部署） | 快（一键部署） | 慢（手动配置） |
| **定制能力** | ❌ 无法修改 | ⚠️ 有限 | ✅ 完全控制 |
| **学习价值** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **生产适用** | ❌ 仅测试 | ⚠️ 小项目 | ✅ 推荐 |
| **外部依赖** | Alchemy/Infura | npm 包 | 无 |
| **维护成本** | 低 | 中 | 高 |

---

## 推荐的工作流

### 阶段一：快速原型（Mainnet Forking）
在项目初期，使用 mainnet forking 快速验证想法：
```bash
npx hardhat node --fork https://bsc-dataseed.binance.org/
npx hardhat run scripts/test-idea.js --network localhost
```

### 阶段二：功能开发（NPM 插件）
在开发阶段，使用插件快速搭建环境：
```bash
npm install uniswap-v2-deploy-plugin
# 在测试中一键部署
```

### 阶段三：生产准备（复制源码）
准备上线时，复制并审计源码：
1. 从官方仓库获取源码
2. 根据需求修改（如手续费、税费）
3. 完整测试和审计
4. 部署到测试网/主网

---

## 当前项目的策略

当前 `stable-yield` 项目采用 **方式三（复制源码）**，原因如下：

### 为什么选择复制源码？

1. **需要深度定制**
   - OLA 代币有复杂的税费机制（买入税、卖出税、利润税）
   - 需要与 Staking 系统深度集成
   - 需要自定义流动性管理

2. **生产环境要求**
   - 准备部署到 BSC 主网
   - 需要完全理解和审计每一行代码
   - 不依赖第三方插件的稳定性

3. **学习和掌控**
   - 团队需要深入理解 AMM 机制
   - 便于后续维护和升级
   - 避免"黑盒"依赖

### 源码获取记录

```bash
# PancakeSwap V2 源码位置
contracts/PancakeFactory.sol  # 来自 pancake-swap-core
contracts/PancakeRouter.sol   # 来自 pancake-swap-periphery
contracts/PancakePair.sol     # 来自 pancake-swap-core

# 原始仓库
https://github.com/pancakeswap/pancake-swap-core/blob/master/contracts/PancakeFactory.sol
https://github.com/pancakeswap/pancake-swap-periphery/blob/master/contracts/PancakeRouter.sol
```

---

## 实践建议

### 1. 对于新手项目
- 先用 **Mainnet Forking** 学习和测试
- 理解 DEX 的工作原理后，再决定是否需要自己部署

### 2. 对于快速开发
- 使用 **NPM 插件** 快速搭建环境
- 专注于业务逻辑，而不是基础设施

### 3. 对于生产项目
- 使用 **复制源码** 方式
- 完整审计和测试所有代码
- 考虑雇佣专业审计公司

### 4. 混合策略（推荐）
```javascript
// 测试环境：使用 Forking
if (network.name === 'hardhat' && process.env.FORKING) {
  // 使用主网合约地址
  const router = await ethers.getContractAt('IRouter', MAINNET_ROUTER);
}
// 本地开发：部署自己的合约
else {
  const Router = await ethers.getContractFactory('PancakeRouter');
  const router = await Router.deploy(...);
}
```

---

## 总结

**不是所有人都需要像当前项目一样自己写完整的 DEX 合约**。选择哪种方式取决于：

- ❓ **是否需要修改 DEX 逻辑？** → 复制源码
- ❓ **只是集成测试？** → Mainnet Forking
- ❓ **快速开发原型？** → NPM 插件
- ❓ **准备上生产？** → 复制源码 + 审计

当前项目因为要实现复杂的税费机制和深度定制，所以选择了 **复制源码** 的方式，这是完全合理的。但对于大多数 DeFi 项目，**Mainnet Forking + 接口交互** 就足够了。

---

## 附录: PancakeSwap NPM 包完整清单

### 官方包（优先推荐）

| 包名 | 版本 | 更新频率 | 用途 |
|------|------|----------|------|
| `@pancakeswap/sdk` | 5.8.17 | 🟢 每日 | V2 应用开发 |
| `@pancakeswap/v3-sdk` | 3.9.5 | 🟢 活跃 | V3 应用开发 |
| `@pancakeswap/v3-core` | - | 🟢 稳定 | V3 合约接口 |
| `@pancakeswap/swap-sdk-core` | 1.5.1 | 🟢 活跃 | 底层 SDK 核心 |
| `@pancakeswap/smart-router` | 7.5.3 | 🟢 活跃 | 智能路由（最佳路径） |
| `@pancakeswap/universal-router-sdk` | - | 🟢 稳定 | 通用路由 SDK |

### 社区包（谨慎使用）

| 包名 | 状态 | 说明 |
|------|------|------|
| `@pancakeswap-libs/pancake-swap-core` | ⚠️ 更新慢 | 核心合约（建议用官方仓库） |
| `@onmychain/hardhat-uniswap-v2-deploy-plugin` | 🟡 可用 | V2 部署插件 |
| `simple-pancakeswap-sdk` | 🟡 可用 | 简化的交易 SDK |

### 通用工具

| 包名 | 用途 |
|------|------|
| `hardhat-deploy` | 通用合约部署管理 |
| `hardhat-deploy-ethers` | Hardhat Deploy + Ethers 集成 |
| `hardhat-uniswap` | Uniswap V2/V3 一键部署（兼容 PancakeSwap） |

### 快速选择指南

#### 场景 1: 前端集成 PancakeSwap
```bash
npm install @pancakeswap/sdk @pancakeswap/smart-router
```

#### 场景 2: Hardhat 测试环境（不修改合约）
```bash
# 方案 A: Mainnet Forking（推荐）
# 无需安装包，配置 hardhat.config.js 即可

# 方案 B: 使用插件部署
npm install hardhat-uniswap
```

#### 场景 3: Solidity 合约中使用 PancakeSwap 接口
```bash
npm install @pancakeswap/v3-core
```

#### 场景 4: 构建复杂交易机器人
```bash
npm install @pancakeswap/sdk @pancakeswap/smart-router @pancakeswap/swap-sdk-core
```

#### 场景 5: 需要修改 DEX 逻辑（当前项目）
```bash
# 不使用 npm 包，直接复制源码
# 从 GitHub 获取: github.com/pancakeswap/pancake-swap-core
```

### 官方资源链接

- **GitHub 组织**: https://github.com/pancakeswap
- **V2 核心合约**: https://github.com/pancakeswap/pancake-swap-core
- **V2 外围合约**: https://github.com/pancakeswap/pancake-swap-periphery
- **V3 合约**: https://github.com/pancakeswap/pancake-v3-contracts
- **智能路由示例**: https://github.com/pancakeswap/smart-router-example
- **开发者文档**: https://developer.pancakeswap.finance/
- **BSC 合约地址**: https://developer.pancakeswap.finance/contracts/v2/addresses

### 注意事项

1. **版本兼容性**
   - 确保 Solidity 版本匹配（V2 使用 0.6.x, V3 使用 0.7.x+）
   - 当前项目使用 Solidity 0.8.28，可能需要调整

2. **活跃维护度**
   - 官方包（`@pancakeswap/*`）更新频繁，优先使用
   - 社区包可能更新滞后，谨慎用于生产环境

3. **License 检查**
   - PancakeSwap V2 基于 GPL-3.0
   - 商业项目需注意开源协议要求

4. **Gas 优化**
   - 官方包未必针对你的用例优化
   - 生产环境建议审计和自定义优化
