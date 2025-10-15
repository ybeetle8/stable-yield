const hre = require("hardhat");

async function main() {
  console.log("\n========================================");
  console.log("部署 SYI Staking 合约到 BSC Fork 环境");
  console.log("========================================\n");

  // 获取部署账户
  const [deployer, feeRecipient] = await hre.ethers.getSigners();
  console.log("部署账户:", deployer.address);
  console.log("手续费接收账户:", feeRecipient.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("账户余额:", hre.ethers.formatEther(balance), "BNB\n");

  // BSC 主网地址
  const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
  const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

  console.log("使用的地址:");
  console.log("- USDT:", USDT_ADDRESS);
  console.log("- PancakeSwap Router:", PANCAKE_ROUTER);
  console.log("- Root 地址 (推荐系统根):", deployer.address);
  console.log("- Fee Recipient (手续费接收):", feeRecipient.address);
  console.log("");

  // 部署 Staking 合约
  console.log("正在部署 SYI Staking 合约...");
  const Staking = await hre.ethers.getContractFactory("contracts/SYI-Staking/mainnet/Staking.sol:Staking");
  const staking = await Staking.deploy(
    USDT_ADDRESS,
    PANCAKE_ROUTER,
    deployer.address,      // rootAddress
    feeRecipient.address   // feeRecipient
  );

  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();

  console.log("\n✅ SYI Staking 合约部署成功!");
  console.log("合约地址:", stakingAddress);

  // 验证合约信息
  console.log("\n正在验证合约配置...");
  const name = await staking.name();
  const symbol = await staking.symbol();
  const decimals = await staking.decimals();
  const rootAddress = await staking.getRootAddress();

  console.log("- 质押代币名称:", name);
  console.log("- 质押代币符号:", symbol);
  console.log("- 小数位数:", decimals);
  console.log("- Root 地址:", rootAddress);

  // 保存部署信息
  const fs = require('fs');
  const deploymentInfo = {
    network: "BSC Fork (localhost)",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    feeRecipient: feeRecipient.address,
    contracts: {
      Staking: stakingAddress,
      USDT: USDT_ADDRESS,
      PancakeRouter: PANCAKE_ROUTER
    },
    stakingInfo: {
      name,
      symbol,
      decimals: decimals.toString(),
      rootAddress
    }
  };

  fs.writeFileSync(
    'syi-staking-deployment.json',
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n✅ 部署信息已保存到 syi-staking-deployment.json");

  console.log("\n========================================");
  console.log("部署完成!");
  console.log("========================================\n");

  console.log("⚠️  注意事项:");
  console.log("1. SYI 代币合约还未部署，需要后续部署");
  console.log("2. 部署 SYI 代币后，需要调用 staking.setSYI(syiAddress)");
  console.log("3. 当前合约仅在 fork 的本地环境中有效");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
