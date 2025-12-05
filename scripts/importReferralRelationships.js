const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("========================================");
    console.log("开始导入推荐关系到新合约...");
    console.log("========================================\n");

    // 获取管理员账户
    const [admin] = await hre.ethers.getSigners();
    console.log("管理员账户:", admin.address);
    console.log("账户余额:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(admin.address)), "ETH\n");

    // 读取部署信息
    const deploymentPath = path.join(__dirname, '..', 'aether-referral-deployment.json');
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("未找到部署信息文件: aether-referral-deployment.json");
    }
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const contractAddress = deploymentInfo.contractAddress;
    const rootAddress = deploymentInfo.rootAddress;

    console.log("合约地址:", contractAddress);
    console.log("根地址:", rootAddress, "\n");

    // 连接到合约
    const AetherReferral = await hre.ethers.getContractFactory("AetherReferral");
    const referral = AetherReferral.attach(contractAddress);

    // 读取推荐关系数据
    const relationshipsPath = path.join(__dirname, '..', 'referral-relationships.json');
    if (!fs.existsSync(relationshipsPath)) {
        throw new Error("未找到推荐关系文件: referral-relationships.json");
    }
    const relationshipsData = JSON.parse(fs.readFileSync(relationshipsPath, 'utf8'));
    const relationships = relationshipsData.relationships;

    console.log("========================================");
    console.log("推荐关系数据统计:");
    console.log("========================================");
    console.log("总用户数:", relationshipsData.statistics.total);
    console.log("有推荐人:", relationshipsData.statistics.withReferrer);
    console.log("无推荐人:", relationshipsData.statistics.withoutReferrer);
    console.log("");

    // 将推荐关系转换为数组
    const relationshipsArray = [];
    for (const [user, info] of Object.entries(relationships)) {
        if (info.hasReferral && info.referrer) {
            relationshipsArray.push({
                user: user,
                referrer: info.referrer
            });
        }
    }

    console.log("待导入的推荐关系数量:", relationshipsArray.length);
    console.log("");

    // 按层级排序（父节点优先）
    // 使用拓扑排序确保推荐人先被绑定
    console.log("正在按推荐层级排序...");
    const sortedRelationships = topologicalSort(relationshipsArray, rootAddress);
    console.log("排序完成，共", sortedRelationships.length, "条关系\n");

    // 批量导入
    console.log("========================================");
    console.log("开始批量导入推荐关系...");
    console.log("========================================\n");

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < sortedRelationships.length; i++) {
        const { user, referrer } = sortedRelationships[i];

        try {
            // 检查是否已绑定
            const hasLocked = await referral.hasLockedReferral(user);
            if (hasLocked) {
                console.log(`[${i + 1}/${sortedRelationships.length}] ⏭️  跳过 ${user} (已绑定)`);
                skipCount++;
                continue;
            }

            // 验证推荐人是否已绑定
            const referrerLocked = await referral.hasLockedReferral(referrer);
            if (!referrerLocked && referrer.toLowerCase() !== rootAddress.toLowerCase()) {
                console.log(`[${i + 1}/${sortedRelationships.length}] ⚠️  跳过 ${user} -> ${referrer} (推荐人未绑定)`);
                errorCount++;
                console.log("");
                continue;
            }

            // 调用 adminBindReferral
            console.log(`[${i + 1}/${sortedRelationships.length}] 🔄 绑定 ${user} -> ${referrer}`);

            const tx = await referral.adminBindReferral(user, referrer, {
                gasLimit: 200000 // 设置固定 gas limit
            });

            console.log(`   📤 交易已发送: ${tx.hash}`);
            console.log(`   ⏳ 等待确认...`);

            // 设置 60 秒超时
            const receipt = await Promise.race([
                tx.wait(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('交易确认超时 (60秒)')), 60000)
                )
            ]);

            console.log(`   ✅ 成功确认 (区块: ${receipt.blockNumber}, gas: ${receipt.gasUsed.toString()})`);
            successCount++;

            // 每个交易后延迟，避免网络拥堵
            await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (error) {
            console.log(`   ❌ 失败: ${error.reason || error.message}`);

            // 如果是 gas 相关错误，显示详细信息
            if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
                console.log(`   📝 详情: gas 估算失败，可能是合约 revert`);
            }

            // 如果是超时错误，询问用户是否继续
            if (error.message && error.message.includes('超时')) {
                console.log(`   ⚠️  交易可能仍在处理中，建议检查区块链浏览器`);
                console.log(`   💡 提示: 可以稍后重新运行脚本，已绑定的会自动跳过`);
            }

            errorCount++;

            // 失败后延迟更长时间
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        console.log("");
    }

    console.log("========================================");
    console.log("导入完成！");
    console.log("========================================");
    console.log("成功:", successCount);
    console.log("跳过:", skipCount);
    console.log("失败:", errorCount);
    console.log("总计:", sortedRelationships.length);
    console.log("");

    // 验证导入结果
    console.log("========================================");
    console.log("验证导入结果...");
    console.log("========================================\n");

    let verifySuccess = 0;
    for (const { user, referrer } of sortedRelationships) {
        const actualReferrer = await referral.getReferral(user);
        if (actualReferrer.toLowerCase() === referrer.toLowerCase()) {
            verifySuccess++;
        } else {
            console.log(`⚠️  验证失败: ${user}`);
            console.log(`   期望推荐人: ${referrer}`);
            console.log(`   实际推荐人: ${actualReferrer}`);
        }
    }

    console.log(`验证完成: ${verifySuccess}/${sortedRelationships.length} 条关系正确\n`);

    if (verifySuccess === sortedRelationships.length) {
        console.log("🎉 所有推荐关系导入成功！");
    } else {
        console.log("⚠️  部分推荐关系导入失败，请检查日志");
    }
}

/**
 * 拓扑排序：确保推荐人先被绑定
 * 策略：从根地址开始，层层向下绑定
 * @param {Array} relationships - 推荐关系数组 [{user, referrer}]
 * @param {string} rootAddress - 根地址
 * @returns {Array} 排序后的推荐关系数组（从根到叶）
 */
function topologicalSort(relationships, rootAddress) {
    const rootLower = rootAddress.toLowerCase();

    // 构建推荐关系图：referrer -> [users]
    const childrenMap = new Map();
    const userToReferrer = new Map();

    for (const { user, referrer } of relationships) {
        const userLower = user.toLowerCase();
        const referrerLower = referrer.toLowerCase();

        userToReferrer.set(userLower, referrerLower);

        if (!childrenMap.has(referrerLower)) {
            childrenMap.set(referrerLower, []);
        }
        childrenMap.get(referrerLower).push({ user, referrer });
    }

    // BFS 从根地址开始遍历
    const result = [];
    const queue = [rootLower];
    const visited = new Set([rootLower]);

    while (queue.length > 0) {
        const current = queue.shift();
        const children = childrenMap.get(current) || [];

        for (const relation of children) {
            const userLower = relation.user.toLowerCase();

            if (!visited.has(userLower)) {
                visited.add(userLower);
                result.push(relation);
                queue.push(userLower);
            }
        }
    }

    // 检查是否有孤立节点（推荐人不在图中的）
    const orphans = [];
    for (const { user, referrer } of relationships) {
        const userLower = user.toLowerCase();
        if (!visited.has(userLower)) {
            orphans.push({ user, referrer });
            console.warn(`⚠️  警告: ${user} 的推荐人 ${referrer} 不在推荐链中`);
        }
    }

    // 将孤立节点添加到结果末尾
    result.push(...orphans);

    return result;
}

// 执行导入
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
