# PancakeSwap 本地部署项目

这个项目展示了如何在本地部署一个完整的 PancakeSwap DEX (去中心化交易所)，包括所有核心合约和交互示例。

## 项目结构

```
bsc-test/
├── contracts/
│   ├── HelloWorld.sol          # 简单的Hello World合约
│   ├── WBNB.sol               # 包装BNB代币合约
│   ├── TestToken.sol          # 测试用ERC20代币合约
│   ├── PancakeFactory.sol     # PancakeSwap工厂合约 + LP代币合约
│   └── PancakeRouter.sol      # PancakeSwap路由合约
├── scripts/
│   ├── deploy.js              # 部署HelloWorld合约
│   ├── deployPancakeSwap.js   # 部署完整PancakeSwap DEX
│   └── usePancakeSwap.js      # PancakeSwap使用示例
├── test/
│   └── HelloWorld.test.js     # HelloWorld合约测试
└── hardhat.config.js          # Hardhat配置文件
```

## 部署的合约

### 核心合约
- **WBNB**: 包装BNB代币，用于ETH/Token交易
- **PancakeFactory**: 创建和管理交易对
- **PancakeRouter**: 处理所有交易路由和流动性操作
- **PancakePair**: 流动性池合约 (由Factory自动创建)

### 测试代币
- **Token A (TKA)**: 测试代币A，总量100万
- **Token B (TKB)**: 测试代币B，总量100万

## 快速开始

### 方法一：一键部署和测试 (推荐)
```bash
# 1. 安装依赖
npm install

# 2. 启动本地网络 (保持运行)
npm run node

# 3. 新终端运行完整测试 (一键完成所有操作)
npm run deploy-and-use
```

### 方法二：分步操作
```bash
# 1. 安装依赖
npm install

# 2. 编译合约
npm run compile

# 3. 启动本地网络 (保持运行)
npm run node

# 4. 新终端部署 PancakeSwap
npm run deploy-pancake

# 5. 使用示例 (可选)
npm run use-pancake
```

**注意**: 推荐使用方法一，它会自动完成所有部署、流动性添加和交易测试。

## 功能特性

### ✅ 已实现功能
- 🏭 **工厂合约**: 创建交易对
- 🔀 **路由合约**: 处理交易和流动性
- 💱 **代币交换**: Token to Token, ETH to Token
- 🏊 **流动性管理**: 添加/移除流动性
- 📊 **价格预言机**: 累积价格跟踪
- 🛡️ **安全检查**: 滑点保护、重入保护

### 🔧 合约地址
部署成功后你会看到类似以下的合约地址：
```
WBNB: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Factory: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Router: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Token A (TKA): 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
Token B (TKB): 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
```

## 使用示例

### 代币交换
```javascript
// 50 TKA -> TKB
await router.swapExactTokensForTokens(
    ethers.parseEther("50"),    // 输入数量
    0,                          // 最小输出 (滑点保护)
    [tokenA.address, tokenB.address],  // 交易路径
    user.address,               // 接收地址
    deadline                    // 过期时间
);
```

### 添加流动性
```javascript
await router.addLiquidity(
    tokenA.address,             // 代币A地址
    tokenB.address,             // 代币B地址
    ethers.parseEther("100"),   // 代币A数量
    ethers.parseEther("200"),   // 代币B数量
    0,                          // 最小A数量
    0,                          // 最小B数量
    user.address,               // LP代币接收地址
    deadline                    // 过期时间
);
```

## 测试

### 运行Hello World测试
```bash
npm test
```

### 验证PancakeSwap功能
部署后所有功能都会自动测试，包括：
- 合约部署
- 交易对创建
- 流动性添加
- 代币交换

## 网络配置

### 本地网络 (默认)
- 网络: Hardhat本地网络
- RPC: http://127.0.0.1:8545/
- Chain ID: 31337

### BSC网络支持
项目已配置BSC主网和测试网：
- BSC主网: https://bsc-dataseed1.binance.org/
- BSC测试网: https://data-seed-prebsc-1-s1.binance.org:8545/

## 技术特点

- 🔧 **Solidity 0.8.28**: 最新版本Solidity
- 🛠️ **Hardhat框架**: 现代化开发环境
- 🔐 **安全优化**: 重入保护、溢出保护
- 📈 **AMM算法**: Uniswap V2兼容
- 🎯 **完整功能**: 工厂+路由+LP全套合约

## 常见问题

### Q: 如何重新部署？
A: 重启本地网络后重新运行 `npm run deploy-pancake`

### Q: 交易失败怎么办？
A: 检查代币余额和授权，确保有足够的gas费用

### Q: 如何连接MetaMask？
A: 添加本地网络 (RPC: http://127.0.0.1:8545, Chain ID: 31337)

### Q: 部署到BSC测试网？
A: 修改hardhat.config.js中的网络配置并添加私钥

## 许可证
MIT License

## 警告 ⚠️
这是一个用于学习和测试的项目，不要在生产环境中使用。所有测试账户和私钥都是公开的，不要向其中发送真实资金。