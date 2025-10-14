const { ethers } = require("hardhat");

async function main() {
    console.log("=".repeat(60));
    console.log("测试 maxStakeAmount() 函数");
    console.log("=".repeat(60));
    console.log();

    // 从部署文件读取合约地址
    const deployment = require("../syi-deployment.json");

    const SYI_ADDRESS = deployment.contracts.SYI;
    const STAKING_ADDRESS = deployment.contracts.Staking;
    const USDT_ADDRESS = deployment.contracts.USDT;

    console.log("合约地址:");
    console.log("  SYI:     ", SYI_ADDRESS);
    console.log("  Staking: ", STAKING_ADDRESS);
    console.log("  USDT:    ", USDT_ADDRESS);
    console.log();

    // 获取合约实例
    const staking = await ethers.getContractAt("Staking", STAKING_ADDRESS);
    const syi = await ethers.getContractAt("SYI", SYI_ADDRESS);
    const usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDT_ADDRESS);

    console.log("=".repeat(60));
    console.log("📊 全局限额信息");
    console.log("=".repeat(60));

    // 1. 查询 maxStakeAmount
    const maxStakeAmount = await staking.maxStakeAmount();
    console.log("\n🎯 当前单笔最大质押额 (maxStakeAmount):");
    console.log("   ", ethers.formatEther(maxStakeAmount), "SYI");

    if (maxStakeAmount === 0n) {
        console.log("   ⚠️  当前暂停质押（流入过快）");
    } else if (maxStakeAmount >= ethers.parseEther("1000")) {
        console.log("   ✅ 达到最高限额 1000 SYI");
    } else {
        console.log("   ⚠️  受到流入速度限制");
    }

    console.log("\n" + "=".repeat(60));
    console.log("🌊 流动性池信息");
    console.log("=".repeat(60));

    // 2. 查询流动性池储备
    try {
        const usdtReserve = await syi.getUSDTReserve();
        const onePercentThreshold = usdtReserve / 100n;

        console.log("\n💰 USDT 储备量:");
        console.log("   ", ethers.formatEther(usdtReserve), "USDT");
        console.log("\n📏 1% 阈值:");
        console.log("   ", ethers.formatEther(onePercentThreshold), "USDT");
    } catch (error) {
        console.log("\n⚠️  无法查询流动性池信息:", error.message);
    }

    console.log("\n" + "=".repeat(60));
    console.log("📈 网络流入统计");
    console.log("=".repeat(60));

    // 3. 查询最近流入量
    const recentInflow = await staking.getRecentNetworkInflow();
    console.log("\n⏱️  最近 1 分钟流入量:");
    console.log("   ", ethers.formatEther(recentInflow), "SYI");

    // 4. 查询总供应量
    const totalSupply = await staking.totalSupply();
    console.log("\n📊 全局质押总量 (totalSupply):");
    console.log("   ", ethers.formatEther(totalSupply), "sSYI");

    console.log("\n" + "=".repeat(60));
    console.log("🔍 限额计算详情");
    console.log("=".repeat(60));

    try {
        const usdtReserve = await syi.getUSDTReserve();
        const onePercentThreshold = usdtReserve / 100n;
        const MAX_STAKE_LIMIT = ethers.parseEther("1000"); // 单笔最大 1000 SYI

        console.log("\n计算过程:");
        console.log("1. USDT 储备的 1%:", ethers.formatEther(onePercentThreshold), "USDT");
        console.log("2. 最近 1 分钟流入:", ethers.formatEther(recentInflow), "SYI");

        if (recentInflow > onePercentThreshold) {
            console.log("3. 判断: 流入 > 1% 阈值 → 暂停质押 (返回 0)");
            console.log("   ", ethers.formatEther(recentInflow), ">", ethers.formatEther(onePercentThreshold));
        } else {
            const availableCapacity = onePercentThreshold - recentInflow;
            console.log("3. 剩余容量:", ethers.formatEther(availableCapacity), "USDT");
            console.log("4. 单笔限额:", ethers.formatEther(MAX_STAKE_LIMIT), "SYI");
            console.log("5. 取最小值: min(", ethers.formatEther(availableCapacity), ",", ethers.formatEther(MAX_STAKE_LIMIT), ")");
            console.log("6. 最终限额:", ethers.formatEther(maxStakeAmount), "SYI");
        }
    } catch (error) {
        console.log("⚠️  无法计算详细信息:", error.message);
    }

    console.log("\n" + "=".repeat(60));
    console.log("👤 测试用户限额 (以 deployer 为例)");
    console.log("=".repeat(60));

    const [deployer] = await ethers.getSigners();
    console.log("\n用户地址:", deployer.address);

    // 5. 查询用户剩余额度
    const userRemaining = await staking.getRemainingStakeCapacity(deployer.address);
    console.log("\n🎫 用户剩余质押额度:");
    console.log("   ", ethers.formatEther(userRemaining), "SYI");
    console.log("    (累计上限 10,000 SYI)");

    // 6. 查询用户 USDT 余额
    const usdtBalance = await usdt.balanceOf(deployer.address);
    console.log("\n💵 用户 USDT 余额:");
    console.log("   ", ethers.formatEther(usdtBalance), "USDT");

    // 7. 查询用户授权额度
    const allowance = await usdt.allowance(deployer.address, STAKING_ADDRESS);
    console.log("\n🔓 USDT 授权额度:");
    console.log("   ", ethers.formatEther(allowance), "USDT");

    // 8. 计算最终可质押额度
    console.log("\n" + "=".repeat(60));
    console.log("🎯 最终可质押额度 (4个限制的最小值)");
    console.log("=".repeat(60));

    const limits = {
        "全局限额": maxStakeAmount,
        "用户剩余额度": userRemaining,
        "USDT余额": usdtBalance,
        "USDT授权": allowance
    };

    console.log();
    for (const [name, value] of Object.entries(limits)) {
        const formatted = ethers.formatEther(value);
        console.log(`  ${name.padEnd(15)} ${formatted.padStart(20)} SYI/USDT`);
    }

    const finalMaxAmount = Object.values(limits).reduce((min, current) =>
        current < min ? current : min
    );

    console.log("\n" + "-".repeat(60));
    console.log(`  🏆 最终限额:     ${ethers.formatEther(finalMaxAmount).padStart(20)} SYI`);
    console.log("-".repeat(60));

    // 找出限制因素
    const limitingFactor = Object.entries(limits).find(([_, value]) => value === finalMaxAmount)?.[0];
    console.log(`\n  📌 限制因素: ${limitingFactor}`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ 测试完成");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ 测试失败:");
        console.error(error);
        process.exit(1);
    });
