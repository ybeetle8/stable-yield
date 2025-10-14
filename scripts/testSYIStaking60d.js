const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n==========================================");
  console.log("开始测试 SYI 质押功能 - 提前支取盈利对比测试");
  console.log("==========================================\n");

  // 读取部署信息
  const deploymentPath = path.join(__dirname, "..", "syi-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const syiAddress = deployment.contracts.SYI;
  const stakingAddress = deployment.contracts.Staking;
  const usdtAddress = deployment.contracts.USDT;
  const rootWalletAddress = deployment.rootWallet;

  console.log("合约地址:");
  console.log("- SYI:", syiAddress);
  console.log("- Staking:", stakingAddress);
  console.log("- USDT:", usdtAddress);
  console.log("- Root 钱包:", rootWalletAddress);

  // 获取钱包
  const signers = await hre.ethers.getSigners();
  const wallet5 = signers[5]; // 场景1 测试钱包
  const wallet6 = signers[6]; // 场景2 测试钱包
  const rootWallet = signers[2]; // Root钱包

  console.log("\n测试钱包:");
  console.log("- 钱包5 (场景1):", wallet5.address);
  console.log("- 钱包6 (场景2):", wallet6.address);
  console.log("- Root 钱包:", rootWallet.address);

  // 获取合约实例
  const syi = await hre.ethers.getContractAt("contracts/SYI/mainnet/SYI.sol:SYI", syiAddress);
  const staking = await hre.ethers.getContractAt("contracts/SYI-Staking/mainnet/Staking.sol:Staking", stakingAddress);
  const usdt = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdtAddress);

  // ========================================
  // 准备阶段：给两个钱包各获取 500 USDT
  // ========================================
  console.log("\n[准备] 给测试钱包获取 USDT...");
  const requiredUsdt = hre.ethers.parseEther("500");

  for (const wallet of [wallet5, wallet6]) {
    console.log(`\n为 ${wallet.address} 设置 USDT 余额...`);
    let found = false;
    for (let slot = 0; slot < 10 && !found; slot++) {
      const paddedAddress = hre.ethers.zeroPadValue(wallet.address, 32);
      const paddedSlot = hre.ethers.zeroPadValue(hre.ethers.toBeHex(slot), 32);
      const index = hre.ethers.keccak256(hre.ethers.concat([paddedAddress, paddedSlot]));
      const value = hre.ethers.zeroPadValue(hre.ethers.toBeHex(requiredUsdt), 32);

      await hre.network.provider.send("hardhat_setStorageAt", [
        usdtAddress,
        index,
        value
      ]);

      const newBalance = await usdt.balanceOf(wallet.address);
      if (newBalance === requiredUsdt) {
        found = true;
        console.log(`✅ 找到 balance slot: ${slot}`);
        break;
      }
    }

    if (!found) {
      throw new Error(`无法为 ${wallet.address} 设置 USDT 余额`);
    }

    const balance = await usdt.balanceOf(wallet.address);
    console.log(`✅ ${wallet.address} USDT 余额:`, hre.ethers.formatEther(balance), "USDT");
  }

  // ========================================
  // 准备阶段：绑定推荐人和 friend
  // ========================================
  console.log("\n[准备] 绑定推荐人...");

  for (const wallet of [wallet5, wallet6]) {
    const isAlreadyBound = await staking.isBindReferral(wallet.address);
    if (!isAlreadyBound) {
      const lockReferralTx = await staking.connect(wallet).lockReferral(rootWallet.address);
      await lockReferralTx.wait();
      console.log(`✅ ${wallet.address} 已绑定推荐人`);

      const lockFriendTx = await staking.connect(wallet).lockFriend(rootWallet.address);
      await lockFriendTx.wait();
      console.log(`✅ ${wallet.address} 已绑定 friend`);
    } else {
      console.log(`✅ ${wallet.address} 已存在推荐人绑定`);
    }
  }

  // ========================================
  // 场景1: 直接在 80 秒后解质押
  // ========================================
  console.log("\n");
  console.log("========================================");
  console.log("场景1: 质押 (180秒档)，190秒后直接解质押");
  console.log("========================================");

  // 记录初始余额
  const wallet5UsdtBefore = await usdt.balanceOf(wallet5.address);
  const rootUsdtBefore1 = await usdt.balanceOf(rootWallet.address);

  console.log("\n[1/4] 钱包5 准备质押...");

  // 查询最大质押额度
  const maxStakeAmount = await staking.getMaxStakeAmount();
  console.log("当前最大质押额度:", hre.ethers.formatEther(maxStakeAmount), "USDT");

  const desiredAmount = hre.ethers.parseEther("500");
  const stakeAmount = maxStakeAmount < desiredAmount ? maxStakeAmount : desiredAmount;
  console.log("实际质押金额:", hre.ethers.formatEther(stakeAmount), "USDT");

  const stakeIndex = 3; // 180秒档位 (testnet 测试用，1.5%日复利)

  const approveTx1 = await usdt.connect(wallet5).approve(stakingAddress, stakeAmount);
  await approveTx1.wait();

  const stakeTx1 = await staking.connect(wallet5).stake(stakeAmount, stakeIndex);
  await stakeTx1.wait();
  console.log("✅ 质押完成");

  const stakeCount1 = await staking.stakeCount(wallet5.address);
  const currentStakeIndex1 = stakeCount1 - 1n;
  console.log("当前质押索引:", currentStakeIndex1.toString());

  // ⭐ 调试信息：检查质押记录
  console.log("\n🔍 调试信息 - 质押记录详情:");
  const stakeRecord1 = await staking.userStakeRecord(wallet5.address, currentStakeIndex1);
  const currentBlock1 = await hre.ethers.provider.getBlock('latest');
  const stakePeriodConfig = await staking.getStakePeriod(stakeIndex);
  const compoundTimeUnit = 1; // 测试网配置：每秒复利 (生产环境为 1 day)

  console.log("- startTime:", stakeRecord1.startTime.toString(), `(${new Date(Number(stakeRecord1.startTime) * 1000).toISOString()})`);
  console.log("- stakeTime:", stakeRecord1.stakeTime.toString(), `(${new Date(Number(stakeRecord1.stakeTime) * 1000).toISOString()})`);
  console.log("- originalEndTime:", stakeRecord1.originalEndTime.toString(), `(${new Date(Number(stakeRecord1.originalEndTime) * 1000).toISOString()})`);
  console.log("- 当前区块时间:", currentBlock1.timestamp.toString(), `(${new Date(currentBlock1.timestamp * 1000).toISOString()})`);
  console.log("- 配置的质押周期 (getStakePeriod(3)):", stakePeriodConfig.toString(), "秒");
  console.log("- 复利时间单位 (testnet):", compoundTimeUnit, "秒");
  console.log("- 实际记录的周期 (originalEndTime - stakeTime):", (stakeRecord1.originalEndTime - stakeRecord1.stakeTime).toString(), "秒");
  console.log("- 预期周期 vs 实际周期:", stakePeriodConfig.toString() === (stakeRecord1.originalEndTime - stakeRecord1.stakeTime).toString() ? "✅ 匹配" : "❌ 不匹配");

  // 读取配置的 APY 率
  const apyRate = await staking.rates(stakeIndex);
  console.log("- 配置的 APY 率:", hre.ethers.formatEther(apyRate), `(预期 1.015)`);
  console.log("");

  console.log("\n[2/4] 等待 190 秒（超过180秒质押期）...");
  await hre.network.provider.send("evm_increaseTime", [190]);
  await hre.network.provider.send("evm_mine");
  console.log("✅ 时间已推进 190 秒");

  // ⭐ 调试信息：检查时间推进后的状态
  console.log("\n🔍 调试信息 - 时间推进后:");
  const currentBlock2 = await hre.ethers.provider.getBlock('latest');
  const stakeRecord1b = await staking.userStakeRecord(wallet5.address, currentStakeIndex1);
  const actualDuration = currentBlock2.timestamp - Number(stakeRecord1b.stakeTime);
  const expectedDuration = Number(stakePeriodConfig);
  const effectiveEndTime = Math.min(currentBlock2.timestamp, Number(stakeRecord1b.originalEndTime));
  const effectiveDuration = effectiveEndTime - Number(stakeRecord1b.stakeTime);
  const compoundPeriodsCalculated = Math.floor(effectiveDuration / compoundTimeUnit);

  console.log("- 当前区块时间:", currentBlock2.timestamp.toString());
  console.log("- 质押开始时间:", stakeRecord1b.stakeTime.toString());
  console.log("- 原定结束时间:", stakeRecord1b.originalEndTime.toString());
  console.log("- 实际经过时间:", actualDuration, "秒");
  console.log("- 预期质押时间:", expectedDuration, "秒");
  console.log("- 生效结束时间 (取 min):", effectiveEndTime);
  console.log("- 生效时长:", effectiveDuration, "秒");
  console.log("- 计算的复利周期数:", compoundPeriodsCalculated);
  console.log("- 预期复利周期数:", expectedDuration / compoundTimeUnit);
  console.log("");

  // 检查质押详情 (使用现有函数)
  const principalBalance1 = await staking.principalBalance(wallet5.address);
  const currentValue1 = await staking.balanceOf(wallet5.address);
  const earnedInterest1 = await staking.earnedInterest(wallet5.address);
  const canWithdraw1 = await staking.canWithdrawStake(wallet5.address, currentStakeIndex1);

  console.log("质押详情 (190秒后):");
  console.log("- 本金余额:", hre.ethers.formatEther(principalBalance1), "USDT");
  console.log("- 当前价值:", hre.ethers.formatEther(currentValue1), "USDT");
  console.log("- 已赚利息:", hre.ethers.formatEther(earnedInterest1), "USDT");
  console.log("- 是否可解除质押:", canWithdraw1);

  // 手工计算预期值
  const principal = Number(hre.ethers.formatEther(principalBalance1));
  const rate = 1.015;
  const expectedValue = principal * Math.pow(rate, compoundPeriodsCalculated);
  const expectedInterest = expectedValue - principal;
  console.log("\n📊 手工计算对比:");
  console.log("- 本金:", principal.toFixed(2), "USDT");
  console.log("- 复利周期:", compoundPeriodsCalculated);
  console.log("- 预期价值:", expectedValue.toFixed(2), "USDT", `(${principal} × 1.015^${compoundPeriodsCalculated})`);
  console.log("- 预期利息:", expectedInterest.toFixed(2), "USDT");
  console.log("- 合约当前价值:", hre.ethers.formatEther(currentValue1), "USDT");
  console.log("- 合约已赚利息:", hre.ethers.formatEther(earnedInterest1), "USDT");
  console.log("- 差异:", (Number(hre.ethers.formatEther(currentValue1)) - expectedValue).toFixed(2), "USDT");

  console.log("\n[3/4] 解除质押...");
  const unstakeTx1 = await staking.connect(wallet5).unstake(currentStakeIndex1);
  await unstakeTx1.wait();
  console.log("✅ 解除质押完成");

  // 记录最终余额
  const wallet5UsdtAfter = await usdt.balanceOf(wallet5.address);
  const rootUsdtAfter1 = await usdt.balanceOf(rootWallet.address);

  const wallet5Profit1 = wallet5UsdtAfter - wallet5UsdtBefore;
  const rootReward1 = rootUsdtAfter1 - rootUsdtBefore1;
  const totalReward1 = wallet5Profit1 + rootReward1;

  console.log("\n[4/4] 场景1 结果:");
  console.log("- 钱包5 净收益:", hre.ethers.formatEther(wallet5Profit1), "USDT");
  console.log("- Root 获得奖励:", hre.ethers.formatEther(rootReward1), "USDT");
  console.log("- 总收益:", hre.ethers.formatEther(totalReward1), "USDT");

  // 计算实际收益率（扣除费用后）
  const actualReturnRate = (Number(wallet5Profit1) / Number(stakeAmount) * 100);
  console.log("- 实际收益率 (扣费后):", actualReturnRate.toFixed(4), "%");

  // 计算理论收益率（无费用）
  const theoreticalMultiplier = Math.pow(1.015, compoundPeriodsCalculated);
  const theoreticalReturnRate = (theoreticalMultiplier - 1) * 100;
  console.log("- 理论收益率 (无费用):", theoreticalReturnRate.toFixed(4), "%", `(1.015^${compoundPeriodsCalculated})`);

  // 计算费用扣除比例
  const feePercentage = ((theoreticalReturnRate - actualReturnRate) / theoreticalReturnRate * 100);
  console.log("- 综合费用率:", feePercentage.toFixed(2), "%");
  console.log("- 费用明细: SYI兑换滑点(~5%) + Friend奖励(5%) + Team奖励(0-35%) + Redemption Fee(1%)");

  // ========================================
  // 场景间隔：推进时间以重置网络流入检查
  // ========================================
  console.log("\n推进时间 60 秒以重置网络流入检查...");
  await hre.network.provider.send("evm_increaseTime", [60]);
  await hre.network.provider.send("evm_mine");
  console.log("✅ 时间已推进");

  // ========================================
  // 场景2: 30秒提前支取，80秒解质押
  // ========================================
  console.log("\n");
  console.log("========================================");
  console.log("场景2: 质押 (180秒档)，30秒提前支取盈利，190秒解质押");
  console.log("========================================");

  // 记录初始余额
  const wallet6UsdtBefore = await usdt.balanceOf(wallet6.address);
  const rootUsdtBefore2 = await usdt.balanceOf(rootWallet.address);

  console.log("\n[1/6] 钱包6 准备质押...");

  // 重新查询最大质押额度
  const maxStakeAmount2 = await staking.getMaxStakeAmount();
  console.log("当前最大质押额度:", hre.ethers.formatEther(maxStakeAmount2), "USDT");

  const stakeAmount2 = maxStakeAmount2 < stakeAmount ? maxStakeAmount2 : stakeAmount;
  console.log("实际质押金额:", hre.ethers.formatEther(stakeAmount2), "USDT");
  const approveTx2 = await usdt.connect(wallet6).approve(stakingAddress, stakeAmount2);
  await approveTx2.wait();

  const stakeTx2 = await staking.connect(wallet6).stake(stakeAmount2, stakeIndex);
  await stakeTx2.wait();
  console.log("✅ 质押完成");

  const stakeCount2 = await staking.stakeCount(wallet6.address);
  const currentStakeIndex2 = stakeCount2 - 1n;
  console.log("当前质押索引:", currentStakeIndex2.toString());

  console.log("\n[2/6] 等待 30 秒...");
  await hre.network.provider.send("evm_increaseTime", [30]);
  await hre.network.provider.send("evm_mine");
  console.log("✅ 时间已推进 30 秒");

  // 检查质押详情 (使用现有函数)
  const principalBalance2a = await staking.principalBalance(wallet6.address);
  const currentValue2a = await staking.balanceOf(wallet6.address);
  const earnedInterest2a = await staking.earnedInterest(wallet6.address);

  console.log("\n质押详情 (30秒后，提前支取前):");
  console.log("- 本金余额:", hre.ethers.formatEther(principalBalance2a), "USDT");
  console.log("- 当前价值:", hre.ethers.formatEther(currentValue2a), "USDT");
  console.log("- 已赚利息:", hre.ethers.formatEther(earnedInterest2a), "USDT");

  console.log("\n[3/6] 提前支取盈利...");
  const wallet6UsdtMid = await usdt.balanceOf(wallet6.address);

  const withdrawInterestTx = await staking.connect(wallet6).withdrawInterest(currentStakeIndex2);
  const receipt = await withdrawInterestTx.wait();
  console.log("✅ 提前支取完成");

  // 查找 InterestWithdrawn 事件
  for (const log of receipt.logs) {
    try {
      const parsed = staking.interface.parseLog({
        topics: log.topics,
        data: log.data
      });
      if (parsed && parsed.name === "InterestWithdrawn") {
        console.log("\n提前支取事件:");
        console.log("- 盈利金额 (SYI):", hre.ethers.formatEther(parsed.args.profitAmount));
        console.log("- USDT 收到:", hre.ethers.formatEther(parsed.args.usdtReceived));
        console.log("- 用户实得:", hre.ethers.formatEther(parsed.args.userPayout));
        console.log("- Friend 奖励:", hre.ethers.formatEther(parsed.args.friendReward));
        console.log("- Team 奖励:", hre.ethers.formatEther(parsed.args.teamReward));
        console.log("- 赎回费:", hre.ethers.formatEther(parsed.args.redemptionFee));
      }
    } catch (e) {
      // 忽略无法解析的日志
    }
  }

  const wallet6UsdtAfterWithdraw = await usdt.balanceOf(wallet6.address);
  const earlyWithdrawProfit = wallet6UsdtAfterWithdraw - wallet6UsdtMid;
  console.log("\n钱包6 提前支取获得:", hre.ethers.formatEther(earlyWithdrawProfit), "USDT");

  // 检查重置后的质押详情
  const principalBalance2b = await staking.principalBalance(wallet6.address);
  const currentValue2b = await staking.balanceOf(wallet6.address);
  const earnedInterest2b = await staking.earnedInterest(wallet6.address);

  console.log("\n质押详情 (提前支取后，复利已重置):");
  console.log("- 本金余额:", hre.ethers.formatEther(principalBalance2b), "USDT (应保持不变)");
  console.log("- 当前价值:", hre.ethers.formatEther(currentValue2b), "USDT (应等于本金)");
  console.log("- 已赚利息:", hre.ethers.formatEther(earnedInterest2b), "USDT (应为0)");

  console.log("\n[4/6] 继续等待 160 秒 (总共 190 秒)...");
  await hre.network.provider.send("evm_increaseTime", [160]);
  await hre.network.provider.send("evm_mine");
  console.log("✅ 时间已推进 160 秒 (总计 190 秒)");

  // 检查最终质押详情
  const principalBalance2c = await staking.principalBalance(wallet6.address);
  const currentValue2c = await staking.balanceOf(wallet6.address);
  const earnedInterest2c = await staking.earnedInterest(wallet6.address);
  const canWithdraw2c = await staking.canWithdrawStake(wallet6.address, currentStakeIndex2);

  console.log("\n质押详情 (190秒后，解质押前):");
  console.log("- 本金余额:", hre.ethers.formatEther(principalBalance2c), "USDT");
  console.log("- 当前价值:", hre.ethers.formatEther(currentValue2c), "USDT");
  console.log("- 已赚利息:", hre.ethers.formatEther(earnedInterest2c), "USDT");
  console.log("- 是否可解除质押:", canWithdraw2c);

  console.log("\n[5/6] 解除质押...");
  const unstakeTx2 = await staking.connect(wallet6).unstake(currentStakeIndex2);
  await unstakeTx2.wait();
  console.log("✅ 解除质押完成");

  // 记录最终余额
  const wallet6UsdtAfter = await usdt.balanceOf(wallet6.address);
  const rootUsdtAfter2 = await usdt.balanceOf(rootWallet.address);

  const wallet6Profit2 = wallet6UsdtAfter - wallet6UsdtBefore;
  const rootReward2 = rootUsdtAfter2 - rootUsdtBefore2;
  const totalReward2 = wallet6Profit2 + rootReward2;

  console.log("\n[6/6] 场景2 结果:");
  console.log("- 钱包6 提前支取:", hre.ethers.formatEther(earlyWithdrawProfit), "USDT");
  console.log("- 钱包6 最终解质押:", hre.ethers.formatEther(wallet6UsdtAfter - wallet6UsdtAfterWithdraw), "USDT");
  console.log("- 钱包6 净收益 (总计):", hre.ethers.formatEther(wallet6Profit2), "USDT");
  console.log("- Root 获得奖励:", hre.ethers.formatEther(rootReward2), "USDT");
  console.log("- 总收益:", hre.ethers.formatEther(totalReward2), "USDT");

  // 计算实际收益率（扣除费用后）
  const actualReturnRate2 = (Number(wallet6Profit2) / Number(stakeAmount2) * 100);
  console.log("- 实际收益率 (扣费后):", actualReturnRate2.toFixed(4), "%");
  console.log("- 说明: 提前支取会重置复利，导致收益比场景1少");

  // ========================================
  // 对比总结
  // ========================================
  console.log("\n");
  console.log("==========================================");
  console.log("对比总结");
  console.log("==========================================");
  console.log("\n场景1 (直接解质押):");
  console.log("- 用户收益:", hre.ethers.formatEther(wallet5Profit1), "USDT");
  console.log("- 实际收益率 (扣费后):", actualReturnRate.toFixed(4), "%");
  console.log("- 理论收益率 (无费用):", theoreticalReturnRate.toFixed(4), "%");
  console.log("- 综合费用率:", feePercentage.toFixed(2), "%");

  console.log("\n场景2 (提前支取+解质押):");
  console.log("- 用户收益:", hre.ethers.formatEther(wallet6Profit2), "USDT");
  console.log("- 实际收益率 (扣费后):", actualReturnRate2.toFixed(4), "%");

  const profitDiff = wallet5Profit1 - wallet6Profit2;
  const profitDiffPercent = (Number(profitDiff) / Number(wallet5Profit1) * 100);

  console.log("\n差异分析:");
  console.log("- 收益差额:", hre.ethers.formatEther(profitDiff), "USDT");
  console.log("- 损失比例:", profitDiffPercent.toFixed(4), "% (场景2相对场景1)");

  console.log("\n📌 关键说明:");
  console.log("1. 理论收益率 1358.6% = (1.015)^180 - 1 (无任何费用)");
  console.log("2. 实际收益率 ~815% = 理论收益率 × (1 - 40%综合费率)");
  console.log("3. 综合费用包括: SYI兑换滑点、Friend奖励、Team奖励、Redemption Fee");
  console.log("4. 提前支取会重置复利，导致收益进一步减少");

  console.log("\n✅ 测试完成！");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
