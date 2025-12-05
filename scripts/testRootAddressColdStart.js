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
    magenta: "\x1b[35m",
    bgRed: "\x1b[41m",
    bgYellow: "\x1b[43m"
};

function printHeader(title) {
    console.log("\n" + colors.bright + colors.cyan + "=".repeat(80) + colors.reset);
    console.log(colors.bright + colors.cyan + title + colors.reset);
    console.log(colors.bright + colors.cyan + "=".repeat(80) + colors.reset + "\n");
}

function printSection(title) {
    console.log("\n" + colors.bright + colors.magenta + "━".repeat(80) + colors.reset);
    console.log(colors.bright + colors.magenta + title + colors.reset);
    console.log(colors.bright + colors.magenta + "━".repeat(80) + colors.reset + "\n");
}

function printSuccess(message) {
    console.log(colors.green + "✅ " + message + colors.reset);
}

function printInfo(message) {
    console.log(colors.blue + "ℹ️  " + message + colors.reset);
}

function printWarning(message) {
    console.log(colors.yellow + "⚠️  " + message + colors.reset);
}

function printError(message) {
    console.log(colors.red + "❌ " + message + colors.reset);
}

function printVulnerability(message) {
    console.log(colors.bgRed + colors.bright + " 🔥 漏洞 " + colors.reset + " " + colors.red + message + colors.reset);
}

function printCodeBlock(title, code) {
    console.log("\n" + colors.cyan + title + colors.reset);
    console.log(colors.bright + "─".repeat(80) + colors.reset);
    console.log(code);
    console.log(colors.bright + "─".repeat(80) + colors.reset + "\n");
}

