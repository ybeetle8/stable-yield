const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("==========================================");
  console.log("SYI LiquidityStaking 部署脚本");
  console.log("==========================================\n");

  const [deployer, marketingWallet] = await hre.ethers.getSigners();
  console.log("部署账户:", deployer.address);
  console.log("Marketing 钱包:", marketingWallet.address);
  console.log("账户余额:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  // 读取 SYI 部署信息
  const syiDeploymentPath = path.join(__dirname, "../syi-deployment.json");
  if (!fs.existsSync(syiDeploymentPath)) {
    throw new Error("❌ 未找到 syi-deployment.json 文件，请先部署 SYI Token");
  }

  const syiDeployment = JSON.parse(fs.readFileSync(syiDeploymentPath, "utf8"));
  console.log("📄 已加载 SYI 部署信息");
  console.log("  - SYI Token:", syiDeployment.contracts.SYI);
  console.log("  - Staking:", syiDeployment.contracts.Staking);
  console.log("  - SYI/USDT Pair:", syiDeployment.contracts.SYI_USDT_Pair);
  console.log("");

  // 合约地址
  const USDT = syiDeployment.contracts.USDT;
  const SYI = syiDeployment.contracts.SYI;
  const SYI_USDT_Pair = syiDeployment.contracts.SYI_USDT_Pair;
  const Staking = syiDeployment.contracts.Staking;
  const PancakeRouter = syiDeployment.contracts.PancakeRouter;

  console.log("==========================================");
  console.log("1. 部署 LiquidityStaking 合约");
  console.log("==========================================\n");

  console.log("构造函数参数:");
  console.log("  - USDT:", USDT);
  console.log("  - SYI Token:", SYI);
  console.log("  - LP Token (SYI/USDT):", SYI_USDT_Pair);
  console.log("  - Staking:", Staking);
  console.log("  - Marketing:", marketingWallet.address);
  console.log("  - Admin (Owner):", deployer.address);
  console.log("  - Router:", PancakeRouter);
  console.log("");

  const LiquidityStaking = await hre.ethers.getContractFactory("LiquidityStaking");
  const liquidityStaking = await LiquidityStaking.deploy(
    USDT,
    SYI,
    SYI_USDT_Pair,
    Staking,
    marketingWallet.address,
    deployer.address,
    PancakeRouter
  );

  await liquidityStaking.waitForDeployment();
  const liquidityStakingAddress = await liquidityStaking.getAddress();

  console.log("✅ LiquidityStaking 已部署:", liquidityStakingAddress);
  console.log("");

  console.log("==========================================");
  console.log("2. 验证合约配置");
  console.log("==========================================\n");

  const syiContract = await liquidityStaking.syiContract();
  const lpToken = await liquidityStaking.lpToken();
  const staking = await liquidityStaking.staking();
  const usdt = await liquidityStaking.usdt();
  const router = await liquidityStaking.router();
  const owner = await liquidityStaking.owner();

  console.log("合约配置:");
  console.log("  - SYI Token:", syiContract);
  console.log("  - LP Token:", lpToken);
  console.log("  - Staking:", staking);
  console.log("  - USDT:", usdt);
  console.log("  - Router:", router);
  console.log("  - Owner:", owner);
  console.log("");

  // 验证地址是否正确
  if (syiContract !== SYI) {
    throw new Error("❌ SYI Token 地址不匹配");
  }
  if (lpToken !== SYI_USDT_Pair) {
    throw new Error("❌ LP Token 地址不匹配");
  }
  if (staking !== Staking) {
    throw new Error("❌ Staking 地址不匹配");
  }

  console.log("✅ 所有地址验证通过\n");

  console.log("==========================================");
  console.log("3. 保存部署信息");
  console.log("==========================================\n");

  const deploymentInfo = {
    network: "BSC Fork (localhost)",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    marketingWallet: marketingWallet.address,
    contracts: {
      LiquidityStaking: liquidityStakingAddress,
      SYI: SYI,
      Staking: Staking,
      SYI_USDT_Pair: SYI_USDT_Pair,
      USDT: USDT,
      PancakeRouter: PancakeRouter,
    },
    configuration: {
      minStakeDuration: "24 hours",
      minRewardAmount: "0.001 USDT",
      distributionPeriod: "7 days",
      weightFormula: "1 + (duration / 365 days)",
      maxWeight: "2x (1 year)",
    },
  };

  const outputPath = path.join(__dirname, "../syi-liquidity-staking-deployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("✅ 部署信息已保存到:", outputPath);
  console.log("");

  console.log("==========================================");
  console.log("✅ 部署完成！");
  console.log("==========================================\n");

  console.log("📋 合约地址:");
  console.log("  - LiquidityStaking:", liquidityStakingAddress);
  console.log("");

  console.log("📝 下一步操作:");
  console.log("  1. 将 LiquidityStaking 添加到 SYI Token 白名单");
  console.log("     syi.addToWhitelist('" + liquidityStakingAddress + "')");
  console.log("");
  console.log("  2. 设置 SYI Token 的节点分红地址 (可选)");
  console.log("     syi.setNodeDividendAddress('" + liquidityStakingAddress + "')");
  console.log("");
  console.log("  3. 运行测试脚本:");
  console.log("     npx hardhat run scripts/testSYILiquidityStaking.js --network localhost");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
