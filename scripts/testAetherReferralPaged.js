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

async function main() {
    printHeader("Aether-Referral 分页查询功能测试");

    // 读取部署信息
    const deploymentPath = path.join(__dirname, '..', 'aether-referral-deployment.json');
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ 未找到部署信息文件,请先运行部署脚本!");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const referralAddress = deploymentInfo.contractAddress;

    printInfo(`合约地址: ${referralAddress}`);

    // 获取合约实例
    const referral = await hre.ethers.getContractAt("AetherReferral", referralAddress);

    // 获取测试账户 - 我们需要多一点账户来模拟分页
    // Hardhat 默认提供 20 个账户
    const signers = await hre.ethers.getSigners();
    const parent = signers[0]; // 使用第一个账户作为推荐人
    const children = signers.slice(1); // 剩下的作为下线

    printInfo(`测试父账户: ${parent.address}`);
    printInfo(`准备绑定 ${children.length} 个下线到父账户...`);

    // =========================================================================
    // 步骤 1: 批量绑定下线
    // =========================================================================
    printHeader("步骤 1: 批量绑定下线");

    let boundCount = 0;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        
        // 检查是否已经绑定了
        const hasLocked = await referral.hasLockedReferral(child.address);
        if (!hasLocked) {
            try {
                const tx = await referral.connect(child).lockReferral(parent.address);
                await tx.wait();
                process.stdout.write("."); // 进度条效果
                boundCount++;
            } catch (e) {
                console.log(`\n❌ 账户 ${child.address} 绑定失败: ${e.message}`);
            }
        } else {
            // 如果已经绑定了，检查推荐人是不是我们的父账户
            const referrer = await referral.getReferral(child.address);
            if (referrer === parent.address) {
                process.stdout.write("s"); // skip
                boundCount++;
            } else {
                 process.stdout.write("x"); // bound to someone else
            }
        }
    }
    console.log("\n");
    printSuccess(`绑定完成或确认已绑定。`);

    // 获取实际下线总数
    const totalChildren = await referral.getChildrenCount(parent.address);
    printInfo(`当前直接下线总数: ${totalChildren}`);

    if (totalChildren == 0) {
        console.error("❌ 没有下线，无法测试分页。请确保使用的是新的测试网络或手动重置状态。");
        return;
    }

    // =========================================================================
    // 步骤 2: 测试全量查询 (基准对照)
    // =========================================================================
    printHeader("步骤 2: 全量查询 (基准)");
    
    const allChildren = await referral.getChildren(parent.address);
    // console.log("所有下线:", allChildren);
    printSuccess(`成功获取所有 ${allChildren.length} 个下线`);


    // =========================================================================
    // 步骤 3: 测试分页查询
    // =========================================================================
    printHeader("步骤 3: 分页查询测试");

    const pageSize = 5;
    let fetchedCount = 0;
    let pages = 0;
    
    printInfo(`每页大小: ${pageSize}`);

    while (fetchedCount < totalChildren) {
        const offset = fetchedCount;
        printInfo(`查询第 ${pages + 1} 页 (Offset: ${offset}, Limit: ${pageSize})...
`);
        
        const pageResult = await referral.getChildrenPaged(parent.address, offset, pageSize);
        
        // 验证返回数量
        const expectedCount = Math.min(Number(pageSize), Number(totalChildren) - Number(fetchedCount));
        if (pageResult.length !== expectedCount) {
             console.error(`❌ 错误: 期望返回 ${expectedCount} 个，实际返回 ${pageResult.length} 个`);
        }

        // 验证数据正确性
        let pageValid = true;
        for (let i = 0; i < pageResult.length; i++) {
            if (pageResult[i] !== allChildren[offset + i]) {
                pageValid = false;
                console.error(`❌ 数据不匹配! 索引 ${offset + i}: 期望 ${allChildren[offset + i]}, 实际 ${pageResult[i]}`);
            }
        }

        if (pageValid) {
            printSuccess(`第 ${pages + 1} 页数据验证通过 (${pageResult.length} 条)`);
        }

        fetchedCount += pageResult.length;
        pages++;
    }

    printSuccess(`分页读取完成! 共读取 ${fetchedCount} 条数据，分 ${pages} 页。`);

    // =========================================================================
    // 步骤 4: 边界情况测试
    // =========================================================================
    printHeader("步骤 4: 边界情况测试");

    // Case A: Offset 超出范围
    printInfo("Case A: Offset 超出范围");
    const outOfBoundsResult = await referral.getChildrenPaged(parent.address, totalChildren + 1n, 5);
    if (outOfBoundsResult.length === 0) {
        printSuccess("Offset 超出范围返回空数组 - 通过");
    } else {
        console.error(`❌ Offset 超出范围应返回空数组，实际返回长度: ${outOfBoundsResult.length}`);
    }

    // Case B: Limit 非常大
    printInfo("Case B: Limit 非常大 (超过剩余数量)");
    const largeLimitResult = await referral.getChildrenPaged(parent.address, 0, 1000);
    if (largeLimitResult.length === Number(totalChildren)) {
        printSuccess("Limit 过大自动截断 - 通过");
    } else {
        console.error(`❌ Limit 过大应返回所有数据，实际返回长度: ${largeLimitResult.length}, 期望: ${totalChildren}`);
    }

    // Case C: Offset + Limit 正好等于 Total
    printInfo("Case C: Offset + Limit 正好等于 Total");
    if (totalChildren > 0) {
        const lastOneResult = await referral.getChildrenPaged(parent.address, totalChildren - 1n, 1);
        if (lastOneResult.length === 1 && lastOneResult[0] === allChildren[totalChildren - 1n]) {
            printSuccess("读取最后一个元素 - 通过");
        } else {
            console.error("❌ 读取最后一个元素失败");
        }
    }

    printHeader("测试全部完成!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
