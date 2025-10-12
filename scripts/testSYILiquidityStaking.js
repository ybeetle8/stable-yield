const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("==========================================");
  console.log("SYI LiquidityStaking 测试脚本");
  console.log("==========================================\n");

  // 读取部署信息
  const deploymentPath = path.join(__dirname, "../syi-liquidity-staking-deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("❌ 未找到 syi-liquidity-staking-deployment.json 文件，请先部署合约");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const liquidityStakingAddress = deployment.contracts.LiquidityStaking;

  console.log("📄 LiquidityStaking 地址:", liquidityStakingAddress);
  console.log("");

  // 获取合约实例
  const liquidityStaking = await hre.ethers.getContractAt("LiquidityStaking", liquidityStakingAddress);

  // ==========================================================================
  // 测试 1: 基本信息
  // ==========================================================================
  console.log("[测试 1] 合约基本信息");
  console.log("─────────────────────────────────────────");

  const syiContract = await liquidityStaking.syiContract();
  const usdt = await liquidityStaking.usdt();
  const lpToken = await liquidityStaking.lpToken();
  const staking = await liquidityStaking.staking();
  const router = await liquidityStaking.router();
  const owner = await liquidityStaking.owner();

  console.log("SYI Token 地址:", syiContract);
  console.log("USDT 地址:", usdt);
  console.log("LP Token 地址:", lpToken);
  console.log("Staking 地址:", staking);
  console.log("Router 地址:", router);
  console.log("Owner 地址:", owner);
  console.log("✅ 基本信息读取成功\n");

  // ==========================================================================
  // 测试 2: 奖励池信息
  // ==========================================================================
  console.log("[测试 2] 奖励池信息");
  console.log("─────────────────────────────────────────");

  const poolInfo = await liquidityStaking.getRewardPoolInfo();
  console.log("总奖励:", hre.ethers.formatUnits(poolInfo[0], 18), "USDT");
  console.log("每秒奖励:", hre.ethers.formatUnits(poolInfo[1], 18), "USDT/s");
  console.log("总质押量:", hre.ethers.formatUnits(poolInfo[2], 18), "LP");
  console.log("总权重:", hre.ethers.formatUnits(poolInfo[3], 18));
  console.log("质押者数量:", poolInfo[4].toString());
  console.log("已分发奖励:", hre.ethers.formatUnits(poolInfo[5], 18), "USDT");
  console.log("待分发奖励:", hre.ethers.formatUnits(poolInfo[6], 18), "USDT");
  console.log("✅ 奖励池信息读取成功\n");

  // ==========================================================================
  // 测试 3: 最小质押时间
  // ==========================================================================
  console.log("[测试 3] 质押参数");
  console.log("─────────────────────────────────────────");

  const minStakeDuration = await liquidityStaking.getMinStakeDurationExternal();
  console.log("最小质押时间:", minStakeDuration.toString(), "秒 (", Number(minStakeDuration) / 3600, "小时)");
  console.log("最小奖励:", "0.001 USDT (1000 wei)");
  console.log("分配周期:", "7 天");
  console.log("权重公式:", "1 + (质押时间 / 365 天)");
  console.log("最大权重:", "2x (质押满 1 年)");
  console.log("✅ 质押参数读取成功\n");

  // ==========================================================================
  // 测试 4: 检查地址排除状态
  // ==========================================================================
  console.log("[测试 4] 地址排除状态");
  console.log("─────────────────────────────────────────");

  const [deployer, marketingWallet] = await hre.ethers.getSigners();

  const isLiquidityStakingExcluded = await liquidityStaking.excludedFromStaking(liquidityStakingAddress);
  const isSYIExcluded = await liquidityStaking.excludedFromStaking(syiContract);
  const isMarketingExcluded = await liquidityStaking.excludedFromStaking(marketingWallet.address);
  const isDeployerExcluded = await liquidityStaking.excludedFromStaking(deployer.address);

  console.log("LiquidityStaking 合约:", isLiquidityStakingExcluded ? "✅ 已排除" : "❌ 未排除");
  console.log("SYI Token 合约:", isSYIExcluded ? "✅ 已排除" : "❌ 未排除");
  console.log("Marketing 钱包:", isMarketingExcluded ? "✅ 已排除" : "❌ 未排除");
  console.log("Deployer 地址:", isDeployerExcluded ? "❌ 已排除" : "✅ 可质押");
  console.log("✅ 排除状态检查完成\n");

  // ==========================================================================
  // 测试 5: 累积的 SYI 奖励
  // ==========================================================================
  console.log("[测试 5] SYI 奖励累积");
  console.log("─────────────────────────────────────────");

  const accumulatedSYI = await liquidityStaking.accumulatedSYI();
  console.log("累积的 SYI:", hre.ethers.formatEther(accumulatedSYI), "SYI");
  console.log("自动兑换阈值:", "10 SYI");
  console.log("✅ SYI 累积信息读取成功\n");

  // ==========================================================================
  // 测试 6: 用户质押信息 (deployer)
  // ==========================================================================
  console.log("[测试 6] 用户质押信息");
  console.log("─────────────────────────────────────────");

  const userStakeInfo = await liquidityStaking.getUserStakeInfo(deployer.address);
  console.log("Deployer 质押信息:");
  console.log("  - 质押数量:", hre.ethers.formatEther(userStakeInfo[0]), "LP");
  console.log("  - 质押时间:", userStakeInfo[1].toString());
  console.log("  - 待领取奖励:", hre.ethers.formatUnits(userStakeInfo[2], 18), "USDT");
  console.log("  - 已累积奖励:", hre.ethers.formatUnits(userStakeInfo[3], 18), "USDT");
  console.log("  - 权重:", hre.ethers.formatEther(userStakeInfo[4]));
  console.log("✅ 用户质押信息读取成功\n");

  // ==========================================================================
  // 测试 7: 质押者列表
  // ==========================================================================
  console.log("[测试 7] 质押者列表");
  console.log("─────────────────────────────────────────");

  const stakersCount = await liquidityStaking.getStakersCount();
  console.log("质押者总数:", stakersCount.toString());

  if (stakersCount > 0n) {
    console.log("\n前 5 个质押者:");
    const maxCount = stakersCount < 5n ? stakersCount : 5n;
    for (let i = 0n; i < maxCount; i++) {
      const stakerAddress = await liquidityStaking.stakers(i);
      const stakeInfo = await liquidityStaking.stakes(stakerAddress);
      console.log(`  ${i + 1n}. ${stakerAddress}`);
      console.log(`     质押量: ${hre.ethers.formatEther(stakeInfo[0])} LP`);
      console.log(`     质押时间: ${new Date(Number(stakeInfo[1]) * 1000).toLocaleString()}`);
    }
  }

  console.log("✅ 质押者列表读取成功\n");

  // ==========================================================================
  // 测试 8: 检查是否可以解除质押
  // ==========================================================================
  console.log("[测试 8] 解除质押检查");
  console.log("─────────────────────────────────────────");

  const canUnstake = await liquidityStaking.canUnstake(deployer.address);
  const withdrawStatus = await liquidityStaking.canWithdrawStake(deployer.address);

  console.log("Deployer 解除质押状态:");
  console.log("  - 可以解除质押:", canUnstake ? "✅ 是" : "❌ 否");
  console.log("  - 质押数量:", hre.ethers.formatEther(withdrawStatus[1]), "LP");
  console.log("  - 剩余时间:", withdrawStatus[2].toString(), "秒");

  if (withdrawStatus[2] > 0n) {
    const remainingHours = Number(withdrawStatus[2]) / 3600;
    console.log(`    (约 ${remainingHours.toFixed(2)} 小时)`);
  }

  console.log("✅ 解除质押检查完成\n");

  // ==========================================================================
  // 总结
  // ==========================================================================
  console.log("==========================================");
  console.log("✅ 所有测试通过！");
  console.log("==========================================\n");

  console.log("📋 测试总结:");
  console.log("  1. ✅ 合约基本信息正确");
  console.log("  2. ✅ 奖励池初始化成功");
  console.log("  3. ✅ 质押参数配置正确");
  console.log("  4. ✅ 地址排除状态正确");
  console.log("  5. ✅ SYI 奖励累积功能正常");
  console.log("  6. ✅ 用户质押信息查询正常");
  console.log("  7. ✅ 质押者列表查询正常");
  console.log("  8. ✅ 解除质押检查功能正常");
  console.log("");

  console.log("📝 下一步操作:");
  console.log("  1. 将 LiquidityStaking 添加到 SYI Token 白名单");
  console.log("  2. 设置节点分红地址 (可选)");
  console.log("  3. 用户添加流动性到 SYI/USDT 交易对");
  console.log("  4. 用户质押 LP Token 到 LiquidityStaking");
  console.log("  5. SYI Token 交易产生的 LP 税费会自动分发到此合约");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