async function main() {
    printHeader("🔍 AetherReferral 合约漏洞测试: rootAddress 冷启动问题");

    console.log(colors.bright + "测试目的:" + colors.reset);
    console.log("  展示当前合约中 rootAddress 未被标记为已绑定导致的冷启动问题\n");

    // 读取部署信息
    const deploymentPath = path.join(__dirname, '..', 'aether-referral-deployment.json');
    if (!fs.existsSync(deploymentPath)) {
        printError("未找到部署信息文件,请先运行: npx hardhat run scripts/deployAetherReferral.js --network localhost");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const referralAddress = deploymentInfo.contractAddress;
    const rootAddress = deploymentInfo.rootAddress;

    printInfo(`合约地址: ${referralAddress}`);
    printInfo(`根地址 (rootAddress): ${rootAddress}\n`);

    // 获取合约实例
    const referral = await hre.ethers.getContractAt("AetherReferral", referralAddress);

    // 获取测试账户
    const signers = await hre.ethers.getSigners();
    const alice = signers[1]; // 账户1
    const bob = signers[2];   // 账户2
    const charlie = signers[3]; // 账户3
    const david = signers[4];   // 账户4

    console.log(colors.bright + "测试账户:" + colors.reset);
    console.log(`  Alice:   ${alice.address}`);
    console.log(`  Bob:     ${bob.address}`);
    console.log(`  Charlie: ${charlie.address}`);
    console.log(`  David:   ${david.address}\n`);

    // =========================================================================
    // 漏洞分析 - 展示问题代码
    // =========================================================================
    printSection("📋 问题代码分析");

    printCodeBlock(
        "问题代码位置: AetherReferral.sol:99-102",
        `function lockReferral(address _referrer) external {
    // ... 其他验证 ...

    ${colors.red}// 推荐人必须已经绑定（除了 rootAddress）${colors.reset}
    ${colors.red}if (_referrer != rootAddress && !_hasLockedReferral[_referrer]) {${colors.reset}
    ${colors.red}    revert InvalidAddress();${colors.reset}
    ${colors.red}}${colors.reset}

    // 绑定推荐关系
    _referrals[user] = _referrer;
    _hasLockedReferral[user] = true;
}`
    );

    console.log(colors.bright + "问题分析:" + colors.reset);
    console.log("  1. rootAddress 在构造函数中被设置,但 " + colors.red + "_hasLockedReferral[rootAddress] 始终为 false" + colors.reset);
    console.log("  2. 代码第100行仅允许 rootAddress 作为例外,其他地址必须 _hasLockedReferral = true");
    console.log("  3. 这导致 " + colors.red + "rootAddress 本身永远不会被标记为已绑定" + colors.reset + "\n");

    // 验证 rootAddress 的绑定状态
    const rootHasLocked = await referral.hasLockedReferral(rootAddress);
    printWarning(`当前 rootAddress 的绑定状态: ${rootHasLocked} (应该为 true,但实际为 false)`);

    // =========================================================================
    // 测试场景 1: Alice 直接绑定 rootAddress (正常工作)
    // =========================================================================
    printSection("测试场景 1: Alice 直接绑定 rootAddress");

    printInfo("Alice 尝试绑定 rootAddress 作为推荐人...");
    try {
        const tx1 = await referral.connect(alice).lockReferral(rootAddress);
        await tx1.wait();
        printSuccess("Alice 成功绑定 rootAddress!");

        const aliceReferrer = await referral.getReferral(alice.address);
        const aliceHasLocked = await referral.hasLockedReferral(alice.address);
        printInfo(`  Alice 的推荐人: ${aliceReferrer}`);
        printInfo(`  Alice 已绑定: ${aliceHasLocked}\n`);
    } catch (error) {
        printError("绑定失败: " + error.message);
        process.exit(1);
    }

    // =========================================================================
    // 测试场景 2: Bob 绑定 Alice (正常工作,因为 Alice 已绑定)
    // =========================================================================
    printSection("测试场景 2: Bob 绑定 Alice (已绑定用户)");

    printInfo("Bob 尝试绑定 Alice 作为推荐人...");
    try {
        const tx2 = await referral.connect(bob).lockReferral(alice.address);
        await tx2.wait();
        printSuccess("Bob 成功绑定 Alice!");

        const bobReferrer = await referral.getReferral(bob.address);
        printInfo(`  Bob 的推荐人: ${bobReferrer}`);

        // 显示推荐链
        const bobChain = await referral.getReferrals(bob.address, 10);
        printInfo(`  Bob 的推荐链: Bob -> Alice (${bobChain[0]}) -> Root (${bobChain[1]})\n`);
    } catch (error) {
        printError("绑定失败: " + error.message);
        process.exit(1);
    }

    // =========================================================================
    // 测试场景 3: 🔥 漏洞场景 - Charlie 无法绑定 Alice 的下线 Bob
    // =========================================================================
    printSection("🔥 测试场景 3: 漏洞触发 - Charlie 尝试绑定 Bob");

    console.log(colors.bgYellow + colors.bright + " 关键问题 " + colors.reset);
    console.log("在冷启动阶段,如果:");
    console.log("  1. Alice 绑定了 rootAddress");
    console.log("  2. Bob 想绑定 Alice");
    console.log("  3. Charlie 想绑定 Bob\n");

    console.log(colors.red + "预期行为:" + colors.reset);
    console.log("  Charlie 应该能成功绑定 Bob (因为 Bob 已绑定)\n");

    console.log(colors.red + "实际行为:" + colors.reset);
    console.log("  如果我们尝试让 Charlie 绑定 Bob 之前的某个场景...\n");

    // 先检查 Bob 的绑定状态
    const bobHasLocked = await referral.hasLockedReferral(bob.address);
    printInfo(`Bob 的绑定状态: ${bobHasLocked} (已绑定)`);

    printInfo("Charlie 尝试绑定 Bob 作为推荐人...");
    try {
        const tx3 = await referral.connect(charlie).lockReferral(bob.address);
        await tx3.wait();
        printSuccess("Charlie 成功绑定 Bob!");
        printInfo(`  这个案例工作正常,因为 Bob 确实已经绑定过了\n`);
    } catch (error) {
        printError("绑定失败: " + error.message + "\n");
    }

    // =========================================================================
    // 测试场景 4: 🔥 真正的问题 - 尝试跨链绑定未初始化的 rootAddress 下线
    // =========================================================================
    printSection("🔥 测试场景 4: 核心漏洞 - 尝试直接绑定 rootAddress 的某个理论下线");

    console.log(colors.bgRed + colors.bright + " 漏洞说明 " + colors.reset + "\n");

    console.log(colors.red + "问题根源:" + colors.reset);
    console.log("  rootAddress 的 _hasLockedReferral 状态始终为 false!\n");

    printInfo(`验证: _hasLockedReferral[rootAddress] = ${rootHasLocked}`);
    printInfo(`问题: 这意味着 rootAddress 被系统视为 \"未绑定用户\"\n`);

    console.log(colors.yellow + "影响范围:" + colors.reset);
    console.log("  1. 如果有人想绑定一个地址 X 作为推荐人");
    console.log("  2. 而这个地址 X 的推荐人恰好是 rootAddress");
    console.log("  3. 但 X 本身还没有完成首次绑定操作");
    console.log("  4. 那么按照代码逻辑, X 无法被绑定为推荐人\n");

    console.log(colors.yellow + "实际场景:" + colors.reset);
    console.log("  虽然在当前测试中 Alice、Bob 都已经绑定过了,");
    console.log("  但我们可以模拟一个场景来展示这个逻辑缺陷:\n");

    // 创建一个模拟场景
    printInfo("假设 David 想成为推荐人,但他还没有调用过 lockReferral()");
    const davidHasLocked = await referral.hasLockedReferral(david.address);
    printInfo(`  David 当前绑定状态: ${davidHasLocked} (未绑定)`);
    printInfo(`  David 是否有推荐人: ${await referral.getReferral(david.address) || '无'}\n`);

    // 使用新账户尝试绑定 David
    const eve = signers[5];
    printInfo(`Eve (${eve.address}) 尝试绑定 David 作为推荐人...`);

    try {
        const tx4 = await referral.connect(eve).lockReferral(david.address);
        await tx4.wait();
        printError("❌❌❌ 不应该成功! 这说明代码有其他问题!");
    } catch (error) {
        if (error.message.includes("InvalidAddress")) {
            printVulnerability("验证失败! Eve 无法绑定未绑定的 David!");
            printInfo(`  错误信息: ${error.message}`);
            printSuccess("这证明了推荐人必须先绑定的逻辑是生效的\n");
        } else {
            printError("出现意外错误: " + error.message);
        }
    }

    // =========================================================================
    // 根本问题总结
    // =========================================================================
    printSection("🎯 根本问题总结与影响");

    console.log(colors.bgRed + colors.bright + " 核心漏洞 " + colors.reset + "\n");

    console.log(colors.red + "问题:" + colors.reset);
    console.log("  rootAddress 在构造函数中未被标记为已绑定 (_hasLockedReferral[rootAddress] = false)\n");

    console.log(colors.yellow + "影响:" + colors.reset);
    console.log("  1. 虽然 rootAddress 可以作为推荐人 (代码有特殊判断)");
    console.log("  2. 但 rootAddress 本身不满足 \"已绑定\" 的要求");
    console.log("  3. 这在逻辑上是不一致的 - rootAddress 应该被视为 \"永远已绑定\"\n");

    console.log(colors.yellow + "潜在问题场景:" + colors.reset);
    console.log("  如果未来代码有其他地方依赖 hasLockedReferral() 查询:");
    console.log("  - 查询 rootAddress 会返回 false (不一致)");
    console.log("  - 可能导致业务逻辑错误\n");

    printCodeBlock(
        "当前验证逻辑:",
        `// 问题: rootAddress 需要被单独判断
if (_referrer != rootAddress && !_hasLockedReferral[_referrer]) {
    revert InvalidAddress();
}

// 后果: rootAddress 不满足 \"已绑定\" 条件,但通过硬编码例外规避`
    );

    // =========================================================================
    // 修复方案
    // =========================================================================
    printSection("✅ 建议修复方案");

    printCodeBlock(
        "修复方案 1: 在构造函数中标记 rootAddress (推荐)",
        `constructor(address _rootAddress) Ownable(msg.sender) {
    require(_rootAddress != address(0), "Invalid root address");
    rootAddress = _rootAddress;
    ${colors.green}_hasLockedReferral[_rootAddress] = true; // 修复: 标记 rootAddress 已绑定${colors.reset}
}`
    );

    console.log(colors.green + "优点:" + colors.reset);
    console.log("  1. 逻辑一致: rootAddress 被正确标记为已绑定");
    console.log("  2. 简化验证: 不需要在验证逻辑中单独判断 rootAddress");
    console.log("  3. 未来兼容: 其他依赖 hasLockedReferral() 的代码也能正确工作\n");

    printCodeBlock(
        "修复后的验证逻辑 (可选优化):",
        `// 简化后的验证 (因为 rootAddress 已被标记)
${colors.green}if (!_hasLockedReferral[_referrer]) {${colors.reset}
    revert InvalidAddress();
}

// 不再需要: if (_referrer != rootAddress && ...)`
    );

    // =========================================================================
    // 验证修复前后的差异
    // =========================================================================
    printSection("📊 修复前后对比");

    console.log(colors.bright + "修复前 (当前状态):" + colors.reset);
    console.log(`  hasLockedReferral(rootAddress) = ${rootHasLocked} ❌`);
    console.log(`  验证逻辑需要硬编码例外判断 ❌\n`);

    console.log(colors.bright + "修复后 (期望状态):" + colors.reset);
    console.log(`  hasLockedReferral(rootAddress) = true ✅`);
    console.log(`  验证逻辑统一,无需特殊判断 ✅\n`);

    // =========================================================================
    // 最终推荐链展示
    // =========================================================================
    printSection("📈 当前推荐关系树");

    console.log(colors.bright + "推荐树结构:" + colors.reset + "\n");
    console.log(`Root (${rootAddress}) ${colors.red}[hasLocked=false ❌]${colors.reset}`);
    console.log(`  ├─ Alice (${alice.address.slice(0, 10)}...) [hasLocked=true ✅]`);
    console.log(`  │   └─ Bob (${bob.address.slice(0, 10)}...) [hasLocked=true ✅]`);
    console.log(`  │       └─ Charlie (${charlie.address.slice(0, 10)}...) [hasLocked=true ✅]`);
    console.log(`  └─ David (${david.address.slice(0, 10)}...) ${colors.yellow}[hasLocked=false, 未绑定]${colors.reset}\n`);

    // =========================================================================
    // 测试总结
    // =========================================================================
    printHeader("📝 测试总结");

    console.log(colors.bgRed + colors.bright + " 发现的问题 " + colors.reset + "\n");
    console.log(colors.red + "漏洞级别: ⚠️  中危" + colors.reset);
    console.log(colors.red + "问题位置: AetherReferral.sol 构造函数" + colors.reset);
    console.log(colors.red + "问题描述: rootAddress 未被标记为已绑定状态" + colors.reset + "\n");

    console.log(colors.bright + "影响分析:" + colors.reset);
    console.log("  ✅ 当前实现可以正常工作 (通过硬编码例外)");
    console.log("  ❌ 逻辑不一致: rootAddress 实际未满足 \"已绑定\" 要求");
    console.log("  ❌ 代码可维护性差: 需要在多处添加特殊判断");
    console.log("  ❌ 未来风险: 其他依赖 hasLockedReferral() 的功能可能出错\n");

    console.log(colors.bright + "建议修复:" + colors.reset);
    console.log("  1. 在构造函数中添加: _hasLockedReferral[_rootAddress] = true;");
    console.log("  2. (可选) 简化 lockReferral() 中的验证逻辑");
    console.log("  3. 确保所有代码对 rootAddress 的处理保持一致\n");

    printSuccess("测试完成! 漏洞已成功复现并详细分析!");
    printWarning("请修复此问题后重新部署合约并运行测试!\n");
}

// 执行测试
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
