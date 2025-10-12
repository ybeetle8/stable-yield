# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个完整的 DeFi 生态系统项目，包含：
- **OLA 代币**: 具有完整税费机制的 DeFi 代币
- **Staking 系统**: 支持多档期质押、推荐奖励、复利计算
- **PancakeSwap DEX**: Uniswap V2 兼容的去中心化交易所
- **测试代币**: USDT、WBNB 等测试用代币

## 核心命令

### 文档说明
文档都写到 notes 目录,用md格式, 并用合适的中文命名.

### 开发环境
```bash
# 安装依赖
npm install

# 编译合约
npm run compile
# 或
npx hardhat compile

# 启动本地节点 (保持运行)
npm run node
# 或
npx hardhat node
```

### 部署
```bash
# 部署完整 OLA 系统 (USDT + OLA + Staking + PancakeSwap)
npm run deploy-ola
# 或
npx hardhat run scripts/deployOLASystem.js --network localhost

# 部署 PancakeSwap DEX
npm run deploy-pancake

# 一键部署并测试 PancakeSwap
npm run deploy-and-use
```

### 测试
```bash
# 运行所有测试
npm run test-all
# 或
./run-all-tests.sh

# 运行单个测试
npm test                    # HelloWorld 测试
npm run test-network       # 网络连接测试
npm run test-direct        # 合约直接调用测试
npm run test-system        # OLA 系统集成测试

# 使用 Hardhat 运行特定测试文件
npx hardhat test test/OLASystem.test.js --network localhost
```

## 架构设计

### 合约层次结构

项目采用**抽象基类模式**来分离核心逻辑和环境配置：

```
contracts/
├── abstract/
│   ├── OLABase.sol (1472行)        # OLA 核心业务逻辑
│   └── StakingBase.sol (1393行)    # Staking 核心业务逻辑
├── OLA.sol                          # 主网环境配置 (30天周期)
├── Staking.sol                      # 主网环境配置 (日复利)
└── interfaces/                      # 完整接口定义
    ├── IOLA.sol                     # OLA 接口
    └── IStaking.sol                 # Staking 接口
```

**关键点**:
- 所有核心功能在 `abstract/` 目录的基类中实现
- `OLA.sol` 和 `Staking.sol` 仅继承基类并配置环境参数
- 修改业务逻辑时应编辑 `OLABase.sol` 或 `StakingBase.sol`
- 修改时间周期或 APY 参数时编辑 `OLA.sol` 或 `Staking.sol`

### OLA 代币系统

OLA 代币实现了完整的 DeFi 税费机制：

**税费结构**:
- 买入税 (3%): 1% burn + 2% LP
- 卖出税 (3%): 1.5% marketing + 1.5% LP
- 利润税 (25%): 对超过初始购买成本的卖出征收

**核心机制**:
- **预售期**: 30天预售期，期间可设置白名单
- **成本追踪**: 追踪每个地址的购买成本用于利润税计算
- **自动流动性**: LP 税费自动添加到流动性池
- **黑白名单**: 支持地址黑白名单管理

**合约交互**:
```
OLA ←→ Staking (双向集成)
 ↓
Router ←→ Factory ←→ Pair (OLA/USDT)
 ↓
USDT / WBNB
```

### Staking 系统

质押系统支持多档期质押和复杂的奖励机制：

**质押档位**:
- 1天: 0.3% 收益
- 7天: 4.28% 收益
- 15天: 16.1% 收益
- 30天: 56.31% 收益

**推荐系统**:
- 直推奖励: 5% (需绑定推荐人)
- 团队奖励: V1-V7 层级奖励 (0.5%-5%)
- 推荐人绑定: 永久且不可更改

**sOLA 机制**:
- 质押 OLA 时铸造等量 sOLA
- sOLA 不可转账，仅用于记录质押份额
- 解除质押时销毁 sOLA

**复利计算**:
- 使用 `@prb/math` 库进行高精度复利计算
- 基于区块时间戳计算收益
- 支持提前解除质押

### PancakeSwap DEX

标准的 Uniswap V2 兼容实现：

**核心合约**:
- `PancakeFactory`: 创建交易对，管理手续费
- `PancakeRouter`: 处理交易路由和流动性操作
- `PancakePair`: 自动做市商交易对 (LP 代币)

**AMM 算法**: x * y = k 恒定乘积

