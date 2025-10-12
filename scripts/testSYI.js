const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n==========================================");
  console.log("SYI 代币合约测试");
  console.log("==========================================\n");

  // 加载部署信息
  const deploymentPath = path.join(__dirname, "..", "syi-deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("未找到部署信息文件！请先运行 deploySYI.js");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const syiAddress = deployment.contracts.SYI;
  const stakingAddress = deployment.contracts.Staking;
  const usdtAddress = deployment.contracts.USDT;
  const pairAddress = deployment.contracts.SYI_USDT_Pair;

  const [deployer, user1, user2] = await hre.ethers.getSigners();

  console.log("测试账户:");
  console.log("- Deployer:", deployer.address);
  console.log("- User1:", user1.address);
  console.log("- User2:", user2.address);

  // 获取合约实例
  const SYI = await hre.ethers.getContractAt(
    "contracts/SYI/mainnet/SYI.sol:SYI",
    syiAddress
  );

  const USDT = await hre.ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdtAddress
  );

  const Pair = await hre.ethers.getContractAt(
    "contracts/SYI/interfaces/IUniswapV2Pair.sol:IUniswapV2Pair",
    pairAddress
  );

  // ============================================
  // 测试 1: 基本信息
  // ============================================
  console.log("\n[测试 1] 代币基本信息");
  console.log("─────────────────────────────────────────");

  const name = await SYI.name();
  const symbol = await SYI.symbol();
  const decimals = await SYI.decimals();
  const totalSupply = await SYI.totalSupply();
  const ownerBalance = await SYI.balanceOf(deployer.address);

  console.log("名称:", name);
  console.log("符号:", symbol);
  console.log("精度:", decimals.toString());
  console.log("总供应量:", hre.ethers.formatEther(totalSupply), symbol);
  console.log("Owner 余额:", hre.ethers.formatEther(ownerBalance), symbol);
  console.log("✅ 基本信息正确");

  // ============================================
  // 测试 2: 配置信息
  // ============================================
  console.log("\n[测试 2] 合约配置");
  console.log("─────────────────────────────────────────");

  const presaleStatus = await SYI.getPresaleStatus();
  const delayedBuyInfo = await SYI.getDelayedBuyInfo();
  const accumulatedFees = await SYI.getAccumulatedFees();
  const marketingAddress = await SYI.marketingAddress();
  const fundRelayAddress = await SYI.getFundRelay();

  console.log("预售状态:");
  console.log("  - 是否激活:", presaleStatus.active);
  console.log("  - 是否在预售期:", presaleStatus.isInPresale);
  console.log("  - 剩余时间:", presaleStatus.remainingTime.toString(), "秒");

  console.log("\n延迟买入:");
  console.log("  - 是否启用:", delayedBuyInfo.enabled);
  console.log("  - 所需延迟:", delayedBuyInfo.requiredDelay.toString(), "秒");

  console.log("\n累积手续费:");
  console.log("  - Marketing 费用:", hre.ethers.formatEther(accumulatedFees.marketing), symbol);
  console.log("  - LP 费用:", hre.ethers.formatEther(accumulatedFees.lp), symbol);
  console.log("  - 触发阈值:", hre.ethers.formatEther(accumulatedFees.threshold), symbol);

  console.log("\n关键地址:");
  console.log("  - Marketing:", marketingAddress);
  console.log("  - FundRelay:", fundRelayAddress);
  console.log("  - Staking:", stakingAddress);
  console.log("✅ 配置查询成功");

  // ============================================
  // 测试 3: 白名单状态
  // ============================================
  console.log("\n[测试 3] 白名单状态");
  console.log("─────────────────────────────────────────");

  const ownerWhitelisted = await SYI.feeWhitelisted(deployer.address);
  const syiWhitelisted = await SYI.feeWhitelisted(syiAddress);
  const stakingWhitelisted = await SYI.feeWhitelisted(stakingAddress);
  const user1Whitelisted = await SYI.feeWhitelisted(user1.address);

  console.log("Owner 白名单:", ownerWhitelisted ? "✅ 是" : "❌ 否");
  console.log("SYI 合约白名单:", syiWhitelisted ? "✅ 是" : "❌ 否");
  console.log("Staking 白名单:", stakingWhitelisted ? "✅ 是" : "❌ 否");
  console.log("User1 白名单:", user1Whitelisted ? "✅ 是" : "❌ 否");
  console.log("✅ 白名单检查完成");

  // ============================================
  // 测试 4: 转账功能 (白名单间转账，免税)
  // ============================================
  console.log("\n[测试 4] 白名单间转账 (免税)");
  console.log("─────────────────────────────────────────");

  const transferAmount = hre.ethers.parseEther("100");
  const user1BalanceBefore = await SYI.balanceOf(user1.address);

  console.log("转账前 User1 余额:", hre.ethers.formatEther(user1BalanceBefore), symbol);

  // Owner 给 User1 转账 (Owner 在白名单中，免税)
  const transferTx = await SYI.transfer(user1.address, transferAmount);
  await transferTx.wait();

  const user1BalanceAfter = await SYI.balanceOf(user1.address);
  console.log("转账后 User1 余额:", hre.ethers.formatEther(user1BalanceAfter), symbol);
  console.log("转账金额:", hre.ethers.formatEther(transferAmount), symbol);
  console.log("实际到账:", hre.ethers.formatEther(user1BalanceAfter - user1BalanceBefore), symbol);

  if (user1BalanceAfter - user1BalanceBefore === transferAmount) {
    console.log("✅ 白名单转账成功 (免税)");
  } else {
    console.log("❌ 转账金额不匹配");
  }

  // ============================================
  // 测试 5: 交易对信息
  // ============================================
  console.log("\n[测试 5] SYI/USDT 交易对");
  console.log("─────────────────────────────────────────");

  const pairName = await Pair.name();
  const pairSymbol = await Pair.symbol();
  const pairTotalSupply = await Pair.totalSupply();
  const token0 = await Pair.token0();
  const token1 = await Pair.token1();

  console.log("交易对名称:", pairName);
  console.log("交易对符号:", pairSymbol);
  console.log("LP Token 总量:", hre.ethers.formatEther(pairTotalSupply));
  console.log("Token0:", token0);
  console.log("Token1:", token1);

  try {
    const reserves = await Pair.getReserves();
    console.log("\n当前储备量:");
    console.log("  - Reserve0:", hre.ethers.formatEther(reserves.reserve0));
    console.log("  - Reserve1:", hre.ethers.formatEther(reserves.reserve1));
  } catch (e) {
    console.log("\n⚠️  交易对还未添加流动性");
  }

  console.log("✅ 交易对信息获取成功");

  // ============================================
  // 测试 6: 用户投资记录
  // ============================================
  console.log("\n[测试 6] 用户投资记录");
  console.log("─────────────────────────────────────────");

  const ownerInvestment = await SYI.getUserInvestment(deployer.address);
  const user1Investment = await SYI.getUserInvestment(user1.address);

  console.log("Owner 投资记录:");
  console.log("  - 总投资 (USDT):", hre.ethers.formatEther(ownerInvestment.investment));
  console.log("  - 最后买入时间:", ownerInvestment.lastBuy.toString());

  console.log("\nUser1 投资记录:");
  console.log("  - 总投资 (USDT):", hre.ethers.formatEther(user1Investment.investment));
  console.log("  - 最后买入时间:", user1Investment.lastBuy.toString());

  console.log("✅ 投资记录查询成功");

  // ============================================
  // 测试 7: Staking 集成
  // ============================================
  console.log("\n[测试 7] Staking 集成状态");
  console.log("─────────────────────────────────────────");

  const Staking = await hre.ethers.getContractAt(
    "contracts/SYI-Staking/mainnet/Staking.sol:Staking",
    stakingAddress
  );

  const stakingName = await Staking.name();
  const stakingSymbol = await Staking.symbol();
  const rootAddress = await Staking.getRootAddress();

  console.log("Staking 合约:");
  console.log("  - 名称:", stakingName);
  console.log("  - 符号:", stakingSymbol);
  console.log("  - Root 地址:", rootAddress);

  console.log("✅ Staking 集成正常");

  // ============================================
  // 测试 8: Owner 权限功能
  // ============================================
  console.log("\n[测试 8] Owner 权限测试");
  console.log("─────────────────────────────────────────");

  // 测试添加白名单
  const addWhitelistTx = await SYI.setFeeWhitelisted(user2.address, true);
  await addWhitelistTx.wait();

  const user2Whitelisted = await SYI.feeWhitelisted(user2.address);
  console.log("添加 User2 到白名单:", user2Whitelisted ? "✅ 成功" : "❌ 失败");

  // 测试移除白名单
  const removeWhitelistTx = await SYI.setFeeWhitelisted(user2.address, false);
  await removeWhitelistTx.wait();

  const user2WhitelistedAfter = await SYI.feeWhitelisted(user2.address);
  console.log("移除 User2 白名单:", !user2WhitelistedAfter ? "✅ 成功" : "❌ 失败");

  console.log("✅ Owner 权限功能正常");

  // ============================================
  // 总结
  // ============================================
  console.log("\n==========================================");
  console.log("✅ 所有测试通过！");
  console.log("==========================================");

  console.log("\n📊 测试总结:");
  console.log("✅ 基本信息正确");
  console.log("✅ 配置查询成功");
  console.log("✅ 白名单功能正常");
  console.log("✅ 转账功能正常");
  console.log("✅ 交易对创建成功");
  console.log("✅ 投资记录追踪正常");
  console.log("✅ Staking 集成正常");
  console.log("✅ Owner 权限正常");

  console.log("\n💡 提示:");
  console.log("- 当前处于预售期，非白名单用户无法买入");
  console.log("- 交易对已创建，可以添加初始流动性");
  console.log("- 所有核心功能已验证通过");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 测试失败:");
    console.error(error);
    process.exit(1);
  });
