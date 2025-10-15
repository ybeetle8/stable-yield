const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "syi-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const syiAddress = deployment.contracts.SYI;
  const syi = await hre.ethers.getContractAt("contracts/SYI/mainnet/SYI.sol:SYI", syiAddress);

  console.log("检查 SYI 预售状态...\n");

  const presaleActive = await syi.presaleActive();
  const presaleStartTime = await syi.presaleStartTime();
  const presaleDuration = await syi.presaleDuration();

  const currentTime = Math.floor(Date.now() / 1000);
  const blockTime = (await hre.ethers.provider.getBlock("latest")).timestamp;

  console.log("预售激活:", presaleActive);
  console.log("预售开始时间:", new Date(Number(presaleStartTime) * 1000).toLocaleString());
  console.log("预售持续时间:", presaleDuration.toString(), "秒 (", Number(presaleDuration) / 86400, "天)");
  console.log("当前区块时间:", new Date(blockTime * 1000).toLocaleString());
  console.log("预售结束时间:", new Date((Number(presaleStartTime) + Number(presaleDuration)) * 1000).toLocaleString());

  const timeLeft = Number(presaleStartTime) + Number(presaleDuration) - blockTime;
  console.log("\n距离预售结束:", timeLeft, "秒");

  if (presaleActive && timeLeft > 0) {
    console.log("\n⚠️  预售期间不允许买入！");
    console.log("解决方案:");
    console.log("1. 关闭预售: await syi.endPresale()");
    console.log("2. 等待预售期结束");
  } else {
    console.log("\n✅ 可以进行交易");
  }
}

main().catch(console.error);
