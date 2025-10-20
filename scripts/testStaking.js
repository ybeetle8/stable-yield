// scripts/testStaking.js
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// ========================================
// 可配置参数  0xe819cb7246732C9DaC4e742D4751c4003f3D30Aa
// ========================================
const REFERRER_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // root: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // 推荐人地址 填的钱包
const STAKE_USDT_AMOUNT = "200"; // 质押 USDT 数量

async function main() {
  console.log("\n==========================================");
  console.log("SYI 质押测试 - 随机地址");
  console.log("==========================================\n");

  console.log("配置参数:");
  console.log("- 推荐人地址:", REFERRER_ADDRESS);
  console.log("- 质押金额:", STAKE_USDT_AMOUNT, "USDT");

  // 读取部署信息
  const deploymentPath = path.join(__dirname, "..", "syi-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const syiAddress = deployment.contracts.SYI;
  const stakingAddress = deployment.contracts.Staking;
  const usdtAddress = deployment.contracts.USDT;

  console.log("\n合约地址:");
  console.log("- SYI:", syiAddress);
  console.log("- Staking:", stakingAddress);
  console.log("- USDT:", usdtAddress);

  // ========================================
  // 1. 生成随机地址并分配资金
  // ========================================
  console.log("\n[1/5] 生成随机测试地址...");

  // 创建随机钱包
  const randomWallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  console.log("✅ 随机地址已生成:", randomWallet.address);

  // 获取第一个 signer (用于发送 BNB)
  const [deployer] = await hre.ethers.getSigners();

  // 转账 10 ETH (BNB) 作为 gas 费
  console.log("\n发送 10 BNB 作为 gas 费...");
  const bnbAmount = hre.ethers.parseEther("10");
  const bnbTx = await deployer.sendTransaction({
    to: randomWallet.address,
    value: bnbAmount
  });
  await bnbTx.wait();
  console.log("✅ 已转账", hre.ethers.formatEther(bnbAmount), "BNB");

  // 查询 BNB 余额
  const bnbBalance = await hre.ethers.provider.getBalance(randomWallet.address);
  console.log("随机地址 BNB 余额:", hre.ethers.formatEther(bnbBalance), "BNB");

  // ========================================
  // 2. 分配 USDT
  // ========================================
  console.log("\n[2/5] 分配 USDT 给随机地址...");

  const usdt = await hre.ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdtAddress
  );

  const requiredUsdt = hre.ethers.parseEther(STAKE_USDT_AMOUNT);

  // 使用暴力搜索方式查找 USDT balance slot
  console.log("正在设置 USDT 余额...");
  let found = false;
  for (let slot = 0; slot < 10 && !found; slot++) {
    const paddedAddress = hre.ethers.zeroPadValue(randomWallet.address, 32);
    const paddedSlot = hre.ethers.zeroPadValue(hre.ethers.toBeHex(slot), 32);
    const index = hre.ethers.keccak256(hre.ethers.concat([paddedAddress, paddedSlot]));
    const value = hre.ethers.zeroPadValue(hre.ethers.toBeHex(requiredUsdt), 32);

    await hre.network.provider.send("hardhat_setStorageAt", [
      usdtAddress,
      index,
      value
    ]);

    const newBalance = await usdt.balanceOf(randomWallet.address);
    if (newBalance === requiredUsdt) {
      found = true;
      console.log(`✅ 找到 balance slot: ${slot}`);
      break;
    }
  }

  if (!found) {
    throw new Error("无法找到 USDT balance storage slot");
  }

  const usdtBalance = await usdt.balanceOf(randomWallet.address);
  console.log("✅ 随机地址 USDT 余额:", hre.ethers.formatEther(usdtBalance), "USDT");

  // ========================================
  // 3. 获取合约实例并绑定推荐人
  // ========================================
  console.log("\n[3/5] 绑定推荐人和朋友...");

  const staking = await hre.ethers.getContractAt(
    "contracts/SYI-Staking/mainnet/Staking.sol:Staking",
    stakingAddress
  );

  // 检查是否已绑定推荐人
  const isAlreadyBound = await staking.isBindReferral(randomWallet.address);

  if (!isAlreadyBound) {
    // 绑定推荐人
    const lockReferralTx = await staking.connect(randomWallet).lockReferral(REFERRER_ADDRESS);
    await lockReferralTx.wait();
    console.log("✅ 已绑定推荐人:", REFERRER_ADDRESS);

    // 绑定 friend (使用相同地址)
    const lockFriendTx = await staking.connect(randomWallet).lockFriend(REFERRER_ADDRESS);
    await lockFriendTx.wait();
    console.log("✅ 已绑定朋友:", REFERRER_ADDRESS);
  } else {
    console.log("⚠️  该地址已绑定推荐人");
  }

  // ========================================
  // 4. 执行质押
  // ========================================
  console.log("\n[4/5] 执行质押...");

  const stakeAmount = hre.ethers.parseEther(STAKE_USDT_AMOUNT);
  const stakeIndex = 0; // 使用第 0 档位（1天）

  // 授权 USDT
  console.log("授权 USDT 给质押合约...");
  const approveTx = await usdt.connect(randomWallet).approve(stakingAddress, stakeAmount);
  await approveTx.wait();
  console.log("✅ 授权完成");

  // 执行质押
  console.log("执行质押操作...");
  try {
    const stakeTx = await staking.connect(randomWallet).stake(stakeAmount, stakeIndex);
    const receipt = await stakeTx.wait();
    console.log("✅ 质押成功！");
    console.log("交易哈希:", receipt.hash);

    // 查找 Staked 事件
    for (const log of receipt.logs) {
      try {
        const parsed = staking.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        if (parsed && parsed.name === "Staked") {
          console.log("\n质押事件详情:");
          console.log("- 用户:", parsed.args.user);
          console.log("- 质押金额:", hre.ethers.formatEther(parsed.args.amount), "USDT");
          console.log("- 时间戳:", new Date(Number(parsed.args.timestamp) * 1000).toLocaleString());
          console.log("- 记录索引:", parsed.args.index.toString());
          console.log("- 质押周期:", parsed.args.stakeTime.toString(), "秒");
        }
      } catch (e) {
        // 忽略无法解析的日志
      }
    }
  } catch (error) {
    console.error("❌ 质押失败:", error.message);
    throw error;
  }

  // ========================================
  // 5. 查询质押信息和用户信息
  // ========================================
  console.log("\n[5/5] 查询质押记录和用户信息...");

  // 质押记录数
  const stakeCount = await staking.stakeCount(randomWallet.address);
  console.log("\n质押记录数:", stakeCount.toString());

  // sSYI 余额
  const ssyiBalance = await staking.balanceOf(randomWallet.address);
  console.log("sSYI 余额:", hre.ethers.formatEther(ssyiBalance), "sSYI");

  // 查询推荐关系
  const referrer = await staking.getReferral(randomWallet.address);
  const friend = await staking.getFriend(randomWallet.address);
  console.log("\n推荐关系:");
  console.log("- 推荐人 (referrer):", referrer);
  console.log("- 朋友 (friend):", friend);

  // 查询最新的质押记录
  if (stakeCount > 0n) {
    const latestStakeIndex = stakeCount - 1n;
    const stakeDetails = await staking.getUserStakeDetails(randomWallet.address, latestStakeIndex);

    console.log("\n最新质押记录详情:");
    console.log("- 本金:", hre.ethers.formatEther(stakeDetails.principal), "USDT");
    console.log("- 当前价值:", hre.ethers.formatEther(stakeDetails.currentValue), "USDT");
    console.log("- 新增利润:", hre.ethers.formatEther(stakeDetails.newProfit), "USDT");
    console.log("- 累计提取:", hre.ethers.formatEther(stakeDetails.totalWithdrawn), "USDT");
    console.log("- 质押时间:", new Date(Number(stakeDetails.startTime) * 1000).toLocaleString());
    console.log("- 到期时间:", new Date(Number(stakeDetails.originalEndTime) * 1000).toLocaleString());
    console.log("- 是否可以解除质押:", stakeDetails.canWithdraw);

    if (!stakeDetails.canWithdraw && stakeDetails.timeRemaining > 0) {
      const timeRemaining = Number(stakeDetails.timeRemaining);
      console.log("- 距离到期还有:", timeRemaining, "秒 (约", (timeRemaining / 86400).toFixed(2), "天)");
    }
  }

  // 查询团队信息
  const userInfo = await staking.getUserInfo(randomWallet.address);
  const teamKPI = await staking.getTeamKpi(randomWallet.address);

  console.log("\n用户信息:");
  console.log("- 本人总质押:", hre.ethers.formatEther(userInfo.totalStaked), "USDT");
  console.log("- 团队 KPI:", hre.ethers.formatEther(teamKPI), "USDT");
  console.log("- 是否是传教士 (≥200 USDT):", userInfo.isPreacherStatus);
  console.log("- 已绑定推荐人:", userInfo.hasLockedReferral);

  console.log("\n==========================================");
  console.log("测试总结");
  console.log("==========================================");
  console.log("✅ 随机地址:", randomWallet.address);
  console.log("✅ 推荐人:", REFERRER_ADDRESS);
  console.log("✅ 质押金额:", STAKE_USDT_AMOUNT, "USDT");
  console.log("✅ 质押记录数:", stakeCount.toString());
  console.log("✅ sSYI 余额:", hre.ethers.formatEther(ssyiBalance), "sSYI");
  console.log("\n测试完成！");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 测试失败:");
    console.error(error);
    process.exit(1);
  });
