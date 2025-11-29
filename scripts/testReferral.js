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

function printWarning(message) {
    console.log(colors.yellow + "⚠️  " + message + colors.reset);
}

async function main() {
    printHeader("SYI-Referral 合约测试");

    // 读取部署信息
    const deploymentPath = path.join(__dirname, '..', 'syi-referral-deployment.json');
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ 未找到部署信息文件,请先运行部署脚本!");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const referralAddress = deploymentInfo.contractAddress;

    printInfo(`合约地址: ${referralAddress}`);
    printInfo(`根地址: ${deploymentInfo.rootAddress}\n`);

    // 获取合约实例
    const referral = await hre.ethers.getContractAt("SYIReferral", referralAddress);

    // 获取测试账户(生成10个地址)
    const signers = await hre.ethers.getSigners();
    const accounts = signers.slice(0, 10);

    printHeader("测试账户信息");
    console.log("生成10个测试地址:\n");
    for (let i = 0; i < accounts.length; i++) {
        console.log(`账户 ${i}: ${accounts[i].address}`);
    }

    // =========================================================================
    // 测试 1: 建立推荐关系
    // =========================================================================
    printHeader("测试 1: 建立推荐关系");

    console.log("建立推荐关系树:");
    console.log(`
账户 0 (Root)
    ├─ 账户 1
    │   ├─ 账户 3
    │   │   └─ 账户 7
    │   └─ 账户 4
    │       └─ 账户 8
    └─ 账户 2
        ├─ 账户 5
        │   └─ 账户 9
        └─ 账户 6
    `);

    // 账户1 绑定 账户0 为推荐人
    printInfo("账户1 绑定推荐人 账户0...");
    let tx = await referral.connect(accounts[1]).lockReferral(accounts[0].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户2 绑定 账户0 为推荐人
    printInfo("账户2 绑定推荐人 账户0...");
    tx = await referral.connect(accounts[2]).lockReferral(accounts[0].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户3 绑定 账户1 为推荐人
    printInfo("账户3 绑定推荐人 账户1...");
    tx = await referral.connect(accounts[3]).lockReferral(accounts[1].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户4 绑定 账户1 为推荐人
    printInfo("账户4 绑定推荐人 账户1...");
    tx = await referral.connect(accounts[4]).lockReferral(accounts[1].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户5 绑定 账户2 为推荐人
    printInfo("账户5 绑定推荐人 账户2...");
    tx = await referral.connect(accounts[5]).lockReferral(accounts[2].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户6 绑定 账户2 为推荐人
    printInfo("账户6 绑定推荐人 账户2...");
    tx = await referral.connect(accounts[6]).lockReferral(accounts[2].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户7 绑定 账户3 为推荐人
    printInfo("账户7 绑定推荐人 账户3...");
    tx = await referral.connect(accounts[7]).lockReferral(accounts[3].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户8 绑定 账户4 为推荐人
    printInfo("账户8 绑定推荐人 账户4...");
    tx = await referral.connect(accounts[8]).lockReferral(accounts[4].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户9 绑定 账户5 为推荐人
    printInfo("账户9 绑定推荐人 账户5...");
    tx = await referral.connect(accounts[9]).lockReferral(accounts[5].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // =========================================================================
    // 测试 2: 建立好友关系
    // =========================================================================
    printHeader("测试 2: 建立好友关系");

    // 账户1 绑定 账户2 为好友
    printInfo("账户1 绑定好友 账户2...");
    tx = await referral.connect(accounts[1]).lockFriend(accounts[2].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户3 绑定 账户4 为好友
    printInfo("账户3 绑定好友 账户4...");
    tx = await referral.connect(accounts[3]).lockFriend(accounts[4].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // 账户5 绑定 账户6 为好友
    printInfo("账户5 绑定好友 账户6...");
    tx = await referral.connect(accounts[5]).lockFriend(accounts[6].address);
    await tx.wait();
    printSuccess("绑定成功!");

    // =========================================================================
    // 测试 3: 查询单个用户信息
    // =========================================================================
    printHeader("测试 3: 查询单个用户信息");

    for (let i = 0; i < 10; i++) {
        const userInfo = await referral.getUserInfo(accounts[i].address);
        console.log(`\n${colors.bright}账户 ${i} (${accounts[i].address}):${colors.reset}`);
        console.log(`  推荐人: ${userInfo.referrer === hre.ethers.ZeroAddress ? "未绑定" : userInfo.referrer}`);
        console.log(`  好友: ${userInfo.friend === hre.ethers.ZeroAddress ? "未绑定" : userInfo.friend}`);
        console.log(`  已绑定推荐人: ${userInfo.hasReferral ? "是" : "否"}`);
        console.log(`  已绑定好友: ${userInfo.hasFriend ? "是" : "否"}`);
        console.log(`  直接下线数量: ${userInfo.childrenCount.toString()}`);
    }

    // =========================================================================
    // 测试 4: 查询推荐链
    // =========================================================================
    printHeader("测试 4: 查询推荐链");

    // 查询账户7的推荐链
    console.log(`${colors.bright}查询账户7的推荐链:${colors.reset}`);
    const referrals7 = await referral.getReferrals(accounts[7].address, 30);
    console.log(`推荐链长度: ${referrals7.length}`);
    for (let i = 0; i < referrals7.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === referrals7[i]);
        console.log(`  第${i + 1}层: ${referrals7[i]} (账户 ${accountIndex})`);
    }

    // 查询账户9的推荐链
    console.log(`\n${colors.bright}查询账户9的推荐链:${colors.reset}`);
    const referrals9 = await referral.getReferrals(accounts[9].address, 30);
    console.log(`推荐链长度: ${referrals9.length}`);
    for (let i = 0; i < referrals9.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === referrals9[i]);
        console.log(`  第${i + 1}层: ${referrals9[i]} (账户 ${accountIndex})`);
    }

    // =========================================================================
    // 测试 5: 查询推荐链(带深度)
    // =========================================================================
    printHeader("测试 5: 查询推荐链(带深度)");

    console.log(`${colors.bright}查询账户9的推荐链(带深度):${colors.reset}`);
    const chainWithDepth = await referral.getReferralChainWithDepth(accounts[9].address, 30);
    console.log(`推荐链长度: ${chainWithDepth.chain.length}`);
    for (let i = 0; i < chainWithDepth.chain.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === chainWithDepth.chain[i]);
        console.log(`  深度${chainWithDepth.depths[i]}: ${chainWithDepth.chain[i]} (账户 ${accountIndex})`);
    }

    // =========================================================================
    // 测试 6: 查询直接下线
    // =========================================================================
    printHeader("测试 6: 查询直接下线");

    console.log(`${colors.bright}查询账户0的直接下线:${colors.reset}`);
    const children0 = await referral.getChildren(accounts[0].address);
    console.log(`直接下线数量: ${children0.length}`);
    for (let i = 0; i < children0.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === children0[i]);
        console.log(`  下线${i + 1}: ${children0[i]} (账户 ${accountIndex})`);
    }

    console.log(`\n${colors.bright}查询账户1的直接下线:${colors.reset}`);
    const children1 = await referral.getChildren(accounts[1].address);
    console.log(`直接下线数量: ${children1.length}`);
    for (let i = 0; i < children1.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === children1[i]);
        console.log(`  下线${i + 1}: ${children1[i]} (账户 ${accountIndex})`);
    }

    console.log(`\n${colors.bright}查询账户2的直接下线:${colors.reset}`);
    const children2 = await referral.getChildren(accounts[2].address);
    console.log(`直接下线数量: ${children2.length}`);
    for (let i = 0; i < children2.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === children2[i]);
        console.log(`  下线${i + 1}: ${children2[i]} (账户 ${accountIndex})`);
    }

    // =========================================================================
    // 测试 7: 批量查询用户信息
    // =========================================================================
    printHeader("测试 7: 批量查询用户信息");

    const batchAddresses = [
        accounts[1].address,
        accounts[3].address,
        accounts[5].address,
        accounts[7].address,
        accounts[9].address
    ];

    const batchInfo = await referral.batchGetUserInfo(batchAddresses);
    console.log(`批量查询 ${batchAddresses.length} 个用户:\n`);

    for (let i = 0; i < batchAddresses.length; i++) {
        const accountIndex = accounts.findIndex(acc => acc.address === batchAddresses[i]);
        console.log(`${colors.bright}账户 ${accountIndex}:${colors.reset}`);
        console.log(`  推荐人: ${batchInfo.referrers[i] === hre.ethers.ZeroAddress ? "未绑定" : batchInfo.referrers[i]}`);
        console.log(`  好友: ${batchInfo.friends[i] === hre.ethers.ZeroAddress ? "未绑定" : batchInfo.friends[i]}`);
        console.log(`  已绑定推荐人: ${batchInfo.hasReferrals[i] ? "是" : "否"}`);
        console.log(`  已绑定好友: ${batchInfo.hasFriends[i] ? "是" : "否"}`);
        console.log("");
    }

    // =========================================================================
    // 测试 8: 关系树可视化
    // =========================================================================
    printHeader("测试 8: 关系树可视化");

    console.log(`${colors.bright}推荐关系树:${colors.reset}\n`);
    await printReferralTree(referral, accounts[0].address, accounts, 0);

    // =========================================================================
    // 测试完成
    // =========================================================================
    printHeader("测试完成!");
    printSuccess("所有测试用例执行成功!");
}

// 递归打印推荐树
async function printReferralTree(referral, address, accounts, depth) {
    const indent = "  ".repeat(depth);
    const accountIndex = accounts.findIndex(acc => acc.address === address);
    const children = await referral.getChildren(address);
    const childrenCount = children.length;

    if (depth === 0) {
        console.log(`${indent}${colors.bright}账户 ${accountIndex}${colors.reset} (${address})`);
    } else {
        const symbol = "└─";
        console.log(`${indent}${symbol} ${colors.bright}账户 ${accountIndex}${colors.reset} (下线: ${childrenCount})`);
    }

    for (let i = 0; i < children.length; i++) {
        await printReferralTree(referral, children[i], accounts, depth + 1);
    }
}

// 执行测试
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
