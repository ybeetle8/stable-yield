# Hardhat Fork BSC "missing trie node" 错误解决方案

## 问题描述

在使用 Hardhat fork BSC 主网时遇到错误：

```
Error HH604: Error running JSON-RPC server: The response reported error `-32000`: `missing trie node`
```

**命令**：
```bash
npx hardhat node --fork https://bsc-dataseed.binance.org/
```

---

## 问题根本原因

### 1. Archive Node vs Full Node

- **Full Node（完整节点）**：只保留最近 16-128 个区块的完整状态
- **Archive Node（归档节点）**：保留所有历史区块的完整状态

BSC 的**公共 RPC 端点（如 `bsc-dataseed.binance.org`）是 Full Node**，不是 Archive Node。

### 2. Forking 的工作原理

当你 fork 一个网络时：
- Hardhat 会"固定"到某个区块（默认是最新区块）
- 如果 fork 运行时间较长，这个区块会变成"历史"区块
- 查询历史状态需要 Archive Node 支持

### 3. Hardhat 版本问题

- **Hardhat v2.22.3, v2.21.0** 等较新版本存在 BSC forking 兼容性问题
- 社区报告 **降级到 v2.17.1 或 v2.14.0** 可以解决

**当前项目使用**：Hardhat v2.26.3（可能存在问题）

---

## 解决方案

### 方案 1：降级 Hardhat 版本（推荐，最简单）

#### 步骤 1: 卸载当前版本
```bash
npm uninstall hardhat
```

#### 步骤 2: 安装稳定版本
```bash
npm install --save-dev hardhat@2.17.1
```

#### 步骤 3: 验证版本
```bash
npx hardhat --version
```

#### 步骤 4: 重新尝试 fork
```bash
npx hardhat node --fork https://bsc-dataseed.binance.org/
```

**优点**：
- ✅ 最简单，无需修改配置
- ✅ 社区验证有效（多个用户报告成功）
- ✅ 继续使用免费的公共 RPC

**缺点**：
- ⚠️ 使用旧版本 Hardhat，可能缺少新功能

---

### 方案 2：使用支持 Archive 的免费 RPC（推荐）

使用提供 Archive 功能的免费 RPC 服务。

#### 可用的免费 Archive RPC

##### Ankr（推荐）
```bash
npx hardhat node --fork https://rpc.ankr.com/bsc
```

**特点**：
- ✅ 免费使用
- ✅ 支持 75+ 区块链
- ✅ 全球分布式节点
- 🌐 官网：https://www.ankr.com/rpc/bsc/

##### NodeReal
```bash
npx hardhat node --fork https://bsc-mainnet.nodereal.io/v1/YOUR_API_KEY
```

**特点**：
- ✅ 高性能基础设施
- ✅ 免费层可用
- 🔑 需要注册并获取 API Key
- 🌐 官网：https://nodereal.io/api-marketplace/bsc-rpc

##### 其他免费 RPC（未验证 Archive 支持）
```bash
# PublicNode
https://bsc.publicnode.com

# dRPC
https://bsc.drpc.org

# 1RPC
https://1rpc.io/bnb
```

#### 配置方法

**方法 A: 命令行参数**
```bash
npx hardhat node --fork https://rpc.ankr.com/bsc
```

**方法 B: 配置文件**
```javascript
// hardhat.config.js
module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: "https://rpc.ankr.com/bsc",
        // 可选：锁定特定区块
        // blockNumber: 42000000
      }
    }
  }
};
```

然后直接运行：
```bash
npx hardhat node
```

**优点**：
- ✅ 使用最新版本 Hardhat
- ✅ 免费（有限额）
- ✅ Archive 功能支持

**缺点**：
- ⚠️ 免费层可能有请求限额
- ⚠️ 部分服务需要注册

---

### 方案 3：指定最近的区块号

避免查询过于久远的历史数据。

#### 步骤 1: 获取最新区块号

访问 https://bscscan.com/ 查看当前区块号，或使用命令：

```bash
curl -X POST https://bsc-dataseed.binance.org/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

#### 步骤 2: 使用最近的区块

```bash
# 假设当前区块号是 42000000，使用稍早的区块（减去 100）
npx hardhat node --fork https://bsc-dataseed.binance.org/ --fork-block-number 41999900
```

或在配置文件中：

```javascript
// hardhat.config.js
module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: "https://bsc-dataseed.binance.org/",
        blockNumber: 41999900  // 使用最近的区块
      }
    }
  }
};
```

**优点**：
- ✅ 减少对 Archive 数据的依赖
- ✅ 继续使用免费公共 RPC

**缺点**：
- ⚠️ 需要手动更新区块号
- ⚠️ 如果 fork 运行时间长，仍可能出错

---

### 方案 4：使用付费 Archive Node（生产环境）

对于需要稳定 Archive 功能的生产环境。

#### QuickNode（推荐用于生产）

**特点**：
- 企业级基础设施
- 全球自动扩展
- 支持 76 条链

**价格**：
- 免费试用
- 付费方案从 $9/月起

**配置**：
```bash
# 1. 注册 QuickNode: https://www.quicknode.com/chains/bsc
# 2. 创建 BSC Endpoint（选择 Archive 模式）
# 3. 获取 HTTP URL

