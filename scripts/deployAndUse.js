const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 部署并测试 PancakeSwap DEX...");
    
    const [deployer] = await ethers.getSigners();
    console.log("👤 部署账户:", deployer.address);
    console.log("💰 账户余额:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

    // 1. 部署 WBNB
    console.log("\n📦 1. 部署 WBNB 合约...");
    const WBNB = await ethers.getContractFactory("WBNB");
    const wbnb = await WBNB.deploy();
    await wbnb.waitForDeployment();
    console.log("✅ WBNB 部署完成:", await wbnb.getAddress());

    // 2. 部署 PancakeFactory
    console.log("\n📦 2. 部署 PancakeFactory 合约...");
    const PancakeFactory = await ethers.getContractFactory("PancakeFactory");
    const factory = await PancakeFactory.deploy(deployer.address);
    await factory.waitForDeployment();
    console.log("✅ PancakeFactory 部署完成:", await factory.getAddress());

    // 3. 部署 PancakeRouter
    console.log("\n📦 3. 部署 PancakeRouter 合约...");
    const PancakeRouter = await ethers.getContractFactory("PancakeRouter");
    const router = await PancakeRouter.deploy(await factory.getAddress(), await wbnb.getAddress());
    await router.waitForDeployment();
    console.log("✅ PancakeRouter 部署完成:", await router.getAddress());

    // 4. 创建测试代币
    console.log("\n🪙 4. 创建测试代币...");
    const TestToken = await ethers.getContractFactory("TestToken");
    
    const tokenA = await TestToken.deploy("Token A", "TKA", 1000000);
    await tokenA.waitForDeployment();
    console.log("✅ Token A (TKA) 部署完成:", await tokenA.getAddress());
    
    const tokenB = await TestToken.deploy("Token B", "TKB", 1000000);
    await tokenB.waitForDeployment();
    console.log("✅ Token B (TKB) 部署完成:", await tokenB.getAddress());

    // 5. 向 WBNB 存入一些 ETH
    console.log("\n💱 5. 向 WBNB 存入 ETH...");
    const depositAmount = ethers.parseEther("10");
    await wbnb.deposit({ value: depositAmount });
    console.log("✅ 存入", ethers.formatEther(depositAmount), "ETH 到 WBNB");

    // 6. 验证代币余额
    console.log("\n📊 验证代币余额...");
    const tkaBalance = await tokenA.balanceOf(deployer.address);
    const tkbBalance = await tokenB.balanceOf(deployer.address);
    const wbnbBalance = await wbnb.balanceOf(deployer.address);
    
    console.log("   TKA 余额:", ethers.formatEther(tkaBalance));
    console.log("   TKB 余额:", ethers.formatEther(tkbBalance));
    console.log("   WBNB 余额:", ethers.formatEther(wbnbBalance));

    // 7. 授权 Router 使用代币
    console.log("\n🔓 7. 授权 Router 使用代币...");
    const maxApproval = ethers.MaxUint256;
    
    await tokenA.approve(await router.getAddress(), maxApproval);
    await tokenB.approve(await router.getAddress(), maxApproval);
    await wbnb.approve(await router.getAddress(), maxApproval);
    console.log("✅ 授权完成");

    // 8. 创建交易对并添加流动性
    console.log("\n🏊 8. 创建交易对并添加流动性...");
    
    const tokenAAmount = ethers.parseEther("1000");
    const tokenBAmount = ethers.parseEther("2000");
    
    console.log("  添加 TKA/TKB 流动性...");
    const addLiquidityTx = await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        tokenAAmount,
        tokenBAmount,
        0,
        0,
        deployer.address,
        Math.floor(Date.now() / 1000) + 300
    );
    await addLiquidityTx.wait();
    
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    console.log("✅ TKA/TKB 交易对创建:", pairAddress);

    // 9. 测试代币交换
    console.log("\n🔄 9. 测试代币交换...");
    const swapAmount = ethers.parseEther("100");
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];
    
    const amountsBefore = await router.getAmountsOut(swapAmount, path);
    console.log("   预计交换:", ethers.formatEther(swapAmount), "TKA ->", ethers.formatEther(amountsBefore[1]), "TKB");
    
    const swapTx = await router.swapExactTokensForTokens(
        swapAmount,
        0,
        path,
        deployer.address,
        Math.floor(Date.now() / 1000) + 300
    );
    await swapTx.wait();
    console.log("✅ 交换完成");

    // 10. 显示最终余额
    console.log("\n📊 10. 最终余额:");
    console.log("   TKA:", ethers.formatEther(await tokenA.balanceOf(deployer.address)));
    console.log("   TKB:", ethers.formatEther(await tokenB.balanceOf(deployer.address)));
    console.log("   WBNB:", ethers.formatEther(await wbnb.balanceOf(deployer.address)));

    console.log("\n🎉 PancakeSwap 部署和测试完成！");
    
    // 11. ETH -> Token 交换测试
    console.log("\n💱 11. 测试 ETH -> TKA 交换...");
    const wbnbTkaAmount = ethers.parseEther("2");
    const tokenAForWBNB = ethers.parseEther("200");
    
    // 先创建 WBNB/TKA 交易对
    console.log("   创建 WBNB/TKA 交易对...");
    await router.addLiquidity(
        await wbnb.getAddress(),
        await tokenA.getAddress(),
        wbnbTkaAmount,
        tokenAForWBNB,
        0,
        0,
        deployer.address,
        Math.floor(Date.now() / 1000) + 300
    );
    
    const wbnbTkaPairAddress = await factory.getPair(await wbnb.getAddress(), await tokenA.getAddress());
    console.log("✅ WBNB/TKA 交易对创建:", wbnbTkaPairAddress);
    
    // 执行 ETH -> TKA 交换
    const ethSwapAmount = ethers.parseEther("0.5");
    const ethToTokenPath = [await wbnb.getAddress(), await tokenA.getAddress()];
    
    const ethAmountsOut = await router.getAmountsOut(ethSwapAmount, ethToTokenPath);
    console.log("   预期获得:", ethers.formatEther(ethAmountsOut[1]), "TKA");
    
    await router.swapExactETHForTokens(
        0, 
        ethToTokenPath,
        deployer.address,
        Math.floor(Date.now() / 1000) + 300,
        { value: ethSwapAmount }
    );
    console.log("✅ ETH -> TKA 交换完成");

    // 最终状态
    console.log("\n📊 最终状态:");
    console.log("=====================================");
    console.log("🔧 合约地址:");
    console.log("   WBNB:", await wbnb.getAddress());
    console.log("   Factory:", await factory.getAddress());
    console.log("   Router:", await router.getAddress());
    console.log("   Token A (TKA):", await tokenA.getAddress());
    console.log("   Token B (TKB):", await tokenB.getAddress());
    console.log("");
    console.log("🏊 交易对:");
    console.log("   TKA/TKB Pair:", pairAddress);
    console.log("   WBNB/TKA Pair:", wbnbTkaPairAddress);
    console.log("");
    console.log("💰 最终余额:");
    console.log("   TKA:", ethers.formatEther(await tokenA.balanceOf(deployer.address)));
    console.log("   TKB:", ethers.formatEther(await tokenB.balanceOf(deployer.address)));
    console.log("   WBNB:", ethers.formatEther(await wbnb.balanceOf(deployer.address)));
    console.log("   ETH:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));
    console.log("");
    console.log("🎉 PancakeSwap DEX 完整测试成功！");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 测试失败:", error);
        process.exit(1);
    });