const { ethers } = require("hardhat");
const fs = require("fs");

// Aether-Referral 合约地址 (BSC 主网)
const AETHER_REFERRAL_ADDRESS = "0xBfF0Ab2a2593DC6dFBB6f745B9dB2063EfD6b64B";

// 要查询的地址列表
const ADDRESSES = [
    "0x02394393bb4d69c3f69f4904ab6f564c9b228f00",
    "0x8d76f7be926a50dba9efed61d560f2d29c7c5f55",
    "0x84dcf04179ae8f663b62fec20ac594520fd830b1",
    "0x9f8fc9d0b420d564cc92df762a8ec7981df0bf71",
    "0x04fa3522d47cd7af75a6c277f29ad6a9415ec74a",
    "0x680b005cb589c8faff378d349147b7864f197930",
    "0xf9690d3a042042a8f6e26afd0303b1360461b664",
    "0x7fd91dc1ac0d5b5519f50aa0702c0cec458e77a1",
    "0xfeab9cbbad11d583db7968b8bd5e461ef678af08",
    "0x7ed246aa5ec2d248a34a1f5c038b589fb246ff21",
    "0x61ce05460d3fc6e2cc1d7a4aab3afb1d399fb5b8",
    "0x6df5e1d9ca3c826a7fcd88329df11365ccc83ea9",
    "0xabf430acc4af2a7a74f2affb5aa04447836b7289",
    "0x25f9256c813755ac26673487cb09d4ab87d366b6",
    "0xfc07b628de1b1022ab000214b33f49e727d17159",
    "0xaa6ced5f35e1221c163f279a5fe36c14cb156937",
    "0x15477ac50e504dc0d2cccacbe22fc8c7d2cfab81",
    "0xb6d86540bebed318f7bcf42bce9baa19b500bd39",
    "0xdfb60f4260905722b0444298fb612745855658ee",
    "0x9cd75eee381ae1e1de50e64eba3bb734e6cf8261",
    "0x62c041d9fa400ba7a3717460f9f350bd77f0571d",
    "0xd66ffdf40b7ca68a28c39026726d818cd3dabe32",
    "0xed376faec4485f44762608682949ab95f8707e27",
    "0x6f78b5edfad4216e7a7824f97f3345824d12be28",
    "0xb7a176a070d907b276e0f187e8bd6531a2616632",
    "0xa07895f99e9d88e02a81f22a153fd497c69fe56f",
    "0x745f2fef2a5a45bfcc1c140ead0b76c945e28d36",
    "0x43d1771ccb52706819c82e5f01d3e3bcd5f2e22b",
    "0x3ecfbaa7098fc8aa9ca05fa0b9b22e3fba5cad10"
];

// ABI - 只需要 getUserInfo 函数
const AETHER_REFERRAL_ABI = [
    "function getUserInfo(address user) external view returns (address referrer, address friend, bool hasReferral, bool hasFriend, uint256 childrenCount)"
];

async function main() {
    console.log("=".repeat(60));
    console.log("开始获取 Aether-Referral 推荐关系");
    console.log("=".repeat(60));
    console.log();

    // 连接到 BSC 主网
    console.log("📡 连接到 BSC 主网...");
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org");

    // 创建合约实例
    const aetherReferral = new ethers.Contract(
        AETHER_REFERRAL_ADDRESS,
        AETHER_REFERRAL_ABI,
        provider
    );

    console.log(`✅ 已连接到合约: ${AETHER_REFERRAL_ADDRESS}`);
    console.log();

    // 存储结果
    const referralRelationships = {};
    const statistics = {
        total: ADDRESSES.length,
        withReferrer: 0,
        withoutReferrer: 0
    };

    console.log("🔍 开始查询推荐关系...");
    console.log();

    // 遍历所有地址
    for (let i = 0; i < ADDRESSES.length; i++) {
        const address = ADDRESSES[i];

        try {
            console.log(`[${i + 1}/${ADDRESSES.length}] 查询: ${address}`);

            // 调用 getUserInfo
            const [referrer, friend, hasReferral, hasFriend, childrenCount] =
                await aetherReferral.getUserInfo(address);

            // 存储结果
            const hasValidReferrer = referrer !== ethers.ZeroAddress;
            referralRelationships[address] = {
                referrer: hasValidReferrer ? referrer : null,
                hasReferral: hasReferral,
                childrenCount: Number(childrenCount)
            };

            // 更新统计
            if (hasValidReferrer) {
                statistics.withReferrer++;
                console.log(`   ✓ 推荐人: ${referrer}`);
            } else {
                statistics.withoutReferrer++;
                console.log(`   ✗ 无推荐人`);
            }
            console.log(`   └─ 直接下线数: ${childrenCount}`);
            console.log();

        } catch (error) {
            console.error(`   ❌ 查询失败: ${error.message}`);
            referralRelationships[address] = {
                referrer: null,
                hasReferral: false,
                childrenCount: 0,
                error: error.message
            };
            console.log();
        }
    }

    // 输出统计信息
    console.log("=".repeat(60));
    console.log("📊 统计信息");
    console.log("=".repeat(60));
    console.log(`总地址数: ${statistics.total}`);
    console.log(`已绑定推荐人: ${statistics.withReferrer}`);
    console.log(`未绑定推荐人: ${statistics.withoutReferrer}`);
    console.log();

    // 保存为 JSON 文件
    const outputPath = "referral-relationships.json";
    const output = {
        timestamp: new Date().toISOString(),
        contractAddress: AETHER_REFERRAL_ADDRESS,
        statistics: statistics,
        relationships: referralRelationships
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`✅ 结果已保存到: ${outputPath}`);
    console.log();

    // 输出精简版本 (只包含推荐关系)
    console.log("=".repeat(60));
    console.log("📋 推荐关系摘要 (地址 => 推荐人)");
    console.log("=".repeat(60));
    const simplifiedRelationships = {};
    for (const [address, data] of Object.entries(referralRelationships)) {
        simplifiedRelationships[address] = data.referrer;
    }
    console.log(JSON.stringify(simplifiedRelationships, null, 2));
    console.log();

    // 保存精简版本
    const simplifiedPath = "referral-relationships-simple.json";
    fs.writeFileSync(simplifiedPath, JSON.stringify(simplifiedRelationships, null, 2));
    console.log(`✅ 精简版本已保存到: ${simplifiedPath}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 脚本执行失败:");
        console.error(error);
        process.exit(1);
    });
