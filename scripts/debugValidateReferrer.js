const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    const deployment = require("../syi-deployment.json");
    const stakingAddress = deployment.contracts.Staking;

    const Staking = await ethers.getContractFactory("Staking");
    const staking = Staking.attach(stakingAddress);

    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const testUser1 = accounts[9];  // 全新账户
    const testUser2 = accounts[10];

    console.log("🔍 调试 _validateReferrer 逻辑\n");

    // 确保严格模式
    await staking.connect(deployer).setRequireReferrerStaked(true);
    console.log("系统配置: requireReferrerStaked =", await staking.requireReferrerStaked());

    const rootAddress = await staking.getRootAddress();

    // testUser1 绑定 rootAddress
    console.log("\n步骤 1: testUser1 绑定 rootAddress");
    const tx1 = await staking.connect(testUser1).lockReferral(rootAddress);
    await tx1.wait();
    console.log("✅ testUser1 绑定成功");

    // 检查 testUser1 的状态
    console.log("\ntestUser1 状态:");
    console.log("  地址:", testUser1.address);
    console.log("  已绑定:", await staking.isBindReferral(testUser1.address));
    console.log("  质押余额:", ethers.formatEther(await staking.balanceOf(testUser1.address)));

    // 尝试让 testUser2 绑定 testUser1
    console.log("\n步骤 2: testUser2 尝试绑定 testUser1（应该失败）");
    console.log("  系统模式: 严格");
    console.log("  testUser1 质押: 0");
    console.log("  预期: 失败（InvalidReferrer）");

    try {
        const tx2 = await staking.connect(testUser2).lockReferral(testUser1.address);
        await tx2.wait();
        console.log("❌ 绑定成功了！这是 BUG！");
        console.log("   testUser2 的推荐人:", await staking.getReferral(testUser2.address));
    } catch (error) {
        console.log("✅ 绑定失败（符合预期）");
        console.log("   错误:", error.shortMessage || error.message.split('\n')[0]);
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
});
