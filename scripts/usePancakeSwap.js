const { ethers } = require("hardhat");

// 部署后的合约地址 (根据实际部署结果更新)
const CONTRACTS = {
    WBNB: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    Factory: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    Router: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    TokenA: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    TokenB: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"
};

async function main() {
    console.log("🔧 连接到已部署的 PancakeSwap 合约...");
    
    const [user] = await ethers.getSigners();
    console.log("👤 用户地址:", user.address);

    try {
        // 连接合约
        const router = await ethers.getContractAt("PancakeRouter", CONTRACTS.Router);
        const tokenA = await ethers.getContractAt("TestToken", CONTRACTS.TokenA);
        const tokenB = await ethers.getContractAt("TestToken", CONTRACTS.TokenB);
        const wbnb = await ethers.getContractAt("WBNB", CONTRACTS.WBNB);

        // 验证合约连接
        console.log("🔍 验证合约连接...");
        const routerAddress = await router.getAddress();
        console.log("   Router 地址:", routerAddress);

        console.log("\n📊 当前余额:");
        const tkaBalance = await tokenA.balanceOf(user.address);
        const tkbBalance = await tokenB.balanceOf(user.address);
        const wbnbBalance = await wbnb.balanceOf(user.address);
        
        console.log("   TKA:", ethers.formatEther(tkaBalance));
        console.log("   TKB:", ethers.formatEther(tkbBalance));
        console.log("   WBNB:", ethers.formatEther(wbnbBalance));
    } catch (error) {
        console.log("❌ 合约连接失败，可能需要重新部署 PancakeSwap");
        console.log("💡 请先运行: npm run deploy-pancake");
        console.log("🔧 然后更新脚本中的合约地址");
        return;
    }

    // 1. 代币交换示例: TKA -> TKB
    console.log("\n💱 1. 代币交换示例: 50 TKA -> TKB");
    const swapAmount = ethers.parseEther("50");
    const path = [CONTRACTS.TokenA, CONTRACTS.TokenB];
    
    // 获取预期输出
    const amountsOut = await router.getAmountsOut(swapAmount, path);
    console.log("   预期获得:", ethers.formatEther(amountsOut[1]), "TKB");
    
    // 授权
    await tokenA.approve(CONTRACTS.Router, swapAmount);
    
    // 执行交换
    await router.swapExactTokensForTokens(
        swapAmount,
        0, // 最小输出 (这里设为0，实际使用时应该设置滑点保护)
        path,
        user.address,
        Math.floor(Date.now() / 1000) + 300 // 5分钟后过期
    );
    console.log("✅ 交换完成");

    // 2. ETH -> Token 交换示例
    console.log("\n💱 2. ETH -> TKA 交换示例");
    const ethAmount = ethers.parseEther("1");
    const ethToTokenPath = [CONTRACTS.WBNB, CONTRACTS.TokenA];
    
    const ethAmountsOut = await router.getAmountsOut(ethAmount, ethToTokenPath);
    console.log("   预期获得:", ethers.formatEther(ethAmountsOut[1]), "TKA");
    
    await router.swapExactETHForTokens(
        0, // 最小输出
        ethToTokenPath,
        user.address,
        Math.floor(Date.now() / 1000) + 300,
        { value: ethAmount }
    );
    console.log("✅ ETH -> TKA 交换完成");

    // 3. 添加流动性示例
    console.log("\n🏊 3. 添加流动性示例");
    const liquidityAmountA = ethers.parseEther("100");
    const liquidityAmountB = ethers.parseEther("200");
    
    // 授权
    await tokenA.approve(CONTRACTS.Router, liquidityAmountA);
    await tokenB.approve(CONTRACTS.Router, liquidityAmountB);
    
    const liquidityTx = await router.addLiquidity(
        CONTRACTS.TokenA,
        CONTRACTS.TokenB,
        liquidityAmountA,
        liquidityAmountB,
        0, // 最小A数量
        0, // 最小B数量
        user.address,
        Math.floor(Date.now() / 1000) + 300
    );
    
    const receipt = await liquidityTx.wait();
    console.log("✅ 流动性添加完成, 交易哈希:", receipt.hash);

    // 显示最终余额
    console.log("\n📊 最终余额:");
    console.log("   TKA:", ethers.formatEther(await tokenA.balanceOf(user.address)));
    console.log("   TKB:", ethers.formatEther(await tokenB.balanceOf(user.address)));
    console.log("   WBNB:", ethers.formatEther(await wbnb.balanceOf(user.address)));
    console.log("   ETH:", ethers.formatEther(await user.provider.getBalance(user.address)));

    console.log("\n🎉 PancakeSwap 使用示例完成!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 错误:", error);
        process.exit(1);
    });