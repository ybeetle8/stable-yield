const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m"
};

function printHeader(title) {
    console.log("\n" + colors.bright + colors.cyan + "=".repeat(60) + colors.reset);
    console.log(colors.bright + colors.cyan + title + colors.reset);
    console.log(colors.bright + colors.cyan + "=".repeat(60) + colors.reset + "\n");
}

function printSuccess(message) {
    console.log(colors.green + "✅ " + message + colors.reset);
}

function printInfo(message) {
    console.log(colors.blue + "ℹ️  " + message + colors.reset);
}

function printError(message) {
    console.log(colors.red + "❌ " + message + colors.reset);
}

async function main() {
    printHeader("Aether-Referral 推荐人验证测试");

    // 读取部署信息
    const deploymentPath = path.join(__dirname, '..', 'aether-referral-deployment.json');
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ 未找到部署信息文件,请先运行部署脚本!");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const referralAddress = deploymentInfo.contractAddress;
    const rootAddress = deploymentInfo.rootAddress;

    printInfo(`合约地址: ${referralAddress}`);
    printInfo(`根地址: ${rootAddress}\n`);

    // 获取合约实例
    const referral = await hre.ethers.getContractAt("AetherReferral", referralAddress);

    // 获取测试账户
    const signers = await hre.ethers.getSigners();
    const accounts = signers.slice(0, 5);

    printInfo("测试账户:");
    for (let i = 0; i < accounts.length; i++) {
        console.log(`  账户 ${i}: ${accounts[i].address}`);
    }
    console.log("");

    // =========================================================================
    // 测试 1: 正常流程 - 先绑定 rootAddress
    // =========================================================================
    printHeader("测试 1: 正常流程 - 账户0绑定rootAddress");

    try {
        printInfo("账户0 尝试绑定推荐人 Root...");
        let tx = await referral.connect(accounts[0]).lockReferral(rootAddress);
        await tx.wait();
        printSuccess("账户0 成功绑定 Root 作为推荐人!");

        // 验证绑定状态
        const hasLocked = await referral.hasLockedReferral(accounts[0].address);
        const referrer = await referral.getReferral(accounts[0].address);
        printInfo(`  已绑定: ${hasLocked}`);
        printInfo(`  推荐人: ${referrer}\n`);
    } catch (error) {
        printError("测试失败: " + error.message);
        process.exit(1);
    }

    // =========================================================================
    // 测试 2: 正常流程 - 已绑定用户可以作为推荐人
    // =========================================================================
    printHeader("测试 2: 正常流程 - 账户1绑定已绑定的账户0");

    try {
        printInfo("账户1 尝试绑定推荐人 账户0 (已绑定过)...");
        let tx = await referral.connect(accounts[1]).lockReferral(accounts[0].address);
        await tx.wait();
        printSuccess("账户1 成功绑定 账户0 作为推荐人!");

        // 验证绑定状态
        const hasLocked = await referral.hasLockedReferral(accounts[1].address);
        const referrer = await referral.getReferral(accounts[1].address);
        printInfo(`  已绑定: ${hasLocked}`);
        printInfo(`  推荐人: ${referrer}\n`);
    } catch (error) {
        printError("测试失败: " + error.message);
        process.exit(1);
    }

    // =========================================================================
    // 测试 3: 异常流程 - 未绑定的用户不能作为推荐人
    // =========================================================================
    printHeader("测试 3: 异常流程 - 账户2尝试绑定未绑定的账户3");

    try {
        printInfo("账户2 尝试绑定推荐人 账户3 (未绑定过)...");

        // 先检查账户3是否已绑定
        const hasLocked3 = await referral.hasLockedReferral(accounts[3].address);
        printInfo(`  账户3 绑定状态: ${hasLocked3}`);

        if (hasLocked3) {
            printError("测试环境错误: 账户3 不应该已经绑定!");
            process.exit(1);
        }

        // 尝试绑定
        let tx = await referral.connect(accounts[2]).lockReferral(accounts[3].address);
        await tx.wait();

        // 如果到达这里,说明绑定成功了,这是错误的
        printError("❌❌❌ BUG: 账户2成功绑定了未绑定的账户3! 这不应该发生!");
        printError("修复失败,推荐人验证逻辑仍有问题!");
        process.exit(1);

    } catch (error) {
        // 期望抛出 InvalidAddress 错误
        if (error.message.includes("InvalidAddress")) {
            printSuccess("正确阻止了未绑定账户作为推荐人!");
            printInfo(`  错误信息: ${error.message}\n`);
        } else {
            printError("抛出了非预期的错误: " + error.message);
            process.exit(1);
        }
    }

    // =========================================================================
    // 测试 4: 正常流程 - 账户3绑定后可以作为推荐人
    // =========================================================================
    printHeader("测试 4: 正常流程 - 账户3先绑定Root,然后账户2再绑定账户3");

    try {
        printInfo("步骤 1: 账户3 先绑定 Root...");
        let tx = await referral.connect(accounts[3]).lockReferral(rootAddress);
        await tx.wait();
        printSuccess("账户3 成功绑定 Root!");

        printInfo("\n步骤 2: 账户2 再绑定 账户3...");
        tx = await referral.connect(accounts[2]).lockReferral(accounts[3].address);
        await tx.wait();
        printSuccess("账户2 成功绑定 账户3 作为推荐人!");

        // 验证绑定状态
        const hasLocked2 = await referral.hasLockedReferral(accounts[2].address);
        const referrer2 = await referral.getReferral(accounts[2].address);
        printInfo(`  账户2 已绑定: ${hasLocked2}`);
        printInfo(`  账户2 推荐人: ${referrer2}\n`);
    } catch (error) {
        printError("测试失败: " + error.message);
        process.exit(1);
    }

    // =========================================================================
    // 测试 5: 异常流程 - 绑定 address(0) 会自动转为 rootAddress
    // =========================================================================
    printHeader("测试 5: 边界情况 - 绑定 address(0) 自动转为 rootAddress");

    try {
        printInfo("账户4 尝试绑定推荐人 address(0)...");
        let tx = await referral.connect(accounts[4]).lockReferral(hre.ethers.ZeroAddress);
        await tx.wait();
        printSuccess("绑定成功!");

        // 验证实际推荐人是 rootAddress
        const referrer4 = await referral.getReferral(accounts[4].address);
        if (referrer4 === rootAddress) {
            printSuccess("正确: address(0) 被自动转换为 rootAddress!");
            printInfo(`  实际推荐人: ${referrer4}\n`);
        } else {
            printError("错误: 推荐人不是 rootAddress!");
            process.exit(1);
        }
    } catch (error) {
        printError("测试失败: " + error.message);
        process.exit(1);
    }

    // =========================================================================
    // 测试 6: 验证推荐链
    // =========================================================================
    printHeader("测试 6: 验证推荐链");

    console.log(`${colors.bright}最终推荐关系树:${colors.reset}\n`);
    console.log(`Root (${rootAddress})`);
    console.log(`  ├─ 账户0`);
    console.log(`  │   └─ 账户1`);
    console.log(`  ├─ 账户3`);
    console.log(`  │   └─ 账户2`);
    console.log(`  └─ 账户4\n`);

    // 验证账户2的推荐链: 账户2 -> 账户3 -> Root
    const chain2 = await referral.getReferrals(accounts[2].address, 30);
    console.log(`${colors.bright}账户2的推荐链:${colors.reset}`);
    for (let i = 0; i < chain2.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === chain2[i]);
        if (accountIndex >= 0) {
            console.log(`  第${i + 1}层: 账户${accountIndex} (${chain2[i]})`);
        } else if (chain2[i] === rootAddress) {
            console.log(`  第${i + 1}层: Root (${chain2[i]})`);
        }
    }

    // 验证账户1的推荐链: 账户1 -> 账户0 -> Root
    const chain1 = await referral.getReferrals(accounts[1].address, 30);
    console.log(`\n${colors.bright}账户1的推荐链:${colors.reset}`);
    for (let i = 0; i < chain1.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === chain1[i]);
        if (accountIndex >= 0) {
            console.log(`  第${i + 1}层: 账户${accountIndex} (${chain1[i]})`);
        } else if (chain1[i] === rootAddress) {
            console.log(`  第${i + 1}层: Root (${chain1[i]})`);
        }
    }

    // =========================================================================
    // 测试完成
    // =========================================================================
    printHeader("测试完成!");
    printSuccess("所有测试用例执行成功!");
    printSuccess("✅ 推荐人必须已绑定的验证逻辑工作正常!");
    printSuccess("✅ rootAddress 作为推荐人永远有效!");
    printSuccess("✅ address(0) 正确转换为 rootAddress!");
}

// 执行测试
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
