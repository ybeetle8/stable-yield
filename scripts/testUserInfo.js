// =============================================================================
// 用户信息查询测试脚本
// =============================================================================

// 目标用户地址 (可手动修改)
const TARGET_USER_ADDRESS = "0x874CD5eA9B672112973Ab8dF9C53Afbe16F649b8";

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 工具函数：格式化 SYI 代币数量
function formatSYI(amount) {
  return ethers.formatUnits(amount, 18);
}

// 工具函数：格式化 USDT 数量
function formatUSDT(amount) {
  return ethers.formatUnits(amount, 18);
}

// 工具函数：格式化时间戳
function formatTimestamp(timestamp) {
  if (timestamp == 0) return "N/A";
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

// 工具函数：格式化时长
function formatDuration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}天 ${hours}时 ${mins}分`;
}

// 工具函数：获取层级名称
function getTierName(tier) {
  if (tier === 0) return "无层级";
  return `V${tier}`;
}

// 工具函数：打印分隔线
function printSeparator(title = "") {
  if (title) {
    console.log("\n" + "=".repeat(80));
    console.log(`  ${title}`);
    console.log("=".repeat(80));
  } else {
    console.log("-".repeat(80));
  }
}

async function main() {
  console.log("\n开始查询用户信息...");
  console.log(`目标用户地址: ${TARGET_USER_ADDRESS}`);

  // 读取部署配置
  const deploymentPath = path.join(__dirname, "../syi-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  // 获取合约实例
  const Staking = await ethers.getContractAt(
    "Staking",
    deployment.contracts.Staking
  );

  const SYI = await ethers.getContractAt("SYI", deployment.contracts.SYI);

  // ==========================================================================
  // 1. 基本信息
  // ==========================================================================
  printSeparator("1. 基本信息");

  const userInfo = await Staking.getUserInfo(TARGET_USER_ADDRESS);
  const totalStaked = userInfo.totalStaked;
  const teamKPI = userInfo.teamKPI;
  const referrer = userInfo.referrer;
  const hasLockedReferral = userInfo.hasLockedReferral;
  const isPreacherStatus = userInfo.isPreacherStatus;

  console.log(`总质押金额 (currentValue): ${formatSYI(totalStaked)} SYI`);

  const principalBalance = await Staking.principalBalance(TARGET_USER_ADDRESS);
  console.log(`本金余额: ${formatSYI(principalBalance)} SYI`);

  const earnedInterest = await Staking.earnedInterest(TARGET_USER_ADDRESS);
  console.log(`已赚利息: ${formatSYI(earnedInterest)} SYI`);

  const balanceOfUser = await Staking.balanceOf(TARGET_USER_ADDRESS);
  console.log(`sSYI 余额: ${formatSYI(balanceOfUser)} SYI`);

  console.log(`是否为传教士 (≥200 SYI): ${isPreacherStatus ? "是" : "否"}`);

  // ==========================================================================
  // 2. 推荐关系
  // ==========================================================================
  printSeparator("2. 推荐关系");

  console.log(`是否已绑定推荐人: ${hasLockedReferral ? "是" : "否"}`);
  console.log(`推荐人地址: ${referrer === ethers.ZeroAddress ? "无" : referrer}`);

  const friend = await Staking.getFriend(TARGET_USER_ADDRESS);
  console.log(`朋友地址 (5%奖励): ${friend === ethers.ZeroAddress ? "无" : friend}`);

  const referralCount = await Staking.getReferralCount(TARGET_USER_ADDRESS);
  console.log(`直推下线数量: ${referralCount.toString()}`);

  // 获取下线列表（通过事件或遍历）
  if (referralCount > 0) {
    console.log(`\n直推下线列表:`);
    // 注意: _children 是 private，无法直接读取
    // 需要通过事件 BindReferral 来获取，或者合约需要添加 getter
    console.log("  (需要通过事件日志查询，此处省略)");
  }

  // ==========================================================================
  // 3. 团队数据
  // ==========================================================================
  printSeparator("3. 团队数据");

  console.log(`团队总投资 KPI: ${formatSYI(teamKPI)} SYI`);

  const teamPerformance = await Staking.getTeamPerformanceDetails(
    TARGET_USER_ADDRESS
  );
  console.log(`团队成员数量 (直推): ${teamPerformance.teamMemberCount.toString()}`);
  console.log(`当前层级: ${getTierName(teamPerformance.currentTier)}`);

  if (teamPerformance.currentTier < 7) {
    console.log(
      `下一层级门槛: ${formatSYI(teamPerformance.nextTierThreshold)} SYI`
    );
    console.log(`完成进度: ${teamPerformance.progressToNextTier.toString()}%`);
  } else {
    console.log(`已达到最高层级 V7`);
  }

  // ==========================================================================
  // 4. 层级详情
  // ==========================================================================
  printSeparator("4. 层级详情 (自然层级 vs 节点层级)");

  const tierBreakdown = await Staking.getUserTierBreakdown(TARGET_USER_ADDRESS);
  console.log(`是否为传教士: ${tierBreakdown.isPreacherStatus ? "是" : "否"}`);
  console.log(`自然层级 (基于 teamKPI): ${getTierName(tierBreakdown.naturalTier)}`);
  console.log(`节点层级 (管理员设置): ${getTierName(tierBreakdown.nodeTier)}`);
  console.log(`最终生效层级: ${getTierName(tierBreakdown.finalTier)}`);
  console.log(`是否使用节点层级: ${tierBreakdown.usingNodeTier ? "是" : "否"}`);

  const nodeTierDetails = await Staking.getNodeTierDetails(TARGET_USER_ADDRESS);
  if (nodeTierDetails.hasNodeTier) {
    console.log(`\n节点层级详情:`);
    console.log(`  层级: V${nodeTierDetails.tier}`);
    console.log(`  设置时间: ${formatTimestamp(nodeTierDetails.setTime)}`);
    console.log(`  设置者: ${nodeTierDetails.setBy}`);
    console.log(`  是否激活: ${nodeTierDetails.isActive ? "是" : "否"}`);
  }

  // ==========================================================================
  // 5. 质押记录
  // ==========================================================================
  printSeparator("5. 质押记录");

  const stakeCount = await Staking.stakeCount(TARGET_USER_ADDRESS);
  console.log(`总质押笔数: ${stakeCount.toString()}`);

  if (stakeCount > 0) {
    console.log(`\n质押详情:`);
    printSeparator();

    for (let i = 0; i < stakeCount; i++) {
      const stakeDetails = await Staking.getUserStakeDetails(
        TARGET_USER_ADDRESS,
        i
      );

      console.log(`\n  质押 #${i}:`);
      console.log(`    本金: ${formatSYI(stakeDetails.principal)} SYI`);
      console.log(`    当前价值: ${formatSYI(stakeDetails.currentValue)} SYI`);
      console.log(`    新增盈利: ${formatSYI(stakeDetails.newProfit)} SYI`);
      console.log(`    累计已提取: ${formatUSDT(stakeDetails.totalWithdrawn)} USDT`);
      console.log(`    开始时间: ${formatTimestamp(stakeDetails.startTime)}`);
      console.log(`    复利重置时间: ${formatTimestamp(stakeDetails.lastResetTime)}`);
      console.log(`    到期时间: ${formatTimestamp(stakeDetails.originalEndTime)}`);
      console.log(`    是否可解除质押: ${stakeDetails.canWithdraw ? "是" : "否"}`);

      if (stakeDetails.timeRemaining > 0) {
        console.log(`    剩余时间: ${formatDuration(stakeDetails.timeRemaining)}`);
      } else {
        console.log(`    剩余时间: 已到期`);
      }

      // 检查是否可提前提取收益
      const canWithdrawInterest = await Staking.canWithdrawInterest(
        TARGET_USER_ADDRESS,
        i
      );
      if (canWithdrawInterest.canWithdraw) {
        console.log(
          `    可提前提取收益: ${formatSYI(canWithdrawInterest.withdrawableProfit)} SYI`
        );
      } else {
        console.log(`    可提前提取收益: 否 (${canWithdrawInterest.reason})`);
      }
    }
  }

  // ==========================================================================
  // 6. 提现历史
  // ==========================================================================
  printSeparator("6. 提现历史");

  const withdrawalCount = await Staking.getWithdrawalCount(TARGET_USER_ADDRESS);
  console.log(`提现记录数: ${withdrawalCount.toString()}`);

  if (withdrawalCount > 0) {
    const withdrawalHistory = await Staking.getWithdrawalHistory(
      TARGET_USER_ADDRESS
    );

    console.log(`\n提现详情:`);
    printSeparator();

    for (let i = 0; i < withdrawalHistory.length; i++) {
      const record = withdrawalHistory[i];
      console.log(`\n  提现 #${i}:`);
      console.log(`    质押编号: #${record.stakeIndex.toString()}`);
      console.log(`    本金: ${formatUSDT(record.principalAmount)} USDT`);
      console.log(`    计算奖励 (SYI): ${formatSYI(record.calculatedReward)} SYI`);
      console.log(`    兑换得到 USDT: ${formatUSDT(record.usdtReceived)} USDT`);
      console.log(`    使用的 SYI: ${formatSYI(record.syiTokensUsed)} SYI`);
      console.log(`    Friend 奖励: ${formatUSDT(record.referralFee)} USDT`);
      console.log(`    团队奖励: ${formatUSDT(record.teamFee)} USDT`);
      console.log(`    用户实际收到: ${formatUSDT(record.userPayout)} USDT`);
      console.log(`    利息收益: ${formatUSDT(record.interestEarned)} USDT`);
      console.log(`    提现时间: ${formatTimestamp(record.withdrawalTime)}`);
    }
  }

  // ==========================================================================
  // 7. 其他信息
  // ==========================================================================
  printSeparator("7. 其他信息");

  const remainingStakeCapacity = await Staking.getRemainingStakeCapacity(
    TARGET_USER_ADDRESS
  );
  console.log(`剩余可质押额度: ${formatSYI(remainingStakeCapacity)} SYI`);

  const maxUserTotalStake = await Staking.getMaxUserTotalStake();
  console.log(`用户总质押上限: ${formatSYI(maxUserTotalStake)} SYI`);

  const maxStakeAmount = await Staking.getMaxStakeAmount();
  console.log(`单次最大质押: ${formatSYI(maxStakeAmount)} SYI`);

  // SYI 代币余额
  const syiBalance = await SYI.balanceOf(TARGET_USER_ADDRESS);
  console.log(`SYI 代币余额: ${formatSYI(syiBalance)} SYI`);

  printSeparator("查询完成");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("执行出错:", error);
    process.exit(1);
  });
