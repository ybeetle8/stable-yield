/**
 * SYI-Staking 质押合约事件监听器
 * 监听所有事件并以中文输出详细信息
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 工具函数：格式化地址（缩短显示）
function formatAddress(address) {
  if (!address || address === ethers.ZeroAddress) return "零地址";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// 工具函数：格式化金额
function formatAmount(amount, decimals = 18, symbol = "") {
  const formatted = ethers.formatUnits(amount, decimals);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

// 工具函数：格式化时间戳
function formatTimestamp(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

// 工具函数：格式化质押周期
function formatDuration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  if (minutes > 0) return `${minutes}分钟 ${secs}秒`;
  return `${secs}秒`;
}

// 工具函数：格式化等级
function formatTier(tier) {
  const tierNames = ["无", "V1", "V2", "V3", "V4", "V5", "V6", "V7"];
  return tierNames[tier] || `未知等级(${tier})`;
}

// 事件处理器映射
const eventHandlers = {
  // =========================================================================
  // 核心业务事件
  // =========================================================================

  "Staked": (user, amount, timestamp, index, stakeTime, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("📌 事件：质押成功 (Staked)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`质押金额：     ${formatAmount(amount, 18, "USDT")}`);
    console.log(`质押时间：     ${formatTimestamp(timestamp)}`);
    console.log(`记录索引：     #${index}`);
    console.log(`质押周期：     ${formatDuration(Number(stakeTime))}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "WithdrawalCompleted": (user, stakeIndex, principalAmount, calculatedReward, usdtReceived,
                          olaTokensUsed, referralFee, teamFee, userPayout, interestEarned,
                          withdrawalTime, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("💰 事件：完整提取完成 (WithdrawalCompleted)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`质押索引：     #${stakeIndex}`);
    console.log(`本金金额：     ${formatAmount(principalAmount, 18, "USDT")}`);
    console.log(`计算奖励：     ${formatAmount(calculatedReward, 18, "SYI")}`);
    console.log(`收到USDT：     ${formatAmount(usdtReceived, 18, "USDT")}`);
    console.log(`消耗SYI：      ${formatAmount(olaTokensUsed, 18, "SYI")}`);
    console.log(`好友奖励：     ${formatAmount(referralFee, 18, "USDT")} (5%)`);
    console.log(`团队奖励：     ${formatAmount(teamFee, 18, "USDT")} (最高35%)`);
    console.log(`用户到账：     ${formatAmount(userPayout, 18, "USDT")}`);
    console.log(`赚取利息：     ${formatAmount(interestEarned, 18, "USDT")}`);
    console.log(`提取时间：     ${formatTimestamp(withdrawalTime)}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);

    // 计算收益率
    if (principalAmount > 0) {
      const roi = (Number(interestEarned) / Number(principalAmount)) * 100;
      console.log(`收益率：       ${roi.toFixed(2)}%`);
    }
    console.log("=".repeat(80));
  },

  "InterestWithdrawn": (user, stakeIndex, profitAmount, usdtReceived, userPayout,
                        friendReward, teamReward, redemptionFee, resetTime,
                        originalEndTime, timestamp, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("💸 事件：中途提取利息 (InterestWithdrawn)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`质押索引：     #${stakeIndex}`);
    console.log(`利润金额：     ${formatAmount(profitAmount, 18, "SYI")}`);
    console.log(`收到USDT：     ${formatAmount(usdtReceived, 18, "USDT")}`);
    console.log(`用户到账：     ${formatAmount(userPayout, 18, "USDT")}`);
    console.log(`好友奖励：     ${formatAmount(friendReward, 18, "USDT")} (5%)`);
    console.log(`团队奖励：     ${formatAmount(teamReward, 18, "USDT")} (最高35%)`);
    console.log(`赎回手续费：   ${formatAmount(redemptionFee, 18, "USDT")} (1%)`);
    console.log(`重置时间：     ${formatTimestamp(resetTime)}`);
    console.log(`到期时间：     ${formatTimestamp(originalEndTime)} (不变)`);
    console.log(`操作时间：     ${formatTimestamp(timestamp)}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "CompoundInterestReset": (user, stakeIndex, oldValue, newPrincipal, oldStakeTime,
                            newStakeTime, unchangedEndTime, timestamp, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("🔄 事件：复利重置 (CompoundInterestReset)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`质押索引：     #${stakeIndex}`);
    console.log(`重置前价值：   ${formatAmount(oldValue, 18, "SYI")}`);
    console.log(`本金金额：     ${formatAmount(newPrincipal, 18, "SYI")} (保持不变)`);
    console.log(`旧起始时间：   ${formatTimestamp(oldStakeTime)}`);
    console.log(`新起始时间：   ${formatTimestamp(newStakeTime)}`);
    console.log(`到期时间：     ${formatTimestamp(unchangedEndTime)} (不变)`);
    console.log(`重置时间：     ${formatTimestamp(timestamp)}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "RewardPaid": (user, reward, timestamp, index, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("🎁 事件：奖励支付 (RewardPaid) [Legacy]");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`奖励金额：     ${formatAmount(reward, 18, "SYI")}`);
    console.log(`支付时间：     ${formatTimestamp(timestamp)}`);
    console.log(`质押索引：     #${index}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("⚠️  注意：此为兼容事件，请使用 WithdrawalCompleted");
    console.log("=".repeat(80));
  },

  // =========================================================================
  // 推荐与好友系统事件
  // =========================================================================

  "BindReferral": (user, parent, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("🔗 事件：绑定推荐人 (BindReferral)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`推荐人：       ${parent} (${formatAddress(parent)})`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "BindFriend": (user, friend, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("👥 事件：绑定好友 (BindFriend)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`好友地址：     ${friend} (${formatAddress(friend)})`);
    console.log(`说明：         好友将接收用户的直推5%奖励`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "StrictDifferentialRewardPaid": (recipient, tier, actualRewardRate, rewardAmount,
                                   previousCumulativeRate, currentTierRate, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("💎 事件：差额奖励支付 (StrictDifferentialRewardPaid)");
    console.log("=".repeat(80));
    console.log(`接收人：       ${recipient} (${formatAddress(recipient)})`);
    console.log(`等级：         ${formatTier(tier)}`);
    console.log(`实际比例：     ${actualRewardRate}% (差额)`);
    console.log(`奖励金额：     ${formatAmount(rewardAmount, 18, "USDT")}`);
    console.log(`之前累计：     ${previousCumulativeRate}%`);
    console.log(`当前层级：     ${currentTierRate}%`);
    console.log(`计算说明：     ${currentTierRate}% - ${previousCumulativeRate}% = ${actualRewardRate}%`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "TeamRewardDistributionCompleted": (interestAmount, totalTeamRewardPool, totalDistributed,
                                      marketingAmount, tierRecipients, tierAmounts,
                                      activeTiers, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("🏆 事件：团队奖励分发完成 (TeamRewardDistributionCompleted)");
    console.log("=".repeat(80));
    console.log(`原始利息：     ${formatAmount(interestAmount, 18, "USDT")}`);
    console.log(`奖励池总额：   ${formatAmount(totalTeamRewardPool, 18, "USDT")} (35%)`);
    console.log(`实际分发：     ${formatAmount(totalDistributed, 18, "USDT")}`);
    console.log(`营销地址：     ${formatAmount(marketingAmount, 18, "USDT")}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);

    // 解析各层级奖励
    console.log("\n各层级分发详情：");
    for (let i = 0; i < 7; i++) {
      if (tierRecipients[i] && tierRecipients[i] !== ethers.ZeroAddress) {
        console.log(`  ${formatTier(i + 1)}: ${formatAddress(tierRecipients[i])} → ${formatAmount(tierAmounts[i], 18, "USDT")}`);
      }
    }

    // 解析激活位图
    const activeTiersList = [];
    for (let i = 0; i < 7; i++) {
      if ((activeTiers & (1 << i)) !== 0) {
        activeTiersList.push(formatTier(i + 1));
      }
    }
    if (activeTiersList.length > 0) {
      console.log(`\n激活的等级：   ${activeTiersList.join(", ")}`);
    }
    console.log("=".repeat(80));
  },

  "PreacherCheckFailed": (user, tier, reason, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("⚠️  事件：传教者检查失败 (PreacherCheckFailed)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`本应等级：     ${formatTier(tier)}`);
    console.log(`失败原因：     ${reason}`);
    console.log(`说明：         用户未满足 Preacher 条件（需质押 ≥ 200 USDT）`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  // =========================================================================
  // 系统管理事件
  // =========================================================================

  "Transfer": (from, to, amount, event) => {
    let eventType = "转账";
    if (from === ethers.ZeroAddress) eventType = "铸造";
    if (to === ethers.ZeroAddress) eventType = "销毁";

    console.log("\n" + "=".repeat(80));
    console.log(`🔀 事件：sSYI ${eventType} (Transfer)`);
    console.log("=".repeat(80));
    console.log(`发送方：       ${from === ethers.ZeroAddress ? "零地址（铸造）" : formatAddress(from)}`);
    console.log(`接收方：       ${to === ethers.ZeroAddress ? "零地址（销毁）" : formatAddress(to)}`);
    console.log(`金额：         ${formatAmount(amount, 18, "sSYI")}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "SYIContractSet": (syiAddress, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("⚙️  事件：设置 SYI 合约 (SYIContractSet)");
    console.log("=".repeat(80));
    console.log(`SYI地址：      ${syiAddress}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "StakingRatesUpdated": (newRates, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("📊 事件：质押利率更新 (StakingRatesUpdated)");
    console.log("=".repeat(80));
    console.log(`1天档：        ${newRates[0]} (${((Number(newRates[0]) / 1e18 - 1) * 100).toFixed(2)}% 日利率)`);
    console.log(`30天档：       ${newRates[1]} (${((Number(newRates[1]) / 1e18 - 1) * 100).toFixed(2)}% 日利率)`);
    console.log(`90天档：       ${newRates[2]} (${((Number(newRates[2]) / 1e18 - 1) * 100).toFixed(2)}% 日利率)`);
    console.log(`180天档：      ${newRates[3]} (${((Number(newRates[3]) / 1e18 - 1) * 100).toFixed(2)}% 日利率)`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  // =========================================================================
  // 费用相关事件
  // =========================================================================

  "RedemptionFeeCollected": (user, stakeIndex, syiAmount, usdtAmount, feeRecipient, timestamp, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("💳 事件：赎回手续费收取 (RedemptionFeeCollected)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`质押索引：     #${stakeIndex}`);
    console.log(`SYI金额：      ${formatAmount(syiAmount, 18, "SYI")}`);
    console.log(`USDT金额：     ${formatAmount(usdtAmount, 18, "USDT")} (1%)`);
    console.log(`接收地址：     ${feeRecipient} (${formatAddress(feeRecipient)})`);
    console.log(`收取时间：     ${formatTimestamp(timestamp)}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "FeeRecipientUpdated": (oldRecipient, newRecipient, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("🔧 事件：费用接收地址更新 (FeeRecipientUpdated)");
    console.log("=".repeat(80));
    console.log(`旧地址：       ${oldRecipient} (${formatAddress(oldRecipient)})`);
    console.log(`新地址：       ${newRecipient} (${formatAddress(newRecipient)})`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  // =========================================================================
  // 节点等级管理事件
  // =========================================================================

  "TierManagerUpdated": (oldManager, newManager, operator, timestamp, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("👤 事件：等级管理员更新 (TierManagerUpdated)");
    console.log("=".repeat(80));
    console.log(`旧管理员：     ${oldManager} (${formatAddress(oldManager)})`);
    console.log(`新管理员：     ${newManager} (${formatAddress(newManager)})`);
    console.log(`操作者：       ${operator} (${formatAddress(operator)})`);
    console.log(`操作时间：     ${formatTimestamp(timestamp)}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "NodeTierSet": (user, tier, setBy, timestamp, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("⭐ 事件：设置节点等级 (NodeTierSet)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`节点等级：     ${formatTier(tier)}`);
    console.log(`设置者：       ${setBy} (${formatAddress(setBy)})`);
    console.log(`设置时间：     ${formatTimestamp(timestamp)}`);
    console.log(`说明：         节点等级作为最低保障，不限制自然升级`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "NodeTierRemoved": (user, previousTier, removedBy, timestamp, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("❌ 事件：移除节点等级 (NodeTierRemoved)");
    console.log("=".repeat(80));
    console.log(`用户地址：     ${user} (${formatAddress(user)})`);
    console.log(`之前等级：     ${formatTier(previousTier)}`);
    console.log(`移除者：       ${removedBy} (${formatAddress(removedBy)})`);
    console.log(`移除时间：     ${formatTimestamp(timestamp)}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);
    console.log("=".repeat(80));
  },

  "NodeTierBatchSet": (users, tiers, setBy, count, timestamp, event) => {
    console.log("\n" + "=".repeat(80));
    console.log("📦 事件：批量设置节点等级 (NodeTierBatchSet)");
    console.log("=".repeat(80));
    console.log(`设置者：       ${setBy} (${formatAddress(setBy)})`);
    console.log(`用户数量：     ${count}`);
    console.log(`设置时间：     ${formatTimestamp(timestamp)}`);
    console.log(`区块高度：     ${event.blockNumber}`);
    console.log(`交易哈希：     ${event.transactionHash}`);

    console.log("\n批量设置详情：");
    const displayCount = Math.min(10, users.length); // 最多显示前10个
    for (let i = 0; i < displayCount; i++) {
      console.log(`  ${i + 1}. ${formatAddress(users[i])} → ${formatTier(tiers[i])}`);
    }
    if (users.length > 10) {
      console.log(`  ... 还有 ${users.length - 10} 个用户`);
    }
    console.log("=".repeat(80));
  }
};

// 主函数
async function main() {
  console.log("\n" + "★".repeat(80));
  console.log("🎯 SYI-Staking 质押合约事件监听器");
  console.log("★".repeat(80));

  try {
    // 读取部署的合约地址
    const deployedAddressesPath = path.join(__dirname, "../syi-deployment.json");

    if (!fs.existsSync(deployedAddressesPath)) {
      console.error("\n❌ 错误：未找到 syi-deployment.json 文件");
      console.log("请先运行部署脚本：npm run deploy-syi\n");
      process.exit(1);
    }

    const deployedAddresses = JSON.parse(fs.readFileSync(deployedAddressesPath, "utf8"));
    const stakingAddress = deployedAddresses.contracts?.Staking;

    if (!stakingAddress) {
      console.error("\n❌ 错误：syi-deployment.json 中未找到 Staking 地址\n");
      process.exit(1);
    }

    console.log(`\n📍 质押合约地址：${stakingAddress}`);

    // 连接到合约
    const Staking = await ethers.getContractFactory("Staking");
    const staking = Staking.attach(stakingAddress);

    console.log("\n✅ 已连接到质押合约");
    console.log(`📡 网络：${(await ethers.provider.getNetwork()).name}`);
    console.log(`📊 当前区块：${await ethers.provider.getBlockNumber()}`);

    // 注册所有事件监听器
    console.log("\n🎧 开始监听所有事件...\n");
    console.log("提示：执行质押操作以触发事件");
    console.log("按 Ctrl+C 停止监听\n");

    // 为每个事件注册监听器
    for (const [eventName, handler] of Object.entries(eventHandlers)) {
      try {
        staking.on(eventName, (...args) => {
          const event = args[args.length - 1]; // 最后一个参数是事件对象
          const eventArgs = args.slice(0, -1); // 前面的是事件参数

          try {
            handler(...eventArgs, event);
          } catch (error) {
            console.error(`\n❌ 处理事件 ${eventName} 时出错：`, error.message);
          }
        });
      } catch (error) {
        console.warn(`⚠️  警告：无法监听事件 ${eventName}：`, error.message);
      }
    }

    console.log(`✅ 已注册 ${Object.keys(eventHandlers).length} 个事件监听器\n`);

    // 查询最近的历史事件（可选）
    const currentBlock = await ethers.provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 100); // 查询最近100个区块

    console.log(`\n🔍 查询历史事件（区块 ${fromBlock} - ${currentBlock}）...\n`);

    for (const eventName of Object.keys(eventHandlers)) {
      try {
        const filter = staking.filters[eventName]();
        const events = await staking.queryFilter(filter, fromBlock, currentBlock);

        if (events.length > 0) {
          console.log(`\n找到 ${events.length} 个 ${eventName} 事件：`);
          for (const event of events) {
            const handler = eventHandlers[eventName];
            handler(...event.args, event);
          }
        }
      } catch (error) {
        // 忽略不存在的事件
      }
    }

    console.log("\n" + "─".repeat(80));
    console.log("✅ 历史事件查询完成，继续监听新事件...");
    console.log("─".repeat(80) + "\n");

    // 保持进程运行
    await new Promise(() => {});

  } catch (error) {
    console.error("\n❌ 错误：", error.message);
    if (error.code === "NETWORK_ERROR") {
      console.log("\n提示：请确保 Hardhat 节点正在运行");
      console.log("运行命令：npx hardhat node --fork https://binance.llamarpc.com --fork-block-number 63482920\n");
    }
    process.exit(1);
  }
}

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n\n👋 停止监听事件...");
  process.exit(0);
});

// 运行主函数
main().catch((error) => {
  console.error("\n❌ 致命错误：", error);
  process.exit(1);
});
