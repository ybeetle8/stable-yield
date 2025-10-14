/**
 * 测试脚本：触发质押合约的各种事件
 * 配合 monitorStakingEvents.js 使用，可以看到完整的事件输出
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 等待函数
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("\n" + "★".repeat(80));
  console.log("🧪 SYI-Staking 事件测试脚本");
  console.log("★".repeat(80));

  // 读取合约地址
  const deployedAddressesPath = path.join(__dirname, "../deployed-addresses.json");
  if (!fs.existsSync(deployedAddressesPath)) {
    console.error("\n❌ 错误：未找到 deployed-addresses.json 文件");
    console.log("请先运行部署脚本\n");
    process.exit(1);
  }

  const deployedAddresses = JSON.parse(fs.readFileSync(deployedAddressesPath, "utf8"));
  const stakingAddress = deployedAddresses.Staking;
  const syiAddress = deployedAddresses.SYI;
  const usdtAddress = deployedAddresses.USDT;

  console.log("\n📍 合约地址：");
  console.log(`  Staking: ${stakingAddress}`);
  console.log(`  SYI:     ${syiAddress}`);
  console.log(`  USDT:    ${usdtAddress}`);

  // 获取签名者
  const [owner, user1, user2, user3, user4] = await ethers.getSigners();

  console.log("\n👥 测试账户：");
  console.log(`  Owner:  ${owner.address}`);
  console.log(`  User1:  ${user1.address}`);
  console.log(`  User2:  ${user2.address}`);
  console.log(`  User3:  ${user3.address}`);
  console.log(`  User4:  ${user4.address}`);

  // 连接合约
  const Staking = await ethers.getContractFactory("Staking");
  const staking = Staking.attach(stakingAddress);

  const SYI = await ethers.getContractFactory("SYI");
  const syi = SYI.attach(syiAddress);

  const USDT = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdtAddress
  );

  console.log("\n✅ 已连接到所有合约");

  // =========================================================================
  // 测试 1：绑定推荐关系
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📝 测试 1：绑定推荐关系");
  console.log("=".repeat(80));

  try {
    // User2 绑定 User1 为推荐人
    console.log("\n操作：User2 绑定 User1 为推荐人...");
    let tx = await staking.connect(user2).lockReferral(user1.address);
    await tx.wait();
    console.log("✅ 绑定推荐人成功！应触发 BindReferral 事件");

    await sleep(2000);

    // User3 绑定 User2 为推荐人
    console.log("\n操作：User3 绑定 User2 为推荐人...");
    tx = await staking.connect(user3).lockReferral(user2.address);
    await tx.wait();
    console.log("✅ 绑定推荐人成功！");

    await sleep(2000);

    // User4 绑定 User3 为推荐人
    console.log("\n操作：User4 绑定 User3 为推荐人...");
    tx = await staking.connect(user4).lockReferral(user3.address);
    await tx.wait();
    console.log("✅ 绑定推荐人成功！");

    await sleep(2000);

    // User1 绑定 owner 为推荐人
    console.log("\n操作：User1 绑定 Owner 为推荐人...");
    tx = await staking.connect(user1).lockReferral(owner.address);
    await tx.wait();
    console.log("✅ 绑定推荐人成功！");

  } catch (error) {
    console.error("❌ 绑定推荐人失败：", error.message);
  }

  // =========================================================================
  // 测试 2：绑定好友
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📝 测试 2：绑定好友（直推5%接收方）");
  console.log("=".repeat(80));

  try {
    console.log("\n操作：User4 绑定 User3 为好友...");
    const tx = await staking.connect(user4).lockFriend(user3.address);
    await tx.wait();
    console.log("✅ 绑定好友成功！应触发 BindFriend 事件");
  } catch (error) {
    console.error("❌ 绑定好友失败：", error.message);
  }

  await sleep(2000);

  // =========================================================================
  // 测试 3：准备 USDT 并授权
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📝 测试 3：准备 USDT");
  console.log("=".repeat(80));

  try {
    const stakeAmount = ethers.parseUnits("1000", 18); // 1000 USDT

    // 从 owner 转 USDT 给测试用户
    console.log("\n操作：给测试用户转账 USDT...");
    await USDT.connect(owner).transfer(user1.address, stakeAmount);
    await USDT.connect(owner).transfer(user2.address, stakeAmount);
    await USDT.connect(owner).transfer(user3.address, stakeAmount);
    await USDT.connect(owner).transfer(user4.address, stakeAmount);
    console.log("✅ USDT 转账完成");

    await sleep(1000);

    // 授权
    console.log("\n操作：授权 Staking 合约使用 USDT...");
    await USDT.connect(user1).approve(stakingAddress, ethers.MaxUint256);
    await USDT.connect(user2).approve(stakingAddress, ethers.MaxUint256);
    await USDT.connect(user3).approve(stakingAddress, ethers.MaxUint256);
    await USDT.connect(user4).approve(stakingAddress, ethers.MaxUint256);
    console.log("✅ 授权完成");

  } catch (error) {
    console.error("❌ 准备 USDT 失败：", error.message);
  }

  await sleep(2000);

  // =========================================================================
  // 测试 4：执行质押
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📝 测试 4：执行质押操作");
  console.log("=".repeat(80));

  const stakeAmounts = [
    ethers.parseUnits("300", 18),  // User1: 300 USDT
    ethers.parseUnits("250", 18),  // User2: 250 USDT
    ethers.parseUnits("220", 18),  // User3: 220 USDT
    ethers.parseUnits("500", 18),  // User4: 500 USDT
  ];

  const stakeIndexes = [0, 1, 2, 3]; // 不同档位

  try {
    console.log("\n操作：User1 质押 300 USDT (1天档)...");
    let tx = await staking.connect(user1).stake(stakeAmounts[0], stakeIndexes[0]);
    await tx.wait();
    console.log("✅ 质押成功！应触发 Staked、Transfer 等事件");

    await sleep(3000);

    console.log("\n操作：User2 质押 250 USDT (30天档)...");
    tx = await staking.connect(user2).stake(stakeAmounts[1], stakeIndexes[1]);
    await tx.wait();
    console.log("✅ 质押成功！");

    await sleep(3000);

    console.log("\n操作：User3 质押 220 USDT (90天档)...");
    tx = await staking.connect(user3).stake(stakeAmounts[2], stakeIndexes[2]);
    await tx.wait();
    console.log("✅ 质押成功！");

    await sleep(3000);

    console.log("\n操作：User4 质押 500 USDT (180天档)...");
    tx = await staking.connect(user4).stake(stakeAmounts[3], stakeIndexes[3]);
    await tx.wait();
    console.log("✅ 质押成功！");

  } catch (error) {
    console.error("❌ 质押失败：", error.message);
    console.log("错误详情：", error);
  }

  await sleep(3000);

  // =========================================================================
  // 测试 5：查询质押信息
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📝 测试 5：查询质押信息");
  console.log("=".repeat(80));

  try {
    const user4Balance = await staking.balanceOf(user4.address);
    console.log(`\nUser4 当前质押价值：${ethers.formatUnits(user4Balance, 18)} sSYI`);

    const user4Stakes = await staking.userStakeRecord(user4.address, 0);
    console.log(`\nUser4 第一笔质押记录：`);
    console.log(`  本金：${ethers.formatUnits(user4Stakes.amount, 18)} USDT`);
    console.log(`  开始时间：${new Date(Number(user4Stakes.startTime) * 1000).toLocaleString("zh-CN")}`);
    console.log(`  到期时间：${new Date(Number(user4Stakes.originalEndTime) * 1000).toLocaleString("zh-CN")}`);
    console.log(`  档位：${user4Stakes.stakeIndex}`);
  } catch (error) {
    console.error("❌ 查询失败：", error.message);
  }

  await sleep(2000);

  // =========================================================================
  // 测试 6：等待一段时间后提取利息（仅限测试环境）
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📝 测试 6：中途提取利息");
  console.log("=".repeat(80));

  console.log("\n⏰ 等待 10 秒产生收益...");
  await sleep(10000);

  try {
    console.log("\n操作：User4 提取利息...");
    const tx = await staking.connect(user4).withdrawInterest(0);
    await tx.wait();
    console.log("✅ 提息成功！应触发 InterestWithdrawn、CompoundInterestReset 等事件");
  } catch (error) {
    console.error("❌ 提息失败：", error.message);
    console.log("提示：可能还未产生足够的收益，或未到提取时间");
  }

  await sleep(3000);

  // =========================================================================
  // 测试 7：节点等级管理（Owner 操作）
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📝 测试 7：节点等级管理");
  console.log("=".repeat(80));

  try {
    console.log("\n操作：Owner 为 User1 设置节点等级 V2...");
    let tx = await staking.connect(owner).setNodeTier(user1.address, 2);
    await tx.wait();
    console.log("✅ 设置成功！应触发 NodeTierSet 事件");

    await sleep(2000);

    console.log("\n操作：批量设置节点等级...");
    tx = await staking.connect(owner).batchSetNodeTier(
      [user2.address, user3.address],
      [1, 1]
    );
    await tx.wait();
    console.log("✅ 批量设置成功！应触发 NodeTierBatchSet 事件");

  } catch (error) {
    console.error("❌ 节点等级设置失败：", error.message);
  }

  await sleep(3000);

  // =========================================================================
  // 测试 8：更新费用接收地址
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📝 测试 8：更新费用接收地址");
  console.log("=".repeat(80));

  try {
    console.log("\n操作：Owner 更新费用接收地址...");
    const tx = await staking.connect(owner).setFeeRecipient(user1.address);
    await tx.wait();
    console.log("✅ 更新成功！应触发 FeeRecipientUpdated 事件");
  } catch (error) {
    console.error("❌ 更新失败：", error.message);
  }

  await sleep(3000);

  // =========================================================================
  // 测试完成
  // =========================================================================
  console.log("\n" + "★".repeat(80));
  console.log("✅ 测试完成！");
  console.log("★".repeat(80));
  console.log("\n提示：");
  console.log("1. 查看 monitorStakingEvents.js 的输出，应该能看到所有事件的中文详细信息");
  console.log("2. 如需测试 unstake，请等待质押到期后运行相应脚本");
  console.log("3. 团队奖励事件会在有收益分发时触发\n");

  // =========================================================================
  // 额外信息：显示事件统计
  // =========================================================================
  console.log("\n📊 已触发的事件类型：");
  console.log("  ✓ BindReferral (绑定推荐人)");
  console.log("  ✓ BindFriend (绑定好友)");
  console.log("  ✓ Staked (质押成功)");
  console.log("  ✓ Transfer (sSYI 铸造)");
  console.log("  ✓ StakingRatesUpdated (利率更新)");
  console.log("  ✓ NodeTierSet (设置节点等级)");
  console.log("  ✓ NodeTierBatchSet (批量设置节点等级)");
  console.log("  ✓ FeeRecipientUpdated (费用接收地址更新)");

  if (await staking.userStakeRecord(user4.address, 0).then(r => r.totalWithdrawn > 0)) {
    console.log("  ✓ InterestWithdrawn (中途提取利息)");
    console.log("  ✓ CompoundInterestReset (复利重置)");
    console.log("  ✓ RedemptionFeeCollected (赎回手续费收取)");
  }

  console.log("\n💡 如需触发更多事件，可以：");
  console.log("  - 等待质押到期后执行 unstake 操作");
  console.log("  - 质押更多以触发团队奖励分发");
  console.log("  - 测试节点等级移除功能\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 测试失败：", error);
    process.exit(1);
  });
