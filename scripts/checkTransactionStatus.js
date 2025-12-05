const hre = require("hardhat");

async function main() {
    // 你卡住的交易地址
    const userToCheck = "0x7fd91dc1ac0d5b5519f50aa0702c0cec458e77a1";
    const expectedReferrer = "0xF4d1cD67cD570aE5e78ae89Bf664A299DeEdEFC7";

    // 读取部署信息
    const fs = require('fs');
    const path = require('path');
    const deploymentPath = path.join(__dirname, '..', 'aether-referral-deployment.json');
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

    const AetherReferral = await hre.ethers.getContractFactory("AetherReferral");
    const referral = AetherReferral.attach(deploymentInfo.contractAddress);

    console.log("========================================");
    console.log("检查地址绑定状态");
    console.log("========================================");
    console.log("合约地址:", deploymentInfo.contractAddress);
    console.log("检查地址:", userToCheck);
    console.log("");

    try {
        // 检查是否已绑定
        const hasLocked = await referral.hasLockedReferral(userToCheck);
        console.log("✓ 是否已绑定推荐人:", hasLocked);

        if (hasLocked) {
            const actualReferrer = await referral.getReferral(userToCheck);
            console.log("✓ 实际推荐人:", actualReferrer);
            console.log("✓ 期望推荐人:", expectedReferrer);
            console.log("✓ 匹配:", actualReferrer.toLowerCase() === expectedReferrer.toLowerCase() ? "是" : "否");
        } else {
            console.log("✗ 该地址尚未绑定推荐人");
        }

        console.log("");
        console.log("========================================");
        console.log("检查账户状态");
        console.log("========================================");

        const [admin] = await hre.ethers.getSigners();
        console.log("管理员地址:", admin.address);

        const balance = await hre.ethers.provider.getBalance(admin.address);
        console.log("账户余额:", hre.ethers.formatEther(balance), "BNB");

        // 获取待处理交易数
        const pendingTxCount = await hre.ethers.provider.getTransactionCount(admin.address, "pending");
        const confirmedTxCount = await hre.ethers.provider.getTransactionCount(admin.address, "latest");

        console.log("已确认交易数:", confirmedTxCount);
        console.log("待处理交易数:", pendingTxCount);
        console.log("卡住的交易:", pendingTxCount - confirmedTxCount);

        if (pendingTxCount > confirmedTxCount) {
            console.log("");
            console.log("⚠️  警告: 有交易在队列中等待确认");
            console.log("可能原因:");
            console.log("  1. Gas 价格过低，矿工不愿打包");
            console.log("  2. 网络拥堵");
            console.log("  3. Nonce 冲突");
            console.log("");
            console.log("建议:");
            console.log("  - 等待当前交易确认后再继续");
            console.log("  - 或使用更高的 gas 价格");
        }

        console.log("");
        console.log("========================================");
        console.log("当前网络 Gas 信息");
        console.log("========================================");

        const feeData = await hre.ethers.provider.getFeeData();
        console.log("Gas Price:", hre.ethers.formatUnits(feeData.gasPrice, "gwei"), "Gwei");

    } catch (error) {
        console.error("❌ 错误:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
