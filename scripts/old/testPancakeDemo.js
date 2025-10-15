const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * 测试 PancakeSwap Demo 合约
 * 演示如何在 fork 的主网环境中调用 PancakeSwap 合约
 *
 * 使用方法:
 * 1. 启动 fork 节点: npx hardhat node --fork https://binance.llamarpc.com --fork-block-number 63482920
 * 2. 运行脚本: npx hardhat run scripts/testPancakeDemo.js --network localhost
 */

async function main() {
    console.log("========================================");
    console.log("  PancakeSwap Demo 测试");
    console.log("========================================\n");

    // 获取签名者
    const [deployer] = await ethers.getSigners();
    console.log("📝 部署者地址:", deployer.address);
    console.log("💰 部署者余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

    // 部署合约
    console.log("🚀 部署 PancakeSwapDemo 合约...");
    const PancakeSwapDemo = await ethers.getContractFactory("PancakeSwapDemo");
    const demo = await PancakeSwapDemo.deploy();
    await demo.waitForDeployment();
    const demoAddress = await demo.getAddress();
    console.log("✅ 合约地址:", demoAddress, "\n");

    // 常用代币地址
    const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
    const BUSD = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
    const USDT = "0x55d398326f99059fF775485246999027B3197955";

    console.log("========================================");
    console.log("  1. 查询 WBNB/BUSD 交易对信息");
    console.log("========================================");

    try {
        const pairAddress = await demo.getPairAddress(WBNB, BUSD);
        console.log("交易对地址:", pairAddress);

        const pairInfo = await demo.getWBNBBUSDPairInfo();
        console.log("WBNB 储备量:", ethers.formatEther(pairInfo.reserveWBNB), "WBNB");
        console.log("BUSD 储备量:", ethers.formatUnits(pairInfo.reserveBUSD, 18), "BUSD");

        // 计算价格
        const price = (Number(ethers.formatUnits(pairInfo.reserveBUSD, 18)) /
                      Number(ethers.formatEther(pairInfo.reserveWBNB))).toFixed(2);
        console.log("BNB 价格:", price, "BUSD\n");
    } catch (error) {
        console.error("❌ 查询失败:", error.message, "\n");
    }

    console.log("========================================");
    console.log("  2. 查询 1 BNB 可以兑换多少 BUSD");
    console.log("========================================");

    try {
        const amountIn = ethers.parseEther("1");
        const amountOut = await demo.getBNBPrice(amountIn);
        console.log("输入:", "1 BNB");
        console.log("输出:", ethers.formatUnits(amountOut, 18), "BUSD\n");
    } catch (error) {
        console.error("❌ 查询失败:", error.message, "\n");
    }

    console.log("========================================");
    console.log("  3. 查询 BUSD/USDT 价格");
    console.log("========================================");

    try {
        const amountIn = ethers.parseUnits("100", 18);
        const amountOut = await demo.getPrice(amountIn, BUSD, USDT);
        console.log("输入:", "100 BUSD");
        console.log("输出:", ethers.formatUnits(amountOut, 18), "USDT");
        console.log("价格:", (Number(ethers.formatUnits(amountOut, 18)) / 100).toFixed(6), "USDT/BUSD\n");
    } catch (error) {
        console.error("❌ 查询失败:", error.message, "\n");
    }

    console.log("========================================");
    console.log("  4. 查询 USDT/BUSD 交易对储备量");
    console.log("========================================");

    try {
        const reserves = await demo.getPairReserves(USDT, BUSD);
        console.log("Token0:", reserves.token0);
        console.log("Token1:", reserves.token1);
        console.log("Reserve0:", ethers.formatUnits(reserves.reserve0, 18));
        console.log("Reserve1:", ethers.formatUnits(reserves.reserve1, 18), "\n");
    } catch (error) {
        console.error("❌ 查询失败:", error.message, "\n");
    }

    console.log("========================================");
    console.log("  5. 查询通过 WBNB 中转的价格");
    console.log("========================================");

    try {
        const amountIn = ethers.parseUnits("100", 18);
        const amountOut = await demo.getPriceWithHop(amountIn, BUSD, WBNB, USDT);
        console.log("路径: BUSD -> WBNB -> USDT");
        console.log("输入:", "100 BUSD");
        console.log("输出:", ethers.formatUnits(amountOut, 18), "USDT\n");
    } catch (error) {
        console.error("❌ 查询失败:", error.message, "\n");
    }

    console.log("========================================");
    console.log("  测试完成！");
    console.log("========================================");
    console.log("\n💡 提示:");
    console.log("  - 这些数据来自 fork 的主网区块 63482920");
    console.log("  - 所有查询都是只读的，不会消耗 gas");
    console.log("  - 可以使用 swap() 函数执行实际交易 (需要代币授权)");
    console.log("  - 合约地址:", demoAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
