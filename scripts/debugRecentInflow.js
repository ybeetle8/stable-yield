const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(80));
    console.log("🔍 调试 getRecentNetworkInflow() 函数");
    console.log("=".repeat(80));
    console.log();

    // 从部署文件读取合约地址
    const deployment = require("../syi-deployment.json");
    const STAKING_ADDRESS = deployment.contracts.Staking;

    console.log("Staking 合约地址:", STAKING_ADDRESS);
    console.log();

    // 获取合约实例
    const staking = await ethers.getContractAt("Staking", STAKING_ADDRESS);

    // 获取当前区块信息
    const provider = ethers.provider;
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    const currentTimestamp = block.timestamp;

    console.log("=".repeat(80));
    console.log("📅 当前区块信息");
    console.log("=".repeat(80));
    console.log("区块高度:", blockNumber);
    console.log("区块时间:", currentTimestamp);
    console.log("时间戳日期:", new Date(currentTimestamp * 1000).toISOString());
    console.log();

    // 查询基本信息
    const totalSupply = await staking.totalSupply();
    const recentInflow = await staking.getRecentNetworkInflow();
    const NETWORK_CHECK_INTERVAL = 60; // 1 minute in seconds

    const cutoffTime = currentTimestamp - NETWORK_CHECK_INTERVAL;

    console.log("=".repeat(80));
    console.log("📊 当前状态");
    console.log("=".repeat(80));
    console.log("totalSupply (当前总供应量):", ethers.formatEther(totalSupply), "sSYI");
    console.log("recentInflow (最近1分钟流入):", ethers.formatEther(recentInflow), "SYI");
    console.log("cutoffTime (1分钟前):", cutoffTime);
    console.log("cutoffTime 日期:", new Date(cutoffTime * 1000).toISOString());
    console.log();

    // 读取 t_supply 数组
    console.log("=".repeat(80));
    console.log("📜 t_supply 数组内容 (质押历史记录)");
    console.log("=".repeat(80));

    let index = 0;
    let records = [];

    try {
        while (true) {
            try {
                const record = await staking.t_supply(index);
                records.push({
                    index: index,
                    stakeTime: Number(record.stakeTime),
                    tamount: record.tamount
                });
                index++;
            } catch (error) {
                // 数组读取完毕
                break;
            }
        }
    } catch (error) {
        console.log("读取数组出错:", error.message);
    }

    console.log(`\n找到 ${records.length} 条历史记录:\n`);

    if (records.length === 0) {
        console.log("⚠️  t_supply 数组为空，没有历史质押记录");
        console.log("    这种情况下 recentInflow 应该返回 0");
        console.log();
    } else {
        console.log("索引 | 质押时间戳      | 时间距离现在        | 累计供应量 (sSYI)    | 是否在1分钟内");
        console.log("-".repeat(80));

        for (const record of records) {
            const timeAgo = currentTimestamp - record.stakeTime;
            const isRecent = timeAgo <= NETWORK_CHECK_INTERVAL;
            const timeAgoStr = timeAgo < 60
                ? `${timeAgo}秒前`
                : timeAgo < 3600
                ? `${Math.floor(timeAgo / 60)}分钟前`
                : timeAgo < 86400
                ? `${Math.floor(timeAgo / 3600)}小时前`
                : `${Math.floor(timeAgo / 86400)}天前`;

            const date = new Date(record.stakeTime * 1000).toISOString().replace('T', ' ').slice(0, 19);

            console.log(
                `${String(record.index).padStart(4)} | ` +
                `${String(record.stakeTime).padStart(15)} | ` +
                `${timeAgoStr.padStart(18)} | ` +
                `${ethers.formatEther(record.tamount).padStart(18)} | ` +
                `${isRecent ? '✅ 是' : '❌ 否'}`
            );
            console.log(`     | ${date} |`);
        }
        console.log();
    }

    // 模拟计算过程
    console.log("=".repeat(80));
    console.log("🔬 模拟 getRecentNetworkInflow() 计算过程");
    console.log("=".repeat(80));
    console.log();

    if (records.length === 0) {
        console.log("1. recordCount = 0");
        console.log("2. 返回 0");
    } else {
        console.log(`1. recordCount = ${records.length}`);
        console.log(`2. cutoffTime = ${currentTimestamp} - 60 = ${cutoffTime}`);
        console.log(`3. previousTotalSupply = ${ethers.formatEther(totalSupply)} (初始值)`);
        console.log();
        console.log("4. 从最新记录开始往前遍历:");
        console.log();

        let previousTotalSupply = totalSupply;

        // 倒序遍历
        for (let i = records.length - 1; i >= 0; i--) {
            const record = records[i];
            const isInTimeWindow = cutoffTime <= record.stakeTime;

            console.log(`   索引 ${i}:`);
            console.log(`     record.stakeTime = ${record.stakeTime}`);
            console.log(`     cutoffTime > record.stakeTime? ${cutoffTime} > ${record.stakeTime} = ${cutoffTime > record.stakeTime}`);

            if (cutoffTime > record.stakeTime) {
                console.log(`     ❌ 超过1分钟，跳出循环`);
                break;
            } else {
                console.log(`     ✅ 在1分钟内，更新 previousTotalSupply = ${ethers.formatEther(record.tamount)}`);
                previousTotalSupply = record.tamount;
            }
            console.log();
        }

        console.log(`5. 最终 previousTotalSupply = ${ethers.formatEther(previousTotalSupply)}`);
        console.log(`6. recentInflow = totalSupply - previousTotalSupply`);
        console.log(`              = ${ethers.formatEther(totalSupply)} - ${ethers.formatEther(previousTotalSupply)}`);
        console.log(`              = ${ethers.formatEther(totalSupply - previousTotalSupply)}`);
    }

    console.log();
    console.log("=".repeat(80));
    console.log("🎯 结论");
    console.log("=".repeat(80));
    console.log();

    if (records.length === 0) {
        console.log("⚠️  没有历史记录，但 recentInflow 却显示有值");
        console.log("    可能的原因:");
        console.log("    1. 链上已有历史质押（fork的链）");
        console.log("    2. 合约状态不一致");
    } else {
        const recentRecords = records.filter(r => (currentTimestamp - r.stakeTime) <= NETWORK_CHECK_INTERVAL);
        console.log(`📌 最近 1 分钟内有 ${recentRecords.length} 条质押记录`);

        if (recentRecords.length > 0) {
            console.log("\n这些记录导致计算出流入量:");
            for (const r of recentRecords) {
                const timeAgo = currentTimestamp - r.stakeTime;
                console.log(`   - ${timeAgo}秒前: 累计供应 ${ethers.formatEther(r.tamount)} sSYI`);
            }
        } else {
            console.log("\n⚠️  没有记录在1分钟内，但计算出流入量 = 300 SYI");
            console.log("    问题分析:");
            console.log("    1. 检查最旧的记录时间");
            const oldestRecord = records[0];
            const oldestTimeAgo = currentTimestamp - oldestRecord.stakeTime;
            console.log(`       最旧记录: ${oldestTimeAgo}秒前 (${Math.floor(oldestTimeAgo / 60)}分钟前)`);

            if (oldestTimeAgo > NETWORK_CHECK_INTERVAL) {
                console.log(`       ✅ 最旧记录超过1分钟，逻辑正确`);
                console.log();
                console.log("    2. 可能原因：previousTotalSupply 回退到了历史值");
                console.log(`       当前 totalSupply = ${ethers.formatEther(totalSupply)}`);

                // 找出会被采用的 previousTotalSupply
                let calculatedPrevious = totalSupply;
                for (let i = records.length - 1; i >= 0; i--) {
                    if (cutoffTime > records[i].stakeTime) {
                        break;
                    }
                    calculatedPrevious = records[i].tamount;
                }
                console.log(`       计算的 previousTotalSupply = ${ethers.formatEther(calculatedPrevious)}`);
                console.log();
                console.log(`    3. 结论: 所有历史记录的时间都在1分钟内（或更早）`);
                console.log(`       导致 previousTotalSupply 被回退到最早的记录值`);
            }
        }
    }

    console.log();
    console.log("=".repeat(80));
    console.log("✅ 调试完成");
    console.log("=".repeat(80));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ 调试失败:");
        console.error(error);
        process.exit(1);
    });
