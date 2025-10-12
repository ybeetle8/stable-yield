# PancakeSwap Demo

演示如何在 fork 的 BSC 主网环境中调用 PancakeSwap 合约。

## 功能说明

`PancakeSwapDemo.sol` 合约提供以下功能：

### 1. 查询功能 (只读)
- `getPairAddress()` - 查询交易对地址
- `getPairReserves()` - 查询交易对储备量
- `getPrice()` - 查询直接兑换价格
- `getPriceWithHop()` - 查询通过中间代币的兑换价格
- `getBNBPrice()` - 查询 BNB 价格 (以 BUSD 计价)
- `getWBNBBUSDPairInfo()` - 查询 WBNB/BUSD 交易对详细信息

### 2. 交易功能
- `swap()` - 执行代币兑换 (需要事先授权)

## 使用步骤

### 1. 启动 Fork 节点

在终端 1 中运行：

```bash
npx hardhat node --fork https://binance.llamarpc.com --fork-block-number 63482920
```

保持这个终端运行。

### 2. 运行测试脚本

在终端 2 中运行：

```bash
npx hardhat run scripts/testPancakeDemo.js --network localhost
```

## 测试内容

脚本会自动执行以下测试：

1. ✅ 部署 `PancakeSwapDemo` 合约
2. ✅ 查询 WBNB/BUSD 交易对信息和价格
3. ✅ 查询 1 BNB 可兑换的 BUSD 数量
4. ✅ 查询 BUSD/USDT 价格
5. ✅ 查询 USDT/BUSD 交易对储备量
6. ✅ 查询通过 WBNB 中转的价格 (BUSD -> WBNB -> USDT)

## 合约地址

### BSC 主网 PancakeSwap V2
- Router: `0x10ED43C718714eb63d5aA57B78B54704E256024E`
- Factory: `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73`

### 常用代币 (BSC 主网)
- WBNB: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`
- BUSD: `0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56`
- USDT: `0x55d398326f99059fF775485246999027B3197955`

## 关键点

1. **Fork 环境**：脚本必须在 fork 的主网环境中运行，这样才能访问真实的 PancakeSwap 合约和流动性池。

2. **只读查询**：大部分函数都是 `view` 函数，不消耗 gas，可以免费查询价格和储备量。

3. **实际交易**：`swap()` 函数会执行真实交易，但在 fork 环境中不会影响主网。

4. **代币授权**：如果要使用 `swap()` 函数，需要先授权合约使用你的代币。

## 扩展用法

你可以基于这个合约继续开发：

- 添加流动性 (`addLiquidity`)
- 移除流动性 (`removeLiquidity`)
- 套利机器人
- 价格监控工具
- 自动做市策略

## 注意事项

- Fork 的区块是 `63482920`，数据是该区块时的快照
- 如果遇到 "missing trie node" 错误，尝试使用其他 RPC 节点
- 可用的 RPC 节点：
  - https://binance.llamarpc.com
  - https://1rpc.io/bnb
  - https://rpc.tornadoeth.cash/bsc
