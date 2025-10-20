const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    const deployment = require("../syi-deployment.json");
    const stakingAddress = deployment.contracts.Staking;

    const Staking = await ethers.getContractFactory("Staking");
    const staking = Staking.attach(stakingAddress);

    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const user1 = accounts[3];

    console.log("合约 owner:", await staking.owner());
    console.log("deployer:", deployer.address);
    console.log("user1:", user1.address);

    console.log("\n当前配置:", await staking.requireReferrerStaked());

    console.log("\n测试 1: deployer (owner) 修改配置");
    try {
        const tx1 = await staking.connect(deployer).setRequireReferrerStaked(false);
        await tx1.wait();
        console.log("✅ owner 修改成功");
        console.log("   新配置:", await staking.requireReferrerStaked());
    } catch (error) {
        console.log("❌ owner 修改失败:", error.message.split('\n')[0]);
    }

    console.log("\n测试 2: user1 (非 owner) 修改配置");
    try {
        const tx2 = await staking.connect(user1).setRequireReferrerStaked(true);
        await tx2.wait();
        console.log("❌ 非 owner 修改成功了！这是安全漏洞！");
        console.log("   新配置:", await staking.requireReferrerStaked());
    } catch (error) {
        console.log("✅ 非 owner 修改失败（符合预期）");
        console.log("   错误信息:", error.message.split('\n')[0]);
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
});
