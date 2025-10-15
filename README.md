# SYI 系统部署与测试命令

**最新版本**: v2.0 - 完全无税版本 (2025-10-13) 我已建立了主网的镜像节点,并部署了合约,以供开发与测试

## 已部署的合约地址
 - SYI币: "0x92e3cf3b7f6B08CDBA0907f5Ea0414bF55df2d92"
 - Staking质押合约: "0xf6cC8898F119194CA4938c5f6564a20d9bc734bB"
 - USDT币: "0x55d398326f99059fF775485246999027B3197955"
 - 质押费钱包(1%): "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 - 需要用到的 abi文件在: abi/SYI.json , abi/Staking.json
 - 重要: 为了方便测试质押,合约已改为3秒钟就算一天, 例如: 质押 30天, 现实中等 90秒,就完成了

## 钱包用测试RPC 
 - 可在MetaMask 钱包中添加这个RPC (记得把代币SYI与USDT 也添加了)
 - 网络名称: GoChain Testnet
 - RPC: https://bsc.ai-hello.cn/
 - ChainID:	31337
 - 币名:  GO (bnb的别名)

## 测试代码及构建流程

### 环境要求
- Node.js 版本 >= 22
- Git

### 快速开始

```bash
# 第一步: 克隆代码
git clone https://github.com/ybeetle8/stable-yield.git

# 第二步: 进入项目目录
cd stable-yield

# 第三步: 安装依赖
npm install

# 第四步: 编译合约
npx hardhat compile

# 第五步: 运行测试脚本（向你的钱包,发送bnb 与 USDT ,进代码改下你的地址）
npx hardhat run scripts/sendBnbUsdt.js --network localhost
```

### 常用测试脚本

```bash

# 发币到自已的钱包: 进代码改下你的地址 运行后奖 发送bnb 100 与 USDT 10000, 到你的钱包地址
npx hardhat run scripts/sendBnbUsdt.js --network localhost

# 后端需要用到的监听事件测试代码 打开后会打印所有事件 (后端只 拿绑定推荐人的就行了 )
npx hardhat run scripts/monitorStakingEvents.js --network localhost






# 查看测试账户余额
npx hardhat run scripts/printTestAccounts.js --network localhost




# 测试质押功能
npx hardhat run scripts/testSYIStaking.js --network localhost

# 测试节点层级
npx hardhat run scripts/testNodeTier.js --network localhost

# 监听质押事件
npx hardhat run scripts/monitorStakingEvents.js --network localhost
```

### 相关文档
    notes/前端链上数据获取指南.md 



### 故障排除

如果遇到编译错误 `HH411: The library @uniswap/v2-core is not installed`，请确保：
1. 已运行 `npm install`
2. `lib/` 目录存在且包含 Uniswap 合约文件
3. `hardhat.config.js` 配置了 `hardhat-preprocessor` 插件


