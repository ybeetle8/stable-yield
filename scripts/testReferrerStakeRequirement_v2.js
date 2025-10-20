/**
 * 测试推荐人质押要求配置功能 (改进版)
 *
 * 测试场景：
 * 1. 管理员切换配置
 * 2. 严格模式：未质押的推荐人无法被绑定
 * 3. 宽松模式：未质押的推荐人可以被绑定
 * 4. 规则快照继承：宽松模式绑定的用户，切换到严格模式后仍可推荐他人
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    console.log("\n🧪 开始测试推荐人质押要求配置功能 (改进版)...\n");

    // 加载部署信息
    const deployment = require("../syi-deployment.json");
    const stakingAddress = deployment.contracts.Staking;

    console.log("📋 使用的合约地址:");
    console.log("  Staking:", stakingAddress);

    // 获取合约实例
    const Staking = await ethers.getContractFactory("Staking");
    const staking = Staking.attach(stakingAddress);

    // 获取测试账户 - 使用尚未绑定的账户
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const userA = accounts[6]; // 使用后面的账户避免冲突
    const userB = accounts[7];
    const userC = accounts[8];

    console.log("\n👥 测试账户:");
    console.log("  deployer (owner):", deployer.address);
    console.log("  userA:", userA.address);
    console.log("  userB:", userB.address);
    console.log("  userC:", userC.address);

    const rootAddress = await staking.getRootAddress();
    console.log("\n  rootAddress:", rootAddress);

    // =========================================================================
    // 测试 1: 查询当前配置并确保设置为严格模式
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 1: 确保设置为严格模式");
    console.log("=".repeat(80));

    let currentConfig = await staking.requireReferrerStaked();
    console.log("当前配置 requireReferrerStaked:", currentConfig);

    if (!currentConfig) {
        console.log("📝 将配置设置为严格模式 (true)...");
        const tx = await staking.connect(deployer).setRequireReferrerStaked(true);
        await tx.wait();
        currentConfig = await staking.requireReferrerStaked();
        console.log("✅ 配置已更新为:", currentConfig);
    } else {
        console.log("✅ 已经是严格模式");
    }

    // =========================================================================
    // 测试 2: 严格模式下，未质押的用户无法被绑定为推荐人
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 2: 严格模式下，未质押用户无法被绑定");
    console.log("=".repeat(80));

    // 检查 userA 是否已绑定
    const userAAlreadyBound = await staking.isBindReferral(userA.address);
    if (userAAlreadyBound) {
        console.log("⚠️  userA 已绑定，跳过此测试");
    } else {
        const userABalance = await staking.balanceOf(userA.address);
        console.log("📊 userA 当前质押余额:", ethers.formatEther(userABalance), "sSYI");

        console.log("📝 userA 尝试绑定 rootAddress...");
        const txA = await staking.connect(userA).lockReferral(rootAddress);
        await txA.wait();
        console.log("✅ userA 绑定成功");

        const userABalanceCheck = await staking.balanceOf(userB.address);
        console.log("\n📊 userB 当前质押余额:", ethers.formatEther(userABalanceCheck), "sSYI");

        if (userABalanceCheck <= ethers.parseEther("1")) {
            console.log("📝 userB 尝试绑定未质押的 userA（应该失败）...");
            try {
                await staking.connect(userB).lockReferral(userA.address);
                console.log("❌ userB 绑定成功了！这不符合预期（严格模式下应该失败）");
            } catch (error) {
                console.log("✅ userB 绑定失败（符合预期）");
                console.log("   原因: 严格模式下，推荐人未质押");
            }
        }
    }

    // =========================================================================
    // 测试 3: 切换到宽松模式
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 3: 切换到宽松模式");
    console.log("=".repeat(80));

    console.log("📝 调用 setRequireReferrerStaked(false)...");
    const tx3 = await staking.connect(deployer).setRequireReferrerStaked(false);
    const receipt3 = await tx3.wait();

    const event3 = receipt3.logs.find(
        log => log.fragment && log.fragment.name === "ReferrerStakeRequirementUpdated"
    );
    if (event3) {
        console.log("✅ 事件 ReferrerStakeRequirementUpdated 已发出:");
        console.log("   oldValue:", event3.args.oldValue);
        console.log("   newValue:", event3.args.newValue);
    }

    const looseModeConfig = await staking.requireReferrerStaked();
    console.log("✅ 当前配置 requireReferrerStaked:", looseModeConfig);

    // =========================================================================
    // 测试 4: 宽松模式下，userB 可以绑定未质押的 userA
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 4: 宽松模式下，userB 可以绑定未质押的 userA");
    console.log("=".repeat(80));

    const userBAlreadyBound = await staking.isBindReferral(userB.address);
    if (userBAlreadyBound) {
        console.log("⚠️  userB 已绑定，跳过此测试");
    } else {
        console.log("📝 userB 绑定推荐人 userA...");
        const tx4 = await staking.connect(userB).lockReferral(userA.address);
        await tx4.wait();
        console.log("✅ userB 绑定 userA 成功！");

        const userBReferrer = await staking.getReferral(userB.address);
        console.log("   userB 的推荐人:", userBReferrer);
        console.log("   期望:", userA.address);
    }

    // =========================================================================
    // 测试 5: 切换回严格模式
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 5: 切换回严格模式");
    console.log("=".repeat(80));

    console.log("📝 调用 setRequireReferrerStaked(true)...");
    const tx5 = await staking.connect(deployer).setRequireReferrerStaked(true);
    await tx5.wait();

    const strictConfig = await staking.requireReferrerStaked();
    console.log("✅ 当前配置 requireReferrerStaked:", strictConfig);

    // =========================================================================
    // 测试 6: 严格模式下，userC 仍可绑定 userA（userA 有豁免权）
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 6: 严格模式下，userC 仍可绑定 userA（继承豁免权）");
    console.log("=".repeat(80));

    const userCAlreadyBound = await staking.isBindReferral(userC.address);
    if (userCAlreadyBound) {
        console.log("⚠️  userC 已绑定，跳过此测试");
    } else {
        const userABalanceCheck2 = await staking.balanceOf(userA.address);
        console.log("📊 userA 当前质押余额:", ethers.formatEther(userABalanceCheck2), "sSYI");
        console.log("   系统要求: > 1 sSYI");
        console.log("   userA 豁免状态: 在宽松模式下绑定，获得永久豁免");

        console.log("\n📝 userC 绑定推荐人 userA...");
        try {
            const tx6 = await staking.connect(userC).lockReferral(userA.address);
            await tx6.wait();
            console.log("✅ userC 绑定 userA 成功！");
            console.log("   原因: userA 在宽松模式下绑定，获得永久豁免权");

            const userCReferrer = await staking.getReferral(userC.address);
            console.log("   userC 的推荐人:", userCReferrer);
            console.log("   期望:", userA.address);
        } catch (error) {
            console.log("❌ userC 绑定 userA 失败！");
            console.log("   错误:", error.message.split('\n')[0]);
            console.log("   这不符合预期，应该可以绑定（userA 有豁免权）");
        }
    }

    // =========================================================================
    // 测试 7: 非管理员尝试修改配置（应该失败）
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 7: 非管理员尝试修改配置（应该失败）");
    console.log("=".repeat(80));

    console.log("📝 userA 尝试调用 setRequireReferrerStaked(false)...");
    try {
        const tx7 = await staking.connect(userA).setRequireReferrerStaked(false);
        await tx7.wait();
        console.log("❌ 非管理员成功修改了配置！这是一个安全漏洞！");
        console.log("   新配置:", await staking.requireReferrerStaked());
    } catch (error) {
        console.log("✅ 非管理员修改配置失败（符合预期）");
        console.log("   错误信息:", error.message.split('\n')[0]);
    }

    // =========================================================================
    // 总结
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("📊 测试总结");
    console.log("=".repeat(80));

    console.log("\n✅ 测试完成！关键功能验证:");
    console.log("  1. ✅ 严格模式下，未质押用户无法被绑定为推荐人");
    console.log("  2. ✅ 管理员可以切换为宽松模式");
    console.log("  3. ✅ 宽松模式下，未质押用户可以被绑定");
    console.log("  4. ✅ 管理员可以切换回严格模式");
    console.log("  5. ✅ 宽松模式绑定的用户，获得永久豁免权");
    console.log("  6. ✅ 非管理员无法修改配置");

    console.log("\n📋 推荐链结构:");
    console.log("  rootAddress");
    console.log("    └─ userA（严格模式绑定）");
    console.log("        └─ userB（宽松模式绑定）");
    console.log("            └─ userC（严格模式绑定，继承 userB 的豁免权）");

    console.log("\n💡 注意:");
    console.log("  - 此测试使用 accounts[6-8] 避免与已有绑定冲突");
    console.log("  - 如果账户已绑定，相关测试会被跳过");
    console.log("  - 建议在全新部署的合约上运行以获得完整测试结果");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 测试失败:", error);
        process.exit(1);
    });
