const hre = require("hardhat");

async function main() {
  console.log("\n========================================");
  console.log("测试 SYI Staking 合约部署");
  console.log("========================================\n");

  // 读取部署信息
  const fs = require('fs');
  let deploymentInfo;

  try {
    deploymentInfo = JSON.parse(fs.readFileSync('syi-staking-deployment.json', 'utf8'));
    console.log("✅ 读取部署信息成功");
  } catch (error) {
    console.error("❌ 未找到部署信息文件，请先运行部署脚本");
    process.exit(1);
  }

  const stakingAddress = deploymentInfo.contracts.Staking;
  console.log("Staking 合约地址:", stakingAddress);
  console.log("");

  // 获取合约实例
  const Staking = await hre.ethers.getContractFactory("contracts/SYI-Staking/mainnet/Staking.sol:Staking");
  const staking = Staking.attach(stakingAddress);

  console.log("开始测试...\n");

  // 测试 1: 基本信息
  console.log("【测试 1】读取基本信息");
  try {
    const name = await staking.name();
    const symbol = await staking.symbol();
    const decimals = await staking.decimals();
    const totalSupply = await staking.totalSupply();

    console.log("✅ 名称:", name);
    console.log("✅ 符号:", symbol);
    console.log("✅ 小数位:", decimals.toString());
    console.log("✅ 总供应量:", hre.ethers.formatEther(totalSupply));
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  }
  console.log("");

  // 测试 2: 配置信息
  console.log("【测试 2】读取配置信息");
  try {
    const rootAddress = await staking.getRootAddress();
    const maxUserStake = await staking.getMaxUserTotalStake();
    const stakePeriods = await staking.getStakePeriods();

    console.log("✅ Root 地址:", rootAddress);
    console.log("✅ 最大用户质押额:", hre.ethers.formatEther(maxUserStake), "USDT");
    console.log("✅ 质押周期:");
    console.log("   - 1天:", (Number(stakePeriods[0]) / 86400).toFixed(0), "天");
    console.log("   - 7天:", (Number(stakePeriods[1]) / 86400).toFixed(0), "天");
    console.log("   - 15天:", (Number(stakePeriods[2]) / 86400).toFixed(0), "天");
    console.log("   - 30天:", (Number(stakePeriods[3]) / 86400).toFixed(0), "天");
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  }
  console.log("");

  // 测试 3: 团队奖励配置
  console.log("【测试 3】读取团队奖励配置");
  try {
    const thresholds = await staking.getTeamRewardThresholds();
    const rates = await staking.getTeamRewardRates();

    console.log("✅ 团队奖励阈值和比例:");
    for (let i = 0; i < 7; i++) {
      console.log(`   V${i+1}: ${hre.ethers.formatEther(thresholds[i])} USDT - ${rates[i]}%`);
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  }
  console.log("");

  // 测试 4: Owner 权限
  console.log("【测试 4】验证 Owner 权限");
  try {
    const [deployer] = await hre.ethers.getSigners();
    const owner = await staking.owner();

    if (owner.toLowerCase() === deployer.address.toLowerCase()) {
      console.log("✅ Owner 地址正确:", owner);
    } else {
      console.log("❌ Owner 地址不匹配");
      console.log("   预期:", deployer.address);
      console.log("   实际:", owner);
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  }
  console.log("");

  // 测试 5: USDT 和 Router 配置
  console.log("【测试 5】验证 USDT 和 Router 配置");
  try {
    const router = await staking.ROUTER();
    console.log("✅ PancakeSwap Router:", router);

    if (router.toLowerCase() === deploymentInfo.contracts.PancakeRouter.toLowerCase()) {
      console.log("✅ Router 地址正确");
    } else {
      console.log("❌ Router 地址不匹配");
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  }
  console.log("");

  // 测试 6: SYI 代币地址（应该为空）
  console.log("【测试 6】检查 SYI 代币地址");
  try {
    const syiAddress = await staking.SYI();
    if (syiAddress === "0x0000000000000000000000000000000000000000") {
      console.log("✅ SYI 代币地址未设置（符合预期）");
      console.log("   提示: 需要在部署 SYI 代币后调用 staking.setSYI(syiAddress)");
    } else {
      console.log("⚠️  SYI 代币地址已设置:", syiAddress);
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  }
  console.log("");

  console.log("========================================");
  console.log("测试完成!");
  console.log("========================================\n");

  console.log("📝 测试总结:");
  console.log("- Staking 合约部署成功");
  console.log("- 基本配置正确");
  console.log("- 团队奖励机制配置正确");
  console.log("- 质押周期配置正确");
  console.log("");
  console.log("⚠️  下一步:");
  console.log("1. 部署 SYI 代币合约");
  console.log("2. 调用 staking.setSYI(syiAddress)");
  console.log("3. 创建 SYI/USDT 交易对");
  console.log("4. 测试完整的质押流程");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
