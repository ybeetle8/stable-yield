const fs = require('fs');
const path = require('path');

// 读取推荐关系数据
const relationshipsPath = path.join(__dirname, '..', 'referral-relationships.json');
const relationshipsData = JSON.parse(fs.readFileSync(relationshipsPath, 'utf8'));
const relationships = relationshipsData.relationships;

// 追溯推荐链
function traceReferralChain(userAddress) {
    const chain = [];
    let current = userAddress.toLowerCase();
    const visited = new Set();

    while (current) {
        if (visited.has(current)) {
            console.log("⚠️ 检测到循环引用！");
            break;
        }
        visited.add(current);

        const userInfo = relationships[current];
        if (!userInfo || !userInfo.referrer) {
            break;
        }

        chain.push({
            user: current,
            referrer: userInfo.referrer.toLowerCase()
        });

        current = userInfo.referrer.toLowerCase();
    }

    return chain;
}

// 分析两个地址
const address1 = "0x3ecfbaa7098fc8aa9ca05fa0b9b22e3fba5cad10";
const address2 = "0x02394393bb4d69c3f69f4904ab6f564c9b228f00";

console.log("========================================");
console.log("分析推荐关系顺序");
console.log("========================================\n");

console.log("地址 1:", address1);
console.log("推荐链路:");
const chain1 = traceReferralChain(address1);
chain1.forEach((link, index) => {
    console.log(`  ${index + 1}. ${link.user} -> ${link.referrer}`);
});
console.log(`  链长: ${chain1.length}\n`);

console.log("地址 2:", address2);
console.log("推荐链路:");
const chain2 = traceReferralChain(address2);
chain2.forEach((link, index) => {
    console.log(`  ${index + 1}. ${link.user} -> ${link.referrer}`);
});
console.log(`  链长: ${chain2.length}\n`);

console.log("========================================");
console.log("结论:");
console.log("========================================");

// 检查是否有依赖关系
const address1Lower = address1.toLowerCase();
const address2Lower = address2.toLowerCase();

const address1InChain2 = chain2.some(link => link.user === address1Lower || link.referrer === address1Lower);
const address2InChain1 = chain1.some(link => link.user === address2Lower || link.referrer === address2Lower);

if (address1InChain2) {
    console.log(`✅ 地址1 (${address1}) 在地址2的推荐链中`);
    console.log(`   应该先绑定地址1，再绑定地址2`);
} else if (address2InChain1) {
    console.log(`✅ 地址2 (${address2}) 在地址1的推荐链中`);
    console.log(`   应该先绑定地址2，再绑定地址1`);
} else {
    console.log(`⚠️ 这两个地址没有直接的推荐依赖关系`);
    console.log(`   可以按任意顺序绑定`);
    console.log(`   但建议按链长从短到长的顺序：`);
    if (chain1.length < chain2.length) {
        console.log(`   1. 先绑定 ${address1} (链长 ${chain1.length})`);
        console.log(`   2. 再绑定 ${address2} (链长 ${chain2.length})`);
    } else {
        console.log(`   1. 先绑定 ${address2} (链长 ${chain2.length})`);
        console.log(`   2. 再绑定 ${address1} (链长 ${chain1.length})`);
    }
}
