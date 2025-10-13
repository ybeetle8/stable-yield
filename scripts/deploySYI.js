const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n==========================================");
  console.log("开始部署完整的 SYI 系统");
  console.log("==========================================\n");

  const [deployer, marketingWallet, rootWallet] = await hre.ethers.getSigners();

  console.log("部署账户:", deployer.address);
  console.log("营销钱包:", marketingWallet.address);
  console.log("Root 钱包:", rootWallet.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("账户余额:", hre.ethers.formatEther(balance), "ETH\n");

  // ========================================
  // 1. 使用 BSC 主网合约地址
  // ========================================
  console.log("[1/4] 使用 BSC 主网合约...");
  const usdtAddress = "0x55d398326f99059fF775485246999027B3197955"; // BSC USDT
  const wbnbAddress = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // BSC WBNB
  const factoryAddress = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"; // PancakeSwap Factory
  const routerAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E"; // PancakeSwap Router
  console.log("✅ USDT:", usdtAddress);
  console.log("✅ WBNB:", wbnbAddress);
  console.log("✅ Factory:", factoryAddress);
  console.log("✅ Router:", routerAddress);

  const factory = await hre.ethers.getContractAt("contracts/SYI/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory", factoryAddress);

  // 等待几个区块确保部署完成
  console.log("\n等待区块确认...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ========================================
  // 2. 部署 Staking 合约
  // ========================================
  console.log("\n[2/4] 部署 Staking 合约...");
  const Staking = await hre.ethers.getContractFactory("contracts/SYI-Staking/mainnet/Staking.sol:Staking");
  const staking = await Staking.deploy(
    usdtAddress,
    routerAddress,
    rootWallet.address,      // rootAddress - 推荐系统根节点
    marketingWallet.address  // feeRecipient - 手续费接收地址
  );
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("✅ Staking 部署成功:", stakingAddress);

  // ========================================
  // 3. 部署 SYI 代币
  // ========================================
  console.log("\n[3/4] 部署 SYI 代币合约...");

  // 先部署临时 FundRelay
  console.log("  - 部署临时 FundRelay...");
  const FundRelay = await hre.ethers.getContractFactory("contracts/SYI/utils/FundRelay.sol:FundRelay");
  const tempFundRelay = await FundRelay.deploy(
    deployer.address, // 临时使用 deployer 地址
    usdtAddress,
    deployer.address  // emergency recipient
  );
  await tempFundRelay.waitForDeployment();
  const tempFundRelayAddress = await tempFundRelay.getAddress();
  console.log("  ✅ 临时 FundRelay 部署:", tempFundRelayAddress);

  // 部署 SYI
  console.log("  - 部署 SYI 代币...");
  const SYI = await hre.ethers.getContractFactory("contracts/SYI/mainnet/SYI.sol:SYI");
  const syi = await SYI.deploy(
    usdtAddress,
    routerAddress,
    stakingAddress,
    marketingWallet.address
  );
  await syi.waitForDeployment();
  const syiAddress = await syi.getAddress();
  console.log("  ✅ SYI 代币部署成功:", syiAddress);

  // ========================================
  // 4. 配置阶段
  // ========================================
  console.log("\n==========================================");
  console.log("开始配置合约关联关系");
  console.log("==========================================\n");

  // 1. 初始化 SYI 白名单
  console.log("[1/5] 初始化 SYI 白名单...");
  const initWhitelistTx = await syi.initializeWhitelist();
  await initWhitelistTx.wait();
  console.log("✅ 白名单初始化完成");

  // 2. 配置 Staking 的 SYI 地址
  console.log("\n[2/5] 配置 Staking.setSYI()...");
  const setSYITx = await staking.setSYI(syiAddress);
  await setSYITx.wait();
  console.log("✅ Staking 配置完成");

  // 3. 重新部署正确的 FundRelay
  console.log("\n[3/5] 重新部署 FundRelay (使用正确的 SYI 地址)...");
  const fundRelay = await FundRelay.deploy(
    syiAddress,
    usdtAddress,
    deployer.address  // emergency recipient
  );
  await fundRelay.waitForDeployment();
  const fundRelayAddress = await fundRelay.getAddress();
  console.log("✅ FundRelay 部署成功:", fundRelayAddress);

  // 4. 设置 SYI 的 FundRelay
  console.log("\n[4/5] 设置 SYI.setFundRelay()...");
  const setFundRelayTx = await syi.setFundRelay(fundRelayAddress);
  await setFundRelayTx.wait();
  console.log("✅ FundRelay 设置完成");

  // 5. 创建并设置交易对
  console.log("\n[5/5] 创建 SYI/USDT 交易对...");
  const createPairTx = await factory.createPair(syiAddress, usdtAddress);
  await createPairTx.wait();
  const pairAddress = await factory.getPair(syiAddress, usdtAddress);
  console.log("✅ 交易对创建成功:", pairAddress);

  console.log("设置 SYI.setPair()...");
  const setPairTx = await syi.setPair(pairAddress);
  await setPairTx.wait();
  console.log("✅ Pair 地址设置完成");

  // ========================================
  // 验证部署信息
  // ========================================
  console.log("\n==========================================");
  console.log("验证部署信息");
  console.log("==========================================\n");

  const name = await syi.name();
  const symbol = await syi.symbol();
  const decimals = await syi.decimals();
  const totalSupply = await syi.totalSupply();
  const ownerBalance = await syi.balanceOf(deployer.address);

  console.log("SYI 代币信息:");
  console.log("- 名称:", name);
  console.log("- 符号:", symbol);
  console.log("- 精度:", decimals.toString());
  console.log("- 总供应量:", hre.ethers.formatEther(totalSupply), symbol);
  console.log("- Owner 余额:", hre.ethers.formatEther(ownerBalance), symbol);

  const presaleActive = await syi.presaleActive();
  const delayedBuyEnabled = await syi.delayedBuyEnabled();
  console.log("\nSYI 配置:");
  console.log("- 预售激活:", presaleActive);
  console.log("- 延迟购买:", delayedBuyEnabled);

  // ========================================
  // 保存部署信息
  // ========================================
  const deployment = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    marketingWallet: marketingWallet.address,
    rootWallet: rootWallet.address,
    contracts: {
      SYI: syiAddress,
      Staking: stakingAddress,
      FundRelay: fundRelayAddress,
      USDT: usdtAddress,
      WBNB: wbnbAddress,
      PancakeFactory: factoryAddress,
      PancakeRouter: routerAddress,
      SYI_USDT_Pair: pairAddress
    },
    tokenInfo: {
      name,
      symbol,
      decimals: decimals.toString(),
      totalSupply: totalSupply.toString(),
      ownerBalance: ownerBalance.toString()
    },
    configuration: {
      presaleActive,
      delayedBuyEnabled,
      coldTime: (await syi.coldTime()).toString(),
      swapAtAmount: (await syi.swapAtAmount()).toString()
    },
    taxRates: {
      buyTax: "1%",
      buyBurn: "1%",
      sellTax: "1.5%",
      sellMarketing: "1.5%",
      profitTax: "25%",
      note: "已移除 LP 质押相关费用"
    }
  };

  const outputPath = path.join(__dirname, "..", "syi-deployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
  console.log("\n✅ 部署信息已保存到:", outputPath);

  console.log("\n==========================================");
  console.log("✅ SYI 系统部署完成！");
  console.log("==========================================");
  console.log("\n合约地址总结:");
  console.log("- SYI 代币:", syiAddress);
  console.log("- Staking:", stakingAddress);
  console.log("- USDT:", usdtAddress);
  console.log("- Router:", routerAddress);
  console.log("- Factory:", factoryAddress);
  console.log("- Pair:", pairAddress);
  console.log("\n税费结构:");
  console.log("- 买入税: 1% (burn)");
  console.log("- 卖出税: 1.5% (marketing)");
  console.log("- 盈利税: 25% (全部给节点/营销)");
  console.log("\n下一步:");
  console.log("1. 运行测试脚本: npx hardhat run scripts/testSYI.js --network localhost");
  console.log("2. 添加初始流动性（如需要）");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
