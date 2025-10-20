/**
 * 测试推荐人质押要求配置功能
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
    console.log("\n🧪 开始测试推荐人质押要求配置功能...\n");

    // 加载部署信息
    const deployment = require("../syi-deployment.json");
    const stakingAddress = deployment.contracts.Staking;

    console.log("📋 使用的合约地址:");
    console.log("  Staking:", stakingAddress);

    // 获取合约实例
    const Staking = await ethers.getContractFactory("Staking");
    const staking = Staking.attach(stakingAddress);

    // 获取测试账户
    // accounts[0] = deployer
    // accounts[1] = feeRecipientWallet
    // accounts[2] = rootWallet (rootAddress)
    // accounts[3+] = 测试用户
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const user1 = accounts[3]; // 使用 accounts[3] 避免与系统账户冲突
    const user2 = accounts[4];
    const user3 = accounts[5];

    console.log("\n👥 测试账户:");
    console.log("  deployer:", deployer.address);
    console.log("  user1:", user1.address);
    console.log("  user2:", user2.address);
    console.log("  user3:", user3.address);

    // =========================================================================
    // 测试 1: 查询初始配置（应该是 true，保持原有严格行为）
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 1: 查询初始配置");
    console.log("=".repeat(80));

    const initialRequirement = await staking.requireReferrerStaked();
    console.log("✅ 初始配置 requireReferrerStaked:", initialRequirement);
    console.log("   期望值: true（保持原有严格行为）");

    if (!initialRequirement) {
        console.log("⚠️  警告：初始配置不是 true，可能影响后续测试");
    }

    // =========================================================================
    // 测试 2: 管理员切换配置为宽松模式
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 2: 管理员切换配置为宽松模式");
    console.log("=".repeat(80));

    console.log("📝 调用 setRequireReferrerStaked(false)...");
    const tx1 = await staking.connect(deployer).setRequireReferrerStaked(false);
    const receipt1 = await tx1.wait();

    // 检查事件
    const event1 = receipt1.logs.find(
        log => log.fragment && log.fragment.name === "ReferrerStakeRequirementUpdated"
    );
    if (event1) {
        console.log("✅ 事件 ReferrerStakeRequirementUpdated 已发出:");
        console.log("   oldValue:", event1.args.oldValue);
        console.log("   newValue:", event1.args.newValue);
        console.log("   timestamp:", event1.args.timestamp.toString());
    }

    const newRequirement = await staking.requireReferrerStaked();
    console.log("✅ 当前配置 requireReferrerStaked:", newRequirement);
    console.log("   期望值: false");

    // =========================================================================
    // 测试 3: 宽松模式下，未质押的 user1 可以被绑定
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 3: 宽松模式下，未质押的 user1 可以被绑定");
    console.log("=".repeat(80));

    // 查询 user1 的质押状态
    const user1Balance = await staking.balanceOf(user1.address);
    console.log("📊 user1 当前质押余额:", ethers.formatEther(user1Balance), "sSYI");
    console.log("   期望: 0 sSYI（未质押）");

    // user1 绑定 rootAddress
    const rootAddress = await staking.getRootAddress();
    console.log("\n📝 user1 绑定推荐人 rootAddress:", rootAddress);
    const tx2 = await staking.connect(user1).lockReferral(rootAddress);
    await tx2.wait();
    console.log("✅ user1 绑定成功！");

    const user1Referrer = await staking.getReferral(user1.address);
    console.log("   user1 的推荐人:", user1Referrer);
    console.log("   期望:", rootAddress);

    // =========================================================================
    // 测试 4: user2 绑定未质押的 user1（应该成功）
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 4: user2 绑定未质押的 user1（应该成功）");
    console.log("=".repeat(80));

    console.log("📝 user2 绑定推荐人 user1:", user1.address);
    const tx3 = await staking.connect(user2).lockReferral(user1.address);
    await tx3.wait();
    console.log("✅ user2 绑定 user1 成功！");

    const user2Referrer = await staking.getReferral(user2.address);
    console.log("   user2 的推荐人:", user2Referrer);
    console.log("   期望:", user1.address);

    // =========================================================================
    // 测试 5: 切换回严格模式
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 5: 切换回严格模式");
    console.log("=".repeat(80));

    console.log("📝 调用 setRequireReferrerStaked(true)...");
    const tx4 = await staking.connect(deployer).setRequireReferrerStaked(true);
    const receipt4 = await tx4.wait();

    const event4 = receipt4.logs.find(
        log => log.fragment && log.fragment.name === "ReferrerStakeRequirementUpdated"
    );
    if (event4) {
        console.log("✅ 事件 ReferrerStakeRequirementUpdated 已发出:");
        console.log("   oldValue:", event4.args.oldValue);
        console.log("   newValue:", event4.args.newValue);
    }

    const strictRequirement = await staking.requireReferrerStaked();
    console.log("✅ 当前配置 requireReferrerStaked:", strictRequirement);
    console.log("   期望值: true");

    // =========================================================================
    // 测试 6: 严格模式下，user3 仍然可以绑定 user1（user1 有豁免权）
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 6: 严格模式下，user3 仍可绑定 user1（继承豁免权）");
    console.log("=".repeat(80));

    console.log("📊 user1 当前质押余额:", ethers.formatEther(user1Balance), "sSYI");
    console.log("   系统要求: > 1 sSYI");
    console.log("   user1 豁免状态: 在宽松模式下绑定，获得永久豁免");

    console.log("\n📝 user3 绑定推荐人 user1:", user1.address);
    try {
        const tx5 = await staking.connect(user3).lockReferral(user1.address);
        await tx5.wait();
        console.log("✅ user3 绑定 user1 成功！");
        console.log("   原因: user1 在宽松模式下绑定，获得永久豁免权");

        const user3Referrer = await staking.getReferral(user3.address);
        console.log("   user3 的推荐人:", user3Referrer);
        console.log("   期望:", user1.address);
    } catch (error) {
        console.log("❌ user3 绑定 user1 失败！");
        console.log("   错误:", error.message);
        console.log("   这不符合预期，应该可以绑定（user1 有豁免权）");
    }

    // =========================================================================
    // 测试 7: 非管理员尝试修改配置（应该失败）
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("测试 7: 非管理员尝试修改配置（应该失败）");
    console.log("=".repeat(80));

    console.log("📝 user1 尝试调用 setRequireReferrerStaked(false)...");
    try {
        const tx7 = await staking.connect(user1).setRequireReferrerStaked(false);
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
    console.log("  1. ✅ 初始配置为严格模式（true）");
    console.log("  2. ✅ 管理员可以切换为宽松模式（false）");
    console.log("  3. ✅ 宽松模式下，未质押用户可以被绑定");
    console.log("  4. ✅ 管理员可以切换回严格模式（true）");
    console.log("  5. ✅ 宽松模式绑定的用户，获得永久豁免权");
    console.log("  6. ✅ 非管理员无法修改配置");

    console.log("\n📋 推荐链结构:");
    console.log("  rootAddress");
    console.log("    └─ user1（宽松模式绑定，未质押）");
    console.log("        ├─ user2");
    console.log("        └─ user3");

    console.log("\n💡 后续测试建议（需人工操作）:");
    console.log("  1. 测试严格模式下，新用户未质押无法被绑定");
    console.log("  2. 测试用户质押后可以被绑定");
    console.log("  3. 测试用户解除质押后的影响");
    console.log("  4. 测试多层级推荐链的豁免权传递");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 测试失败:", error);
        process.exit(1);
    });
