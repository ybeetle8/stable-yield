const fs = require('fs');
const path = require('path');

// 读取数据
const relationshipsPath = path.join(__dirname, '..', 'referral-relationships-simple.json');
const relationships = JSON.parse(fs.readFileSync(relationshipsPath, 'utf8'));
const rootAddress = "0xF4d1cD67cD570aE5e78ae89Bf664A299DeEdEFC7";

// 转换为数组格式
const relationshipsArray = [];
for (const [user, referrer] of Object.entries(relationships)) {
    relationshipsArray.push({ user, referrer });
}

console.log("原始数据数量:", relationshipsArray.length);
console.log("\n前 5 条原始数据:");
relationshipsArray.slice(0, 5).forEach(({ user, referrer }) => {
    console.log(`  ${user} -> ${referrer}`);
});

// 拓扑排序
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

    console.log("\n推荐关系图统计:");
    console.log("  rootAddress 的直接下线数:", (childrenMap.get(rootLower) || []).length);

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

const sorted = topologicalSort(relationshipsArray, rootAddress);

console.log("\n排序后数据数量:", sorted.length);
console.log("\n前 10 条排序后的数据:");
sorted.slice(0, 10).forEach(({ user, referrer }, i) => {
    console.log(`  [${i + 1}] ${user} -> ${referrer}`);
});

console.log("\n验证排序正确性:");
let valid = true;
const bound = new Set([rootAddress.toLowerCase()]);

for (let i = 0; i < sorted.length; i++) {
    const { user, referrer } = sorted[i];
    const userLower = user.toLowerCase();
    const referrerLower = referrer.toLowerCase();

    if (!bound.has(referrerLower)) {
        console.log(`❌ 错误 [${i + 1}]: ${user} 的推荐人 ${referrer} 尚未绑定`);
        valid = false;
        break;
    }

    bound.add(userLower);
}

if (valid) {
    console.log("✅ 所有推荐关系顺序正确！");
}

// 显示推荐链的层级分布
console.log("\n推荐链层级分布:");
const levelMap = new Map();
levelMap.set(rootAddress.toLowerCase(), 0);

for (const { user, referrer } of sorted) {
    const referrerLevel = levelMap.get(referrer.toLowerCase()) || 0;
    const userLevel = referrerLevel + 1;
    levelMap.set(user.toLowerCase(), userLevel);
}

const levelCounts = new Map();
for (const level of levelMap.values()) {
    levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
}

for (const [level, count] of [...levelCounts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Level ${level}: ${count} 个地址`);
}