npx hardhat node --fork https://your-endpoint.bsc.quiknode.pro/YOUR_API_KEY/
```

#### Chainstack

**特点**：
- Bolt 快速同步技术
- Archive 节点支持

**价格**：
- Archive 节点从 $49/月起

**配置**：
```bash
# 1. 注册 Chainstack: https://chainstack.com/
# 2. 部署 BSC Archive 节点
# 3. 使用提供的 RPC URL

npx hardhat node --fork https://your-endpoint.chainstack.com/YOUR_KEY/
```

#### Alchemy（新支持 BSC）

**特点**：
- 可靠的基础设施
- 完善的开发者工具

**价格**：
- 免费层可用
- 付费方案按使用量计费

---

## 推荐方案选择

### 开发测试环境（当前项目）

**推荐顺序**：

1. **方案 2 (Ankr 免费 RPC)** ✅
   ```bash
   npx hardhat node --fork https://rpc.ankr.com/bsc
   ```
   - 最简单，无需降级
   - 免费且支持 Archive

2. **方案 1 (降级 Hardhat)** 🔄
   ```bash
   npm install --save-dev hardhat@2.17.1
   npx hardhat node --fork https://bsc-dataseed.binance.org/
   ```
   - 如果 Ankr 有问题，使用此方案

3. **方案 3 (指定区块号)** 📌
   ```bash
   npx hardhat node --fork https://bsc-dataseed.binance.org/ --fork-block-number 41999900
   ```
   - 作为后备方案

### 生产环境

**使用方案 4（付费 Archive Node）**：
- QuickNode 或 Chainstack
- 稳定性和性能保障
- 完整的 Archive 功能

---

## 完整配置示例

### 多环境配置（hardhat.config.js）

```javascript
require("@nomicfoundation/hardhat-toolbox");

const ANKR_BSC_RPC = "https://rpc.ankr.com/bsc";
const BINANCE_BSC_RPC = "https://bsc-dataseed.binance.org/";
const QUICKNODE_RPC = process.env.QUICKNODE_URL || "";

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // 本地开发网络（无 fork）
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // Fork BSC 主网（开发环境 - 使用 Ankr）
    hardhat: {
      forking: {
        url: ANKR_BSC_RPC,
        // 可选：指定区块号
        // blockNumber: 42000000,
      },
      chainId: 56, // 保持与 BSC 主网一致
    },

    // Fork BSC 主网（生产环境 - 使用 QuickNode）
    hardhat_prod: {
      forking: {
        url: QUICKNODE_RPC,
        enabled: !!QUICKNODE_RPC,
      },
      chainId: 56,
    },

    // 真实 BSC 测试网
    bsc_testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },

    // 真实 BSC 主网
    bsc_mainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
```

### 环境变量配置（.env）

```bash
# .env.example
QUICKNODE_URL=https://your-endpoint.bsc.quiknode.pro/YOUR_API_KEY/
NODEREAL_API_KEY=your_nodereal_api_key
PRIVATE_KEY=your_private_key_for_deployment
```

---

## BSC RPC 端点完整列表（2025）

### 官方公共端点（Full Node）

| 端点 | URL | 说明 |
|------|-----|------|
| Binance 官方 | `https://bsc-dataseed.binance.org/` | 主网 Full Node |
| Binance 1 | `https://bsc-dataseed1.binance.org/` | 备用端点 |
| Binance 2 | `https://bsc-dataseed2.binance.org/` | 备用端点 |
| DeFibit | `https://bsc-dataseed1.defibit.io/` | 社区端点 |

⚠️ **注意**：这些端点都是 Full Node，不支持完整的 Archive 功能。

### 免费 Archive/高级 RPC

| 提供商 | URL | Archive 支持 | 注册要求 |
|--------|-----|--------------|----------|
| **Ankr** | `https://rpc.ankr.com/bsc` | ✅ | ❌ 无需注册 |
| **NodeReal** | `https://bsc-mainnet.nodereal.io/v1/[API_KEY]` | ✅ | ✅ 需要注册 |
| **PublicNode** | `https://bsc.publicnode.com` | ⚠️ 未知 | ❌ |
| **dRPC** | `https://bsc.drpc.org` | ⚠️ 未知 | ❌ |
| **1RPC** | `https://1rpc.io/bnb` | ⚠️ 未知 | ❌ |

