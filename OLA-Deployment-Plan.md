# OLA & OLA-Staking 合约本地部署方案

基于对两个合约的分析，以下是详细的本地部署方案。

## 合约架构分析

### OLA 合约
- **主合约**: `OLA.sol` (继承 `OLABase.sol`)
- **功能**: DeFi代币合约，带有买卖税费、流动性处理、质押奖励分发等功能
- **关键依赖**: Uniswap V2 Router、USDT、Staking合约

### OLA-Staking 合约  
- **主合约**: `Staking.sol` (继承 `StakingBase.sol`)
- **功能**: 质押合约，支持多期质押、团队奖励、推荐系统等
- **关键依赖**: USDT、Uniswap V2 Router、OLA代币

## 本地部署步骤

### 1. 环境准备

```bash
# 确保已有的Hardhat环境和Pancake合约
cd /home/ybeetle/test/solana/bsc-test
npm install

# 安装所需依赖
npm install @openzeppelin/contracts
npm install @prb/math
```

### 2. 依赖合约部署顺序

#### 第一步：基础代币部署

```javascript
// 1. 部署WBNB (已存在)
// 2. 部署USDT测试代币
const usdt = await TestToken.deploy("Tether USD", "USDT", 1000000000);

// 3. 部署Pancake工厂和路由 (已存在)
// factory: PancakeFactory.sol
// router: PancakeRouter.sol
```

#### 第二步：OLA生态系统部署

```javascript
// 1. 首先部署Staking合约 (OLA构造函数需要)
const staking = await Staking.deploy(
    usdt.address,           // USDT地址
    pancakeRouter.address,  // PancakeRouter地址  
    rootAddress,           // 根地址
    feeRecipient          // 手续费接收地址
);

// 2. 部署OLA代币合约
const ola = await OLA.deploy(
    usdt.address,           // USDT地址
    pancakeRouter.address,  // PancakeRouter地址
    staking.address,        // Staking合约地址
    marketingAddress       // 营销地址
);

// 3. 在Staking合约中设置OLA地址
await staking.setOLA(ola.address);
```

#### 第三步：流动性配置

```javascript
// 1. 创建OLA/USDT交易对
const factory = await ethers.getContractAt("PancakeFactory", factoryAddress);
await factory.createPair(ola.address, usdt.address);
const pairAddress = await factory.getPair(ola.address, usdt.address);

// 2. 在OLA合约中设置交易对
await ola.setPair(pairAddress);

// 3. 初始化白名单
await ola.initializeWhitelist();
```

### 3. 合约源码适配需求

#### OLA合约适配
- **路径调整**: 将 `lib/` 路径的导入改为本地 `contracts/` 路径
- **接口兼容**: 确保与本地Pancake合约接口兼容
- **依赖库**: 需要 OpenZeppelin 和 PRB-Math 库

#### Staking合约适配  
- **数学库**: 需要 PRB-Math 库处理复利计算
- **接口导入**: 调整Uniswap接口导入路径

### 4. 所需新增文件

#### 创建接口文件
```solidity
// contracts/interfaces/IOLA.sol
// contracts/interfaces/IStaking.sol  
// contracts/interfaces/ILiquidityStaking.sol
```

#### 工具合约
```solidity
// contracts/utils/FundRelay.sol
// contracts/utils/Helper.sol
```

#### 抽象合约
```solidity
// contracts/abstract/OLABase.sol
// contracts/abstract/StakingBase.sol
```

### 5. 完整部署脚本

创建 `scripts/deployOLASystem.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());
    
    // 1. 部署基础代币 - USDT
    console.log("\n=== 部署 USDT 测试代币 ===");
    const TestToken = await ethers.getContractFactory("TestToken");
    const usdt = await TestToken.deploy("Tether USD", "USDT", 1000000000);
    await usdt.deployed();
    console.log("USDT deployed to:", usdt.address);
    
    // 2. 获取已部署的Pancake合约地址
    console.log("\n=== 获取 Pancake 合约地址 ===");
    // 这里需要替换为实际部署的地址
    const pancakeFactory = "0x..."; // 从之前的部署中获取
    const pancakeRouter = "0x...";  // 从之前的部署中获取
    
    console.log("PancakeFactory:", pancakeFactory);
    console.log("PancakeRouter:", pancakeRouter);
    
    // 3. 部署Staking合约
    console.log("\n=== 部署 Staking 合约 ===");
    const Staking = await ethers.getContractFactory("Staking");
    const staking = await Staking.deploy(
        usdt.address,
        pancakeRouter,
        deployer.address, // rootAddress
        deployer.address  // feeRecipient
    );
    await staking.deployed();
    console.log("Staking deployed to:", staking.address);
    
    // 4. 部署OLA代币合约
    console.log("\n=== 部署 OLA 代币合约 ===");
    const OLA = await ethers.getContractFactory("OLA");
    const ola = await OLA.deploy(
        usdt.address,
        pancakeRouter,
        staking.address,
        deployer.address // marketingAddress
    );
    await ola.deployed();
    console.log("OLA deployed to:", ola.address);
    
    // 5. 配置Staking合约中的OLA地址
    console.log("\n=== 配置合约关联 ===");
    await staking.setOLA(ola.address);
    console.log("OLA address set in Staking contract");
    
    // 6. 创建OLA/USDT流动性对
    console.log("\n=== 创建交易对 ===");
    const factoryContract = await ethers.getContractAt("PancakeFactory", pancakeFactory);
    const createPairTx = await factoryContract.createPair(ola.address, usdt.address);
    await createPairTx.wait();
    
    const pairAddress = await factoryContract.getPair(ola.address, usdt.address);
    console.log("OLA/USDT Pair created at:", pairAddress);
    
    // 7. 在OLA合约中设置交易对
    await ola.setPair(pairAddress);
    console.log("Pair address set in OLA contract");
    
    // 8. 初始化OLA合约白名单
    await ola.initializeWhitelist();
    console.log("OLA whitelist initialized");
    
    // 9. 为测试添加初始流动性
    console.log("\n=== 准备测试数据 ===");
    
    // 给部署者一些USDT用于测试
    await usdt.mint(deployer.address, ethers.utils.parseEther("100000"));
    console.log("Minted 100,000 USDT for testing");
    
    // 输出部署摘要
    console.log("\n=== 部署摘要 ===");
    console.log("USDT:", usdt.address);
    console.log("OLA:", ola.address);
    console.log("Staking:", staking.address);
    console.log("OLA/USDT Pair:", pairAddress);
    console.log("PancakeFactory:", pancakeFactory);
    console.log("PancakeRouter:", pancakeRouter);
    
    // 保存地址到文件以供后续使用
    const addresses = {
        usdt: usdt.address,
        ola: ola.address,
        staking: staking.address,
        pair: pairAddress,
        factory: pancakeFactory,
        router: pancakeRouter,
        deployer: deployer.address
    };
    
    require('fs').writeFileSync(
        'deployed-addresses.json', 
        JSON.stringify(addresses, null, 2)
    );
    console.log("\n合约地址已保存到 deployed-addresses.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
```

