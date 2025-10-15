const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "syi-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const syiAddress = deployment.contracts.SYI;
  const usdtAddress = deployment.contracts.USDT;
  const pairAddress = deployment.contracts.SYI_USDT_Pair;

  console.log("检查交易对状态...\n");

  const pair = await hre.ethers.getContractAt("contracts/SYI/interfaces/IUniswapV2Pair.sol:IUniswapV2Pair", pairAddress);
  const syi = await hre.ethers.getContractAt("contracts/SYI/mainnet/SYI.sol:SYI", syiAddress);

  const reserves = await pair.getReserves();
  const token0 = await pair.token0();
  const totalSupply = await pair.totalSupply();

  console.log("Pair 地址:", pairAddress);
  console.log("Token0:", token0);
  console.log("Reserves:", reserves);
  console.log("Total Supply:", hre.ethers.formatEther(totalSupply));

  // 检查 Pair 中的代币余额
  const syiBalance = await syi.balanceOf(pairAddress);
  console.log("\nPair 中的 SYI 余额:", hre.ethers.formatEther(syiBalance));

  // 检查白名单
  const isPairWhitelisted = await syi.whitelistEnabled(pairAddress);
  console.log("Pair 是否在白名单:", isPairWhitelisted);

  // 检查预售状态
  const presaleActive = await syi.presaleActive();
  console.log("预售激活:", presaleActive);
}

main().catch(console.error);