### 付费 Archive Node

| 提供商 | 起步价 | Archive | 特点 |
|--------|--------|---------|------|
| **QuickNode** | $9/月 | ✅ | 全球分布，自动扩展 |
| **Chainstack** | $49/月 | ✅ | Bolt 快速同步 |
| **Alchemy** | 免费层可用 | ✅ | 开发者工具完善 |
| **GetBlock** | 按请求计费 | ✅ | 多链支持 |

---

## 验证 Archive 功能

使用以下脚本验证 RPC 是否支持 Archive：

```javascript
// scripts/checkArchive.js
async function main() {
  const provider = ethers.provider;

  // 获取当前区块号
  const currentBlock = await provider.getBlockNumber();
  console.log("当前区块号:", currentBlock);

  // 尝试查询较早的区块（100,000 个区块前）
  const oldBlock = currentBlock - 100000;

  try {
    const balance = await provider.getBalance(
      "0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199",
      oldBlock
    );
    console.log(`✅ Archive 支持：可以查询区块 ${oldBlock} 的余额`);
    console.log("余额:", ethers.formatEther(balance), "BNB");
  } catch (error) {
    console.log(`❌ Archive 不支持：无法查询历史区块 ${oldBlock}`);
    console.log("错误:", error.message);
  }
}

main().catch(console.error);
```

运行：
```bash
npx hardhat run scripts/checkArchive.js --network hardhat
```

---

## 快速测试

### 测试 1: Ankr RPC (推荐)

```bash
# 1. 直接使用 Ankr
npx hardhat node --fork https://rpc.ankr.com/bsc

# 2. 在新终端测试
npx hardhat console --network localhost
> await ethers.provider.getBlockNumber()
```

### 测试 2: 降级 Hardhat

```bash
# 1. 安装旧版本
npm install --save-dev hardhat@2.17.1

# 2. 使用 Binance 官方 RPC
npx hardhat node --fork https://bsc-dataseed.binance.org/

# 3. 测试
npx hardhat console --network localhost
> await ethers.provider.getBlockNumber()
```

---

## 常见问题 FAQ

### Q1: 我应该使用哪个方案？

**A**: 开发环境优先使用 **方案 2 (Ankr RPC)**，简单免费且支持 Archive。

### Q2: Ankr 有请求限额吗？

**A**: Ankr 免费层有限额，但对于开发测试通常足够。如果遇到限制，可以：
- 注册 Ankr 账号获取更高限额
- 切换到其他 RPC 提供商
- 降级 Hardhat 使用官方 RPC

### Q3: 生产环境应该用哪个？

**A**: 生产环境推荐使用 **付费 Archive Node**（QuickNode 或 Chainstack），保证稳定性和性能。

### Q4: fork 时如何指定 chainId？

**A**: 在 hardhat.config.js 中配置：

```javascript
networks: {
  hardhat: {
    forking: {
      url: "https://rpc.ankr.com/bsc",
    },
    chainId: 56, // BSC 主网 chainId
  }
}
```

### Q5: 如何在测试中动态切换 RPC？

**A**: 使用环境变量：

```javascript
const BSC_RPC = process.env.BSC_RPC || "https://rpc.ankr.com/bsc";

networks: {
  hardhat: {
    forking: {
      url: BSC_RPC,
    }
  }
}
```

然后：
```bash
BSC_RPC=https://your-custom-rpc.com npx hardhat node
```

---

## 总结

### 立即解决（开发环境）

**最快方案**：
```bash
npx hardhat node --fork https://rpc.ankr.com/bsc
```

**后备方案**（如果 Ankr 不可用）：
```bash
npm install --save-dev hardhat@2.17.1
npx hardhat node --fork https://bsc-dataseed.binance.org/
```

### 长期方案（生产环境）

1. 注册 QuickNode/Chainstack 账号
2. 创建 BSC Archive 端点
3. 配置到 hardhat.config.js
4. 使用环境变量管理密钥

### 关键要点

- ✅ **Archive Node** 是 fork 历史区块的必要条件
- ✅ **Ankr** 提供免费的 Archive 功能，适合开发
- ✅ **Hardhat 版本** 可能影响 BSC forking 兼容性
- ✅ **生产环境** 建议使用付费 Archive Node

---

## 相关资源

- **Hardhat Forking 文档**: https://hardhat.org/hardhat-network/docs/guides/forking-other-networks
- **BSC 开发者文档**: https://docs.bnbchain.org/
- **Ankr RPC**: https://www.ankr.com/rpc/bsc/
- **NodeReal**: https://nodereal.io/api-marketplace/bsc-rpc
- **QuickNode**: https://www.quicknode.com/chains/bsc
- **BSCScan**: https://bscscan.com/
