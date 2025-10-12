const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n==========================================");
  console.log("开始部署 SYI 代币合约");
  console.log("==========================================\n");

  const [deployer, marketingWallet] = await hre.ethers.getSigners();

  console.log("部署账户:", deployer.address);
  console.log("营销钱包:", marketingWallet.address);

  // 加载已部署的 Staking 合约地址
  const stakingDeploymentPath = path.join(__dirname, "..", "syi-staking-deployment.json");

  if (!fs.existsSync(stakingDeploymentPath)) {
    throw new Error("未找到 SYI-Staking 部署信息！请先部署 SYI-Staking 合约。");
  }

  const stakingDeployment = JSON.parse(fs.readFileSync(stakingDeploymentPath, "utf8"));

  const USDT_ADDRESS = stakingDeployment.contracts.USDT;
  const ROUTER_ADDRESS = stakingDeployment.contracts.PancakeRouter;
  const STAKING_ADDRESS = stakingDeployment.contracts.Staking;
  const MARKETING_ADDRESS = marketingWallet.address;

  console.log("\n使用的合约地址:");
  console.log("- USDT:", USDT_ADDRESS);
  console.log("- PancakeRouter:", ROUTER_ADDRESS);
  console.log("- Staking:", STAKING_ADDRESS);
  console.log("- Marketing:", MARKETING_ADDRESS);

  // 1. 部署 FundRelay (临时，稍后需要重新部署)
  console.log("\n[1/5] 部署 FundRelay (临时)...");
  const FundRelay = await hre.ethers.getContractFactory("contracts/SYI/utils/FundRelay.sol:FundRelay");
  const tempFundRelay = await FundRelay.deploy(
    deployer.address, // 临时使用 deployer 地址
    USDT_ADDRESS,
    deployer.address  // emergency recipient
  );
  await tempFundRelay.waitForDeployment();
  const tempFundRelayAddress = await tempFundRelay.getAddress();
  console.log("✅ FundRelay (临时) 部署成功:", tempFundRelayAddress);

  // 2. 部署 SYI 代币
  console.log("\n[2/5] 部署 SYI 代币合约...");
  const SYI = await hre.ethers.getContractFactory("contracts/SYI/mainnet/SYI.sol:SYI");
  const syi = await SYI.deploy(
    USDT_ADDRESS,
    ROUTER_ADDRESS,
    STAKING_ADDRESS,
    MARKETING_ADDRESS
  );
  await syi.waitForDeployment();
  const syiAddress = await syi.getAddress();
  console.log("✅ SYI 代币部署成功:", syiAddress);

  // 等待几个区块确保部署完成
  console.log("\n等待区块确认...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 3. 配置 Staking 合约
  console.log("\n[3/5] 配置 Staking 合约...");
  const Staking = await hre.ethers.getContractAt(
    "contracts/SYI-Staking/mainnet/Staking.sol:Staking",
    STAKING_ADDRESS
  );
  const setSYITx = await Staking.setSYI(syiAddress);
  await setSYITx.wait();
  console.log("✅ Staking.setSYI() 完成");

  // 4. 重新部署 FundRelay (使用正确的 SYI 地址)
  console.log("\n[4/5] 重新部署 FundRelay (使用正确的 SYI 地址)...");
  const fundRelay = await FundRelay.deploy(
    syiAddress,
    USDT_ADDRESS,
    deployer.address  // emergency recipient
  );
  await fundRelay.waitForDeployment();
  const fundRelayAddress = await fundRelay.getAddress();
  console.log("✅ FundRelay 部署成功:", fundRelayAddress);

  // 5. 配置 SYI 合约
  console.log("\n[5/5] 配置 SYI 合约...");

  // 初始化白名单
  console.log("- 初始化白名单...");
  const initWhitelistTx = await syi.initializeWhitelist();
  await initWhitelistTx.wait();
  console.log("✅ 白名单初始化完成");

  // 设置 FundRelay
  console.log("- 设置 FundRelay...");
  const setFundRelayTx = await syi.setFundRelay(fundRelayAddress);
  await setFundRelayTx.wait();
  console.log("✅ FundRelay 设置完成");

  // 创建交易对
  console.log("\n创建 SYI/USDT 交易对...");
  const PancakeFactory = await hre.ethers.getContractAt(
    "contracts/SYI/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory",
    "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" // PancakeSwap Factory on BSC
  );

  const createPairTx = await PancakeFactory.createPair(syiAddress, USDT_ADDRESS);
  await createPairTx.wait();
  const pairAddress = await PancakeFactory.getPair(syiAddress, USDT_ADDRESS);
  console.log("✅ 交易对创建成功:", pairAddress);

  // 设置交易对
  console.log("- 设置交易对地址...");
  const setPairTx = await syi.setPair(pairAddress);
  await setPairTx.wait();
  console.log("✅ 交易对地址设置完成");

  // 获取代币信息
  const name = await syi.name();
  const symbol = await syi.symbol();
  const decimals = await syi.decimals();
  const totalSupply = await syi.totalSupply();
  const ownerBalance = await syi.balanceOf(deployer.address);

  console.log("\n==========================================");
  console.log("SYI 代币信息");
  console.log("==========================================");
  console.log("名称:", name);
  console.log("符号:", symbol);
  console.log("精度:", decimals.toString());
  console.log("总供应量:", hre.ethers.formatEther(totalSupply), symbol);
  console.log("Owner 余额:", hre.ethers.formatEther(ownerBalance), symbol);

  // 保存部署信息
  const deployment = {
    network: "BSC Fork (localhost)",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    marketingWallet: marketingWallet.address,
    contracts: {
      SYI: syiAddress,
      FundRelay: fundRelayAddress,
      Staking: STAKING_ADDRESS,
      USDT: USDT_ADDRESS,
      PancakeRouter: ROUTER_ADDRESS,
      PancakeFactory: await PancakeFactory.getAddress(),
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
      presaleActive: await syi.presaleActive(),
      delayedBuyEnabled: await syi.delayedBuyEnabled(),
      swapAtAmount: (await syi.swapAtAmount()).toString(),
      coldTime: (await syi.coldTime()).toString()
    }
  };

  const outputPath = path.join(__dirname, "..", "syi-deployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
  console.log("\n✅ 部署信息已保存到:", outputPath);

  console.log("\n==========================================");
  console.log("✅ SYI 代币部署完成！");
  console.log("==========================================");
  console.log("\n下一步:");
  console.log("1. 如需添加初始流动性，请手动操作");
  console.log("2. 运行测试脚本: npx hardhat run scripts/testSYI.js --network localhost");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
