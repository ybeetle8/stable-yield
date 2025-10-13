const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // 获取前10个测试账户
  const signers = await hre.ethers.getSigners();

  // 尝试读取部署信息
  const deploymentPath = path.join(__dirname, "..", "syi-deployment.json");
  let syi = null;
  let usdt = null;

  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const syiAddress = deployment.contracts.SYI;
    const usdtAddress = deployment.contracts.USDT;
    syi = await hre.ethers.getContractAt("contracts/SYI/mainnet/SYI.sol:SYI", syiAddress);
    usdt = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdtAddress);
  }

  // 打印前10个账户
  for (let i = 0; i < Math.min(10, signers.length); i++) {
    const address = signers[i].address;

    // 获取 BNB/ETH 余额
    const balance = await hre.ethers.provider.getBalance(address);
    const balanceFormatted = parseFloat(hre.ethers.formatEther(balance)).toFixed(6);

    // 获取 SYI 余额
    let syiBalance = "0";
    if (syi) {
      const bal = await syi.balanceOf(address);
      syiBalance = parseFloat(hre.ethers.formatEther(bal)).toFixed(1);
    }

    // 获取 USDT 余额
    let usdtBalance = "0.00";
    if (usdt) {
      const bal = await usdt.balanceOf(address);
      usdtBalance = parseFloat(hre.ethers.formatEther(bal)).toFixed(2);
    }

    console.log(`账户 #${i} (${address}): BSC:${balanceFormatted} ${syiBalance} SYI ${usdtBalance} USDT`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