## 部署流程

OLA 系统部署顺序至关重要，必须按以下顺序执行 (参考 `scripts/deployOLASystem.js`):

1. **部署基础代币**: USDT, WBNB
2. **部署 PancakeSwap**: Factory → Router
3. **部署辅助合约**: FundRelay (临时地址)
4. **部署 Staking**: 传入 USDT、Router、rootAddress
5. **部署 OLA**: 传入 USDT、Router、Staking、marketing 地址
6. **配置关联**:
   - Staking.setOLA(ola_address)
   - 重新部署 FundRelay 并传入正确的 OLA 地址
   - OLA.setFundRelay(fundRelay_address)
7. **创建交易对**: Factory.createPair(OLA, USDT)
8. **初始化**: 设置交易对地址、添加初始流动性

部署后合约地址会保存到 `deployed-addresses.json`。

## 测试策略

测试分为四个层次：

1. **网络连接测试** (`test/network-connection-test.js`):
   - 验证本地节点连接
   - 确认合约已部署
   - 基础合约可访问性

2. **直接合约测试** (`test/contract-direct-test.js`):
   - 读取已部署的合约地址
   - 测试代币基本功能 (name, symbol, balance)
   - 测试质押基本状态查询

3. **单元测试** (`test/HelloWorld.test.js`):
   - Hardhat 环境测试
   - 合约部署和调用

4. **系统集成测试** (`test/OLASystem.test.js`):
   - 完整的 OLA + Staking 工作流
   - 质押、推荐、奖励分发测试
   - 流动性和交易测试

**测试前提**: 必须先运行 `npm run node` 启动本地节点，然后运行 `npm run deploy-ola` 部署合约。

## 关键文件位置

- **核心业务逻辑**: `contracts/abstract/OLABase.sol` 和 `contracts/abstract/StakingBase.sol`
- **部署脚本**: `scripts/deployOLASystem.js`
- **合约地址**: `deployed-addresses.json`
- **网络配置**: `hardhat.config.js`

## Solidity 版本

- 使用 **Solidity 0.8.28**
- 启用优化器 (runs: 200)
- 使用 `viaIR: true` 编译选项

## 依赖库

- `@openzeppelin/contracts ^5.4.0`: 标准 ERC20、安全工具
- `@prb/math ^4.1.0`: 高精度数学运算 (复利计算)
- `hardhat ^2.26.3`: 开发框架

## 网络配置

- **本地网络**: http://127.0.0.1:8545 (Chain ID: 31337)
- **BSC 主网**: https://bsc-dataseed1.binance.org/ (Chain ID: 56)
- **BSC 测试网**: https://data-seed-prebsc-1-s1.binance.org:8545/ (Chain ID: 97)

部署到测试网时需在 `hardhat.config.js` 中配置私钥。


参考的:
https://olafi.xyz/#/index

Token OLA:  代码: othercode/OLA
https://bscscan.com/token/0xfc548e35c4a3603b09204acead0cd16908423eea

Staked OLA:  代码: othercode/OLA-Staking
https://bscscan.com/token/0x39f403ca78c08317a03401acff4113d992b3c071

StakingBase.sol  代码: othercode/OLA-Staking
https://bscscan.com/address/0x39f403ca78c08317a03401acff4113d992b3c071#code

LP质押合约   代码: othercode/LiquidityStaking
https://bscscan.com/address/0xfb9690de036711027c062d043ec3fde4ab5849fd


新合约需求: 
代币铸造和分发 (1亿 SYI)
交易时,不要买卖税和盈利税
去掉LP质押功能,因为没有收交易费
质押收益分配可能会有变动
普通质押的奖励希望能随时领取.  


查区块号
curl -s -X POST https://binance.llamarpc.com -H "Content-Type: application/json" --data  '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -r '.result' | xargs printf "%d\n"



打开带 Pancake 的节点
npx hardhat node --fork https://binance.llamarpc.com --fork-block-number 63612920
npx hardhat node --fork https://1rpc.io/bnb --fork-block-number 64340000
npx hardhat node --fork https://rpc.tornadoeth.cash/bsc --fork-block-number 64340000


可用替代节点（已本机实测，按块号查询能正常返回，而不是 missing trie node）
  - https://1rpc.io/bnb
  - https://binance.llamarpc.com
  - https://rpc.tornadoeth.cash/bsc



