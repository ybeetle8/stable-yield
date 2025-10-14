const hre = require("hardhat");
const fs = require("fs");
const { ethers } = hre;

async function main() {
  console.log("\n添加流动性到 SYI/USDT 池子\n");

  const deployment = JSON.parse(fs.readFileSync("./syi-deployment.json", "utf8"));

  const syiAddress = deployment.contracts.SYI;
  const usdtAddress = deployment.contracts.USDT;
  const routerAddress = deployment.contracts.PancakeRouter;

  const [deployer] = await ethers.getSigners();

  const SYI = await ethers.getContractAt("SYI", syiAddress);
  const USDT = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdtAddress
  );
  const Router = await ethers.getContractAt("IUniswapV2Router02", routerAddress);

  const syiBalance = await SYI.balanceOf(deployer.address);
  const usdtBalance = await USDT.balanceOf(deployer.address);

  console.log(`SYI 余额: ${ethers.formatEther(syiBalance)}`);
  console.log(`USDT 余额: ${ethers.formatEther(usdtBalance)}`);

  const usdtNeeded = ethers.parseEther("40100");
  if (usdtBalance < usdtNeeded) {
    console.log("\n设置 USDT 余额...");
    const usdtBalanceSlot = 1;
    const storageKey = ethers.solidityPackedKeccak256(
      ["uint256", "uint256"],
      [deployer.address, usdtBalanceSlot]
    );
    await ethers.provider.send("hardhat_setStorageAt", [
      usdtAddress,
      storageKey,
      ethers.toBeHex(usdtNeeded, 32)
    ]);
    console.log(`✅ USDT 余额已设置`);
  }

  const usdtAmount = ethers.parseEther("40000");
  const syiAmount = ethers.parseEther("40000000");

  console.log("\n授权代币...");
  await (await USDT.approve(routerAddress, usdtAmount)).wait();
  await (await SYI.approve(routerAddress, syiAmount)).wait();
  console.log("✅ 授权完成");

  console.log("\n添加流动性...");
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  const tx = await Router.addLiquidity(
    usdtAddress,
    syiAddress,
    usdtAmount,
    syiAmount,
    0,
    0,
    deployer.address,
    deadline,
    { gasLimit: 5000000 }
  );

  await tx.wait();
  console.log("✅ 流动性添加成功!\n");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
