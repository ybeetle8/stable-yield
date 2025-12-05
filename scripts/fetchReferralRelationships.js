const { ethers } = require("hardhat");
const fs = require("fs");

// Aether-Referral 合约地址 (BSC 主网)
const AETHER_REFERRAL_ADDRESS = "0xBfF0Ab2a2593DC6dFBB6f745B9dB2063EfD6b64B";

// 要查询的地址列表
const ADDRESSES = [
    "0x8d76F7bE926a50DbA9EFed61d560f2D29C7C5F55",
    "0x84dCF04179aE8f663B62Fec20aC594520fd830b1",
    "0x9f8Fc9D0b420D564Cc92dF762a8Ec7981DF0bF71",
    "0x04Fa3522d47cD7af75a6C277f29aD6A9415Ec74a",
    "0x680B005Cb589C8FaFF378D349147b7864f197930",
    "0xF9690D3a042042A8F6e26AFD0303b1360461b664",
    "0x7fd91dC1AC0d5B5519f50aa0702C0CEC458E77a1",
    "0xFeAB9CbbAD11D583db7968b8bD5E461eF678af08",
    "0x7ed246AA5eC2D248a34a1F5C038B589FB246FF21",
    "0x61Ce05460d3FC6E2CC1D7A4AAB3aFB1d399FB5b8",
    "0x6DF5e1d9cA3c826a7fCD88329DF11365Ccc83eA9",
    "0xAbF430acC4Af2A7a74F2affB5aA04447836B7289",
    "0x25F9256C813755AC26673487CB09D4Ab87D366B6",
    "0xfc07B628De1b1022AB000214B33F49e727d17159",
    "0xAa6cEd5F35E1221C163F279A5Fe36C14CB156937",
    "0x15477aC50E504DC0d2CCCACBe22Fc8C7D2CfAb81",
    "0xB6d86540BEBEd318f7bCf42bcE9BAA19b500BD39",
    "0xDFb60F4260905722b0444298fb612745855658ee",
    "0x9CD75EEe381aE1e1DE50E64EBa3BB734e6CF8261",
    "0x62C041d9Fa400BA7A3717460f9f350bd77f0571D",
    "0xD66ffdf40b7ca68a28C39026726D818cD3daBE32",
    "0xED376FaEC4485f44762608682949aB95f8707E27",
    "0x6F78B5EDfAd4216E7A7824f97f3345824d12Be28",
    "0xB7A176a070D907B276e0F187E8BD6531a2616632",
    "0xA07895f99e9d88e02a81F22a153Fd497c69FE56f"
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
