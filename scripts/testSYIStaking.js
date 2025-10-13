const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n==========================================");
  console.log("开始测试 SYI 质押功能");
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
  const wallet5 = signers[5]; // 第5号测试钱包
  const rootWallet = signers[2]; // Root钱包 (deployer, feeRecipient, root)

  console.log("\n测试钱包:");
  console.log("- 钱包5:", wallet5.address);
  console.log("- Root 钱包:", rootWallet.address);

  // 获取合约实例
  const syi = await hre.ethers.getContractAt("contracts/SYI/mainnet/SYI.sol:SYI", syiAddress);
  const staking = await hre.ethers.getContractAt("contracts/SYI-Staking/mainnet/Staking.sol:Staking", stakingAddress);
  const usdt = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdtAddress);

  // ========================================
  // 1. 给钱包5获取500 USDT
  // ========================================
  console.log("\n[1/6] 给钱包5获取 500 USDT...");
  const requiredUsdt = hre.ethers.parseEther("500");

  // 使用暴力搜索方式查找 USDT balance slot
  console.log("正在设置 USDT 余额...");
  let found = false;
  for (let slot = 0; slot < 10 && !found; slot++) {
    const paddedAddress = hre.ethers.zeroPadValue(wallet5.address, 32);
    const paddedSlot = hre.ethers.zeroPadValue(hre.ethers.toBeHex(slot), 32);
    const index = hre.ethers.keccak256(hre.ethers.concat([paddedAddress, paddedSlot]));
    const value = hre.ethers.zeroPadValue(hre.ethers.toBeHex(requiredUsdt), 32);

    await hre.network.provider.send("hardhat_setStorageAt", [
      usdtAddress,
      index,
      value
    ]);

    const newBalance = await usdt.balanceOf(wallet5.address);
    if (newBalance === requiredUsdt) {
      found = true;
      console.log(`✅ 找到 balance slot: ${slot}`);
      break;
    }
  }

  if (!found) {
    throw new Error("无法找到 USDT balance storage slot");
  }

  const wallet5UsdtBalance = await usdt.balanceOf(wallet5.address);
  console.log("✅ 钱包5 USDT 余额:", hre.ethers.formatEther(wallet5UsdtBalance), "USDT");

  // ========================================
  // 2. 记录初始余额
  // ========================================
  console.log("\n[2/6] 记录初始余额...");

  const wallet5UsdtBefore = await usdt.balanceOf(wallet5.address);
  const wallet5SyiBefore = await syi.balanceOf(wallet5.address);
  const wallet5SsyiBefore = await staking.balanceOf(wallet5.address);

  const rootUsdtBefore = await usdt.balanceOf(rootWallet.address);
  const rootSyiBefore = await syi.balanceOf(rootWallet.address);

  console.log("\n钱包5 初始余额:");
  console.log("- USDT:", hre.ethers.formatEther(wallet5UsdtBefore));
  console.log("- SYI:", hre.ethers.formatEther(wallet5SyiBefore));
  console.log("- sSYI:", hre.ethers.formatEther(wallet5SsyiBefore));

  console.log("\nRoot钱包 初始余额:");
  console.log("- USDT:", hre.ethers.formatEther(rootUsdtBefore));
  console.log("- SYI:", hre.ethers.formatEther(rootSyiBefore));

  // ========================================
  // 3. 绑定推荐人和friend
  // ========================================
  console.log("\n[3/6] 绑定推荐人...");

  // 检查是否已绑定
  const isAlreadyBound = await staking.isBindReferral(wallet5.address);
  if (!isAlreadyBound) {
    // 绑定推荐人（推荐树）
    const lockReferralTx = await staking.connect(wallet5).lockReferral(rootWallet.address);
    await lockReferralTx.wait();
    console.log("✅ 已绑定推荐人:", rootWallet.address);

    // 绑定friend（直推奖励接收方）
    const lockFriendTx = await staking.connect(wallet5).lockFriend(rootWallet.address);
    await lockFriendTx.wait();
    console.log("✅ 已绑定friend:", rootWallet.address);
  } else {
    console.log("✅ 已存在推荐人绑定");
  }

  // ========================================
  // 4. 检查最大质押额并质押
  // ========================================
  console.log("\n[4/6] 检查最大质押额度...");

  const maxStakeAmount = await staking.getMaxStakeAmount();
  console.log("最大质押额度:", hre.ethers.formatEther(maxStakeAmount), "USDT");

  // 使用 500 USDT 或最大质押额度中较小的值
  const desiredAmount = hre.ethers.parseEther("500");
  const stakeAmount = maxStakeAmount < desiredAmount ? maxStakeAmount : desiredAmount;
  console.log("实际质押金额:", hre.ethers.formatEther(stakeAmount), "USDT");

  const stakeIndex = 0; // 1天档位

  // 授权 USDT
  console.log("授权 USDT...");
  const approveTx = await usdt.connect(wallet5).approve(stakingAddress, stakeAmount);
  await approveTx.wait();
  console.log("✅ 授权完成");

  // 质押
  console.log("执行质押...");
  const stakeTx = await staking.connect(wallet5).stake(stakeAmount, stakeIndex);
  await stakeTx.wait();
  console.log("✅ 质押完成");

  // 查询质押记录
  const stakeCount = await staking.stakeCount(wallet5.address);
  console.log("质押记录数:", stakeCount.toString());

  // 刚刚质押的索引
  const currentStakeIndex = stakeCount - 1n;
  console.log("当前质押索引:", currentStakeIndex.toString());

  const wallet5SsyiAfterStake = await staking.balanceOf(wallet5.address);
  console.log("质押后 sSYI 余额:", hre.ethers.formatEther(wallet5SsyiAfterStake));

  // ========================================
  // 5. 等待并推进时间
  // ========================================
  console.log("\n[5/6] 等待 7 秒...");
  await new Promise(resolve => setTimeout(resolve, 17000));

  // 获取所需质押期以了解需要推进多少时间
  const requiredStakePeriod = await staking.getStakePeriod(stakeIndex);
  console.log("所需质押期:", requiredStakePeriod.toString(), "秒");

  // 手动推进区块时间（确保可以解除质押）
  console.log(`推进区块时间 ${requiredStakePeriod} 秒以满足质押期...`);
  await hre.network.provider.send("evm_increaseTime", [Number(requiredStakePeriod) + 1]);
  await hre.network.provider.send("evm_mine");
  console.log("✅ 时间已推进");

  // 检查是否可以解除质押
  let canWithdraw = await staking.canWithdrawStake(wallet5.address, currentStakeIndex);
  console.log("是否可以解除质押:", canWithdraw);

  // 获取质押记录详情
  const stakeRecord = await staking.userStakeRecord(wallet5.address, currentStakeIndex);
  const stakePeriod = await staking.getStakePeriod(stakeIndex);
  console.log("质押时间:", stakeRecord.stakeTime.toString());
  console.log("所需周期:", stakePeriod.toString(), "秒");

  // 获取当前区块时间戳
  const currentBlock = await hre.ethers.provider.getBlock("latest");
  console.log("当前时间戳:", currentBlock.timestamp);
  console.log("已过时间:", currentBlock.timestamp - Number(stakeRecord.stakeTime), "秒");

  // 如果仍然不能解除质押，继续尝试
  let attempts = 0;
  while (!canWithdraw && attempts < 5) {
    attempts++;
    console.log(`⚠️  还不能解除质押，推进更多时间（尝试 ${attempts}）...`);
    await hre.network.provider.send("evm_increaseTime", [10]);
    await hre.network.provider.send("evm_mine");
    canWithdraw = await staking.canWithdrawStake(wallet5.address, currentStakeIndex);

    const newBlock = await hre.ethers.provider.getBlock("latest");
    console.log("新时间戳:", newBlock.timestamp);
    console.log("现在已过时间:", newBlock.timestamp - Number(stakeRecord.stakeTime), "秒");
    console.log("现在可以解除质押:", canWithdraw);
  }

  if (!canWithdraw) {
    throw new Error("多次尝试后仍无法解除质押");
  }

  // ========================================
  // 6. 解除质押
  // ========================================
  console.log("\n[6/6] 解除质押...");

  const unstakeTx = await staking.connect(wallet5).unstake(currentStakeIndex);
  const receipt = await unstakeTx.wait();
  console.log("✅ 解除质押完成");

  // 查找事件日志
  for (const log of receipt.logs) {
    try {
      const parsed = staking.interface.parseLog({
        topics: log.topics,
        data: log.data
      });
      if (parsed && parsed.name === "RewardPaid") {
        console.log("\n收益事件:");
        console.log("- 用户:", parsed.args.user);
        console.log("- 奖励:", hre.ethers.formatEther(parsed.args.amount));
      }
    } catch (e) {
      // 忽略无法解析的日志
    }
  }

  // ========================================
  // 7. 记录最终余额并对比
  // ========================================
  console.log("\n==========================================");
  console.log("最终余额统计");
  console.log("==========================================\n");

  const wallet5UsdtAfter = await usdt.balanceOf(wallet5.address);
  const wallet5SyiAfter = await syi.balanceOf(wallet5.address);
  const wallet5SsyiAfter = await staking.balanceOf(wallet5.address);

  const rootUsdtAfter = await usdt.balanceOf(rootWallet.address);
  const rootSyiAfter = await syi.balanceOf(rootWallet.address);

  console.log("钱包5 余额变化:");
  console.log("- USDT: 前", hre.ethers.formatEther(wallet5UsdtBefore), "→ 后", hre.ethers.formatEther(wallet5UsdtAfter),
              "| 差额:", hre.ethers.formatEther(wallet5UsdtAfter - wallet5UsdtBefore));
  console.log("- SYI:  前", hre.ethers.formatEther(wallet5SyiBefore), "→ 后", hre.ethers.formatEther(wallet5SyiAfter),
              "| 差额:", hre.ethers.formatEther(wallet5SyiAfter - wallet5SyiBefore));
  console.log("- sSYI: 前", hre.ethers.formatEther(wallet5SsyiBefore), "→ 后", hre.ethers.formatEther(wallet5SsyiAfter),
              "| 差额:", hre.ethers.formatEther(wallet5SsyiAfter - wallet5SsyiBefore));

  console.log("\nRoot钱包 余额变化:");
  console.log("- USDT: 前", hre.ethers.formatEther(rootUsdtBefore), "→ 后", hre.ethers.formatEther(rootUsdtAfter),
              "| 差额:", hre.ethers.formatEther(rootUsdtAfter - rootUsdtBefore));
  console.log("- SYI:  前", hre.ethers.formatEther(rootSyiBefore), "→ 后", hre.ethers.formatEther(rootSyiAfter),
              "| 差额:", hre.ethers.formatEther(rootSyiAfter - rootSyiBefore));

  // 计算收益率
  const usdtDiff = wallet5UsdtAfter - wallet5UsdtBefore;
  const rootReward = rootUsdtAfter - rootUsdtBefore;
  const totalReward = usdtDiff + rootReward;
  const profitRate = Number(usdtDiff) / Number(stakeAmount) * 100;
  const totalProfitRate = Number(totalReward) / Number(stakeAmount) * 100;

  console.log("\n==========================================");
  console.log("测试总结");
  console.log("==========================================");
  console.log("质押金额:", hre.ethers.formatEther(stakeAmount), "USDT");
  console.log("取回金额:", hre.ethers.formatEther(wallet5UsdtAfter), "USDT");
  console.log("净收益:", hre.ethers.formatEther(usdtDiff), "USDT");
  console.log("收益率:", profitRate.toFixed(4), "%");
  console.log("Root获得奖励:", hre.ethers.formatEther(rootReward), "USDT");
  console.log("总收益 (净收益+Root奖励):", hre.ethers.formatEther(totalReward), "USDT");
  console.log("总收益率:", totalProfitRate.toFixed(4), "%");
  console.log("\n✅ 测试完成！");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