### 6. 测试脚本

创建 `scripts/testOLASystem.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
    // 读取部署的合约地址
    const addresses = JSON.parse(require('fs').readFileSync('deployed-addresses.json', 'utf8'));
    
    const [deployer, user1, user2] = await ethers.getSigners();
    
    // 获取合约实例
    const ola = await ethers.getContractAt("OLA", addresses.ola);
    const staking = await ethers.getContractAt("Staking", addresses.staking);
    const usdt = await ethers.getContractAt("TestToken", addresses.usdt);
    const router = await ethers.getContractAt("PancakeRouter", addresses.router);
    
    console.log("=== OLA系统功能测试 ===");
    
    // 1. 测试代币基本信息
    console.log("\n1. 代币基本信息:");
    console.log("OLA name:", await ola.name());
    console.log("OLA symbol:", await ola.symbol());
    console.log("OLA totalSupply:", ethers.utils.formatEther(await ola.totalSupply()));
    console.log("OLA owner balance:", ethers.utils.formatEther(await ola.balanceOf(deployer.address)));
    
    // 2. 测试质押功能
    console.log("\n2. 测试质押功能:");
    
    // 给user1一些USDT用于质押
    await usdt.mint(user1.address, ethers.utils.parseEther("1000"));
    console.log("User1 USDT balance:", ethers.utils.formatEther(await usdt.balanceOf(user1.address)));
    
    // user1授权USDT给staking合约
    await usdt.connect(user1).approve(staking.address, ethers.utils.parseEther("1000"));
    
    // user1进行质押（假设质押100 USDT，期限1天）
    try {
        await staking.connect(user1).stake(100, 0); // 100 USDT, 1天期限
        console.log("User1 staking successful");
    } catch (error) {
        console.log("Staking error:", error.message);
    }
    
    // 3. 检查质押记录
    console.log("\n3. 质押记录:");
    const userIndex = await staking.userIndex(user1.address);
    console.log("User1 stake count:", userIndex.toString());
    
    // 4. 测试流动性（如果有足够的代币）
    console.log("\n4. 流动性测试:");
    const pairBalance = await ola.balanceOf(addresses.pair);
    console.log("Pair OLA balance:", ethers.utils.formatEther(pairBalance));
    
    console.log("\n=== 测试完成 ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
```

### 7. 部署和测试命令

```bash
# 1. 编译合约
npx hardhat compile

# 2. 部署OLA系统
npx hardhat run scripts/deployOLASystem.js --network localhost

# 3. 运行测试
npx hardhat run scripts/testOLASystem.js --network localhost

# 4. 运行单元测试
npx hardhat test
```

### 8. 注意事项

#### 技术要求
1. **库依赖**: 需要安装OpenZeppelin和PRB-Math依赖
2. **精度计算**: 注意代币精度和数学计算精度
3. **权限管理**: 确保合约owner权限正确设置
4. **Gas优化**: 复杂的DeFi合约可能有较高的Gas消耗

#### 部署顺序
1. ✅ 基础设施（WBNB、Factory、Router）已存在
2. 🔄 部署USDT测试代币
3. 🔄 部署Staking合约
4. 🔄 部署OLA合约
5. 🔄 配置合约关联和权限
6. 🔄 创建交易对和初始流动性

#### 风险提醒
- 合约代码复杂，包含多种DeFi机制
- 需要仔细测试所有功能模块
- 建议先在测试网络充分验证
- 注意合约间的循环依赖关系

### 9. 目录结构

部署完成后的项目结构：
```
bsc-test/
├── contracts/
│   ├── interfaces/
│   │   ├── IOLA.sol
│   │   ├── IStaking.sol
│   │   └── ILiquidityStaking.sol
│   ├── abstract/
│   │   ├── OLABase.sol
│   │   └── StakingBase.sol
│   ├── utils/
│   │   ├── FundRelay.sol
│   │   └── Helper.sol
│   ├── OLA.sol
│   ├── Staking.sol
│   └── [existing contracts...]
├── scripts/
│   ├── deployOLASystem.js
│   └── testOLASystem.js
├── deployed-addresses.json
└── [other files...]
```

这个部署方案提供了完整的OLA生态系统在本地环境的部署路径，包含了所有必要的步骤和测试验证。