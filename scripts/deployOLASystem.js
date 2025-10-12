const { ethers } = require("hardhat");

async function main() {
    const [deployer, user1, user2] = await ethers.getSigners();
    
    console.log("🚀 开始部署 OLA 生态系统合约");
    console.log("部署地址:", deployer.address);
    console.log("账户余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
    
    // 1. 部署基础代币
    console.log("\n=== 步骤 1: 部署基础代币 ===");
    
    // 部署 USDT
    const USDT = await ethers.getContractFactory("USDT");
    const usdt = await USDT.deploy();
    await usdt.waitForDeployment();
    console.log("✅ USDT 部署完成:", await usdt.getAddress());
    
    // 部署 WBNB
    const WBNB = await ethers.getContractFactory("WBNB");
    const wbnb = await WBNB.deploy();
    await wbnb.waitForDeployment();
    console.log("✅ WBNB 部署完成:", await wbnb.getAddress());
    
    // 2. 部署 Pancake 合约
    console.log("\n=== 步骤 2: 部署 Pancake 基础设施 ===");
    
    // 部署 Factory
    const PancakeFactory = await ethers.getContractFactory("PancakeFactory");
    const factory = await PancakeFactory.deploy(deployer.address);
    await factory.waitForDeployment();
    console.log("✅ PancakeFactory 部署完成:", await factory.getAddress());
    
    // 部署 Router
    const PancakeRouter = await ethers.getContractFactory("PancakeRouter");
    const router = await PancakeRouter.deploy(await factory.getAddress(), await wbnb.getAddress());
    await router.waitForDeployment();
    console.log("✅ PancakeRouter 部署完成:", await router.getAddress());
    
    // 3. 部署 FundRelay
    console.log("\n=== 步骤 3: 准备辅助合约 ===");
    
    // 先用临时地址部署FundRelay，稍后更新
    const FundRelay = await ethers.getContractFactory("FundRelay");
    const fundRelay = await FundRelay.deploy(await usdt.getAddress(), ethers.ZeroAddress);
    await fundRelay.waitForDeployment();
    console.log("✅ FundRelay 部署完成:", await fundRelay.getAddress());
    
    // 4. 部署 Staking 合约
    console.log("\n=== 步骤 4: 部署 Staking 合约 ===");
    
    const Staking = await ethers.getContractFactory("Staking");
    const staking = await Staking.deploy(
        await usdt.getAddress(),    // USDT地址
        await router.getAddress(),  // Router地址
        deployer.address,          // rootAddress
        deployer.address           // feeRecipient
    );
    await staking.waitForDeployment();
    console.log("✅ Staking 合约部署完成:", await staking.getAddress());
    
    // 5. 部署 OLA 代币合约
    console.log("\n=== 步骤 5: 部署 OLA 代币合约 ===");
    
    const OLA = await ethers.getContractFactory("OLA");
    const ola = await OLA.deploy(
        await usdt.getAddress(),     // USDT地址
        await router.getAddress(),   // Router地址
        await staking.getAddress(),  // Staking地址
        deployer.address            // marketingAddress
    );
    await ola.waitForDeployment();
    console.log("✅ OLA 代币合约部署完成:", await ola.getAddress());
    
    // 6. 配置合约关联
    console.log("\n=== 步骤 6: 配置合约关联 ===");
    
    // 在 Staking 中设置 OLA 地址
    await staking.setOLA(await ola.getAddress());
    console.log("✅ Staking 合约已配置 OLA 地址");
    
    // 更新 FundRelay 中的 OLA 地址
    // 注意：这里需要重新部署 FundRelay 或者如果有 setter 方法则调用
    const FundRelay2 = await ethers.getContractFactory("FundRelay");
    const fundRelay2 = await FundRelay2.deploy(await usdt.getAddress(), await ola.getAddress());
    await fundRelay2.waitForDeployment();
    console.log("✅ 重新部署 FundRelay 完成:", await fundRelay2.getAddress());
    
    // 在 OLA 中设置 FundRelay
    await ola.setFundRelay(await fundRelay2.getAddress());
    console.log("✅ OLA 合约已配置 FundRelay 地址");
    
    // 7. 创建交易对
    console.log("\n=== 步骤 7: 创建 OLA/USDT 交易对 ===");
    
    const createPairTx = await factory.createPair(await ola.getAddress(), await usdt.getAddress());
    await createPairTx.wait();
    
    const pairAddress = await factory.getPair(await ola.getAddress(), await usdt.getAddress());
    console.log("✅ OLA/USDT 交易对创建完成:", pairAddress);
    
    // 在 OLA 合约中设置交易对
    await ola.setPair(pairAddress);
    console.log("✅ OLA 合约已配置交易对地址");
    
    // 8. 初始化白名单
    console.log("\n=== 步骤 8: 初始化配置 ===");
    
    await ola.initializeWhitelist();
    console.log("✅ OLA 白名单已初始化");
    
    // 9. 准备测试资金
    console.log("\n=== 步骤 9: 准备测试资金 ===");
    
    // 给测试账户一些 USDT
    await usdt.mint(user1.address, ethers.parseEther("10000"));
    await usdt.mint(user2.address, ethers.parseEther("10000"));
    console.log("✅ 为测试账户铸造 USDT");
    
    // 给部署者更多 USDT 用于添加流动性
    await usdt.mint(deployer.address, ethers.parseEther("100000"));
    console.log("✅ 为部署者铸造额外 USDT");
    
    // 10. 添加初始流动性
    console.log("\n=== 步骤 10: 添加初始流动性 ===");
    
    const olaAmount = ethers.parseEther("50000"); // 5万 OLA
    const usdtAmount = ethers.parseEther("50000"); // 5万 USDT
    
    // 授权 Router 使用代币
    await ola.approve(await router.getAddress(), olaAmount);
    await usdt.approve(await router.getAddress(), usdtAmount);
    
    // 添加流动性
    const addLiquidityTx = await router.addLiquidity(
        await ola.getAddress(),
        await usdt.getAddress(),
        olaAmount,
        usdtAmount,
        0, // slippage protection disabled for initial liquidity
        0,
        deployer.address,
        Math.floor(Date.now() / 1000) + 3600 // 1 hour deadline
    );
    await addLiquidityTx.wait();
    console.log("✅ 初始流动性添加完成");
    
    // 11. 输出部署摘要
    console.log("\n🎉 =================================================================");
    console.log("🎉                    OLA 生态系统部署完成                        ");
    console.log("🎉 =================================================================");
    
    const addresses = {
        deployer: deployer.address,
        user1: user1.address,
        user2: user2.address,
        usdt: await usdt.getAddress(),
        wbnb: await wbnb.getAddress(),
        factory: await factory.getAddress(),
        router: await router.getAddress(),
        staking: await staking.getAddress(),
        ola: await ola.getAddress(),
        fundRelay: await fundRelay2.getAddress(),
        pair: pairAddress
    };
    
    console.log("📋 合约地址:");
    Object.entries(addresses).forEach(([name, address]) => {
        console.log(`   ${name.padEnd(12)}: ${address}`);
    });
    
    // 保存地址到文件
    require('fs').writeFileSync(
        'deployed-addresses.json', 
        JSON.stringify(addresses, null, 2)
    );
    console.log("\n💾 合约地址已保存到 deployed-addresses.json");
    
    // 12. 验证部署
    console.log("\n=== 步骤 12: 验证部署 ===");
    
    const olaBalance = await ola.balanceOf(deployer.address);
    const usdtBalance = await usdt.balanceOf(user1.address);
    const pairOlaBalance = await ola.balanceOf(pairAddress);
    const pairUsdtBalance = await usdt.balanceOf(pairAddress);
    
    console.log("✅ 验证结果:");
    console.log(`   部署者 OLA 余额: ${ethers.formatEther(olaBalance)}`);
    console.log(`   用户1 USDT 余额: ${ethers.formatEther(usdtBalance)}`);
    console.log(`   交易对 OLA 余额: ${ethers.formatEther(pairOlaBalance)}`);
    console.log(`   交易对 USDT 余额: ${ethers.formatEther(pairUsdtBalance)}`);
    
    console.log("\n🚀 部署脚本执行完成！可以开始测试了。");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 部署过程中出现错误:");
        console.error(error);
        process.exit(1);
    });