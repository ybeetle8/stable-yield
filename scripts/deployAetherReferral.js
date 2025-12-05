const hre = require("hardhat");

async function main() {
    console.log("========================================");
    console.log("开始部署 Aether-Referral 合约...");
    console.log("========================================\n");

    // 获取部署账户
    const [deployer] = await hre.ethers.getSigners();
    console.log("部署账户:", deployer.address);
    console.log("账户余额:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    // 设置根地址(使用指定的固定地址)
    const rootAddress = "0xF4d1cD67cD570aE5e78ae89Bf664A299DeEdEFC7";
    console.log("根地址(Root Address):", rootAddress, "\n");

    // 部署 AetherReferral 合约
    console.log("正在部署 AetherReferral 合约...");
    const AetherReferral = await hre.ethers.getContractFactory("AetherReferral");
    const referral = await AetherReferral.deploy(rootAddress);
    await referral.waitForDeployment();

    const referralAddress = await referral.getAddress();
    console.log("✅ AetherReferral 合约部署成功!");
    console.log("   地址:", referralAddress);
    console.log("   区块:", (await hre.ethers.provider.getBlock('latest')).number);
    console.log("");

    // 验证合约状态
    console.log("========================================");
    console.log("验证合约状态...");
    console.log("========================================\n");

    const contractRootAddress = await referral.rootAddress();
    const maxDepth = await referral.MAX_REFERRAL_DEPTH();

    console.log("合约根地址:", contractRootAddress);
    console.log("最大推荐链深度:", maxDepth.toString());
    console.log("");

    // 保存部署信息
    const deploymentInfo = {
        network: hre.network.name,
        contractAddress: referralAddress,
        rootAddress: rootAddress,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        blockNumber: (await hre.ethers.provider.getBlock('latest')).number
    };

    const fs = require('fs');
    const path = require('path');
    const deploymentPath = path.join(__dirname, '..', 'aether-referral-deployment.json');
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

    console.log("========================================");
    console.log("部署信息已保存到: aether-referral-deployment.json");
    console.log("========================================\n");

    console.log("🎉 Aether-Referral 合约部署完成!");
    console.log("");
    console.log("合约地址:", referralAddress);
    console.log("请使用以下命令运行测试:");
    console.log("npx hardhat run scripts/testAetherReferral.js --network localhost");
    console.log("");

    return {
        referralAddress,
        rootAddress
    };
}

// 执行部署
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
