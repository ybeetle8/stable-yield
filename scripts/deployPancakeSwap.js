const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 开始部署 PancakeSwap DEX...");
    
    const [deployer, user1, user2] = await ethers.getSigners();
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

    // 6. 授权 Router 使用代币
    console.log("\n🔓 6. 授权 Router 使用代币...");
    const maxApproval = ethers.MaxUint256;
    
    await tokenA.approve(await router.getAddress(), maxApproval);
    await tokenB.approve(await router.getAddress(), maxApproval);
    await wbnb.approve(await router.getAddress(), maxApproval);
    console.log("✅ 授权完成");

    // 7. 创建交易对并添加流动性
    console.log("\n🏊 7. 创建交易对并添加流动性...");
    
    // TKA/TKB 交易对
    const tokenAAmount = ethers.parseEther("1000");
    const tokenBAmount = ethers.parseEther("2000");
    
    console.log("  添加 TKA/TKB 流动性...");
    await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        tokenAAmount,
        tokenBAmount,
        0,
        0,
        deployer.address,
        Math.floor(Date.now() / 1000) + 300
    );
    
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    console.log("✅ TKA/TKB 交易对创建:", pairAddress);

    // WBNB/TKA 交易对
    const wbnbAmount = ethers.parseEther("5");
    const tokenAForWBNB = ethers.parseEther("500");
    
    console.log("  添加 WBNB/TKA 流动性...");
    await router.addLiquidity(
        await wbnb.getAddress(),
        await tokenA.getAddress(),
        wbnbAmount,
        tokenAForWBNB,
        0,
        0,
        deployer.address,
        Math.floor(Date.now() / 1000) + 300
    );
    
    const wbnbTkaePairAddress = await factory.getPair(await wbnb.getAddress(), await tokenA.getAddress());
    console.log("✅ WBNB/TKA 交易对创建:", wbnbTkaePairAddress);

    // 8. 测试交易
    console.log("\n🔄 8. 测试代币交换...");
    const swapAmount = ethers.parseEther("100");
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];
    
    const amountsBefore = await router.getAmountsOut(swapAmount, path);
    console.log("  预计交换:", ethers.formatEther(swapAmount), "TKA ->", ethers.formatEther(amountsBefore[1]), "TKB");
    
    await router.swapExactTokensForTokens(
        swapAmount,
        0,
        path,
        deployer.address,
        Math.floor(Date.now() / 1000) + 300
    );
    console.log("✅ 交换完成");

    // 9. 显示最终状态
    console.log("\n📊 9. 部署总结:");
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
    console.log("   WBNB/TKA Pair:", wbnbTkaePairAddress);
    console.log("");
    console.log("💰 代币余额:");
    console.log("   TKA:", ethers.formatEther(await tokenA.balanceOf(deployer.address)));
    console.log("   TKB:", ethers.formatEther(await tokenB.balanceOf(deployer.address)));
    console.log("   WBNB:", ethers.formatEther(await wbnb.balanceOf(deployer.address)));
    console.log("");
    console.log("🎉 PancakeSwap DEX 部署完成！");
    console.log("📝 可以使用 Router 进行代币交换操作");
    
    // 保存部署信息到文件
    const deploymentInfo = {
        network: "localhost",
        contracts: {
            WBNB: await wbnb.getAddress(),
            PancakeFactory: await factory.getAddress(),
            PancakeRouter: await router.getAddress(),
            TokenA: await tokenA.getAddress(),
            TokenB: await tokenB.getAddress()
        },
        pairs: {
            "TKA/TKB": pairAddress,
            "WBNB/TKA": wbnbTkaePairAddress
        },
        deployer: deployer.address
    };

    console.log("\n💾 部署信息已保存到控制台，可用于前端集成");
    return deploymentInfo;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 部署失败:", error);
        process.exit(1);
    });