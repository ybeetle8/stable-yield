# SYI Staking 合约部署说明

## 文件结构

```
contracts/SYI-Staking/
├── interfaces/
│   ├── ISYI.sol           # SYI 代币接口
│   └── IStaking.sol       # Staking 合约接口
├── abstract/
│   └── StakingBase.sol    # Staking 核心业务逻辑 (1393 行)
└── mainnet/
    └── Staking.sol        # 主网环境配置
```

## 合约特性

- **质押代币**: Staked SYI (sSYI)
- **质押档位**: 1天/7天/15天/30天
- **推荐系统**: V1-V7 层级奖励
- **复利计算**: 每日复利
- **赎回手续费**: 1%

## 快速开始

### 1. 编译合约
```bash
npx hardhat compile
```

### 2. 部署合约
确保本地节点运行中（BSC Fork）:
```bash
npx hardhat run scripts/deploySYIStaking.js --network localhost
```

### 3. 测试部署
```bash
npx hardhat run scripts/testSYIStaking.js --network localhost
```

## 部署参数

- **USDT**: `0x55d398326f99059fF775485246999027B3197955` (BSC 主网)
- **PancakeSwap Router**: `0x10ED43C718714eb63d5aA57B78B54704E256024E` (BSC 主网)
- **Root 地址**: 本地测试账户[0]
- **Fee Recipient**: 本地测试账户[1]

## 重要提示

⚠️ **此合约需要与 SYI 代币合约配合使用**

部署流程:
1. 部署 Staking 合约 ✅ （本次完成）
2. 部署 SYI 代币合约 （待完成）
3. 调用 `staking.setSYI(syiAddress)`
4. 创建 SYI/USDT 交易对
5. 测试完整质押流程

## 合约地址

部署后地址保存在 `syi-staking-deployment.json`

## 依赖库

- OpenZeppelin Contracts v5.4.0
- PRB Math v4.1.0
- Uniswap V2 Core & Periphery

## Solidity 版本

- 0.8.28
- 优化器: 启用 (runs: 200)
- viaIR: true
