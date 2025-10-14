const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n==========================================");
  console.log("添加 SYI/USDT 流动性");
  console.log("==========================================\n");

  // 读取部署信息
  const deploymentPath = path.join(__dirname, "..", "syi-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const syiAddress = deployment.contracts.SYI;
  const usdtAddress = deployment.contracts.USDT;
  const routerAddress = deployment.contracts.PancakeRouter;

  console.log("合约地址:");
  console.log("- SYI:", syiAddress);
  console.log("- USDT:", usdtAddress);
  console.log("- Router:", routerAddress);

  const [deployer] = await hre.ethers.getSigners();
  console.log("\n部署账户:", deployer.address);

  // 获取合约实例
  const syi = await hre.ethers.getContractAt("contracts/SYI/mainnet/SYI.sol:SYI", syiAddress);
  const usdt = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdtAddress);
  const router = await hre.ethers.getContractAt("@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol:IUniswapV2Router02", routerAddress);

  // 准备流动性
  const usdtAmount = hre.ethers.parseEther("40000");
  const syiAmount = hre.ethers.parseEther("40000000");

  console.log("\n准备添加流动性:");
  console.log("- USDT:", hre.ethers.formatEther(usdtAmount));
  console.log("- SYI:", hre.ethers.formatEther(syiAmount));

  // 检查余额
  const deployerUsdtBalance = await usdt.balanceOf(deployer.address);
  const deployerSyiBalance = await syi.balanceOf(deployer.address);

  console.log("\n当前余额:");
  console.log("- USDT:", hre.ethers.formatEther(deployerUsdtBalance));
  console.log("- SYI:", hre.ethers.formatEther(deployerSyiBalance));

  // 如果 USDT 不足，设置余额
  if (deployerUsdtBalance < usdtAmount) {
    console.log("\nUSDT 不足，设置余额（fork 模式）...");
    const paddedAddress = hre.ethers.zeroPadValue(deployer.address, 32);
    const paddedSlot = hre.ethers.zeroPadValue(hre.ethers.toBeHex(1), 32);
    const index = hre.ethers.keccak256(hre.ethers.concat([paddedAddress, paddedSlot]));
    const value = hre.ethers.zeroPadValue(hre.ethers.toBeHex(usdtAmount), 32);

    await hre.network.provider.send("hardhat_setStorageAt", [
      usdtAddress,
      index,
      value
    ]);

    const newBalance = await usdt.balanceOf(deployer.address);
    console.log("✅ 新 USDT 余额:", hre.ethers.formatEther(newBalance));
  }

  // 授权
  console.log("\n授权代币...");
  const approveUsdtTx = await usdt.approve(routerAddress, usdtAmount);
  await approveUsdtTx.wait();
  console.log("✅ USDT 授权完成");

  const approveSyiTx = await syi.approve(routerAddress, syiAmount);
  await approveSyiTx.wait();
  console.log("✅ SYI 授权完成");

  // 获取当前区块时间戳并设置 deadline
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  const deadline = latestBlock.timestamp + 3600; // 1小时后

  console.log("\n当前区块时间戳:", latestBlock.timestamp);
  console.log("Deadline:", deadline);

  // 添加流动性
  console.log("\n添加流动性...");
  try {
    const addLiquidityTx = await router.addLiquidity(
      usdtAddress,
      syiAddress,
      usdtAmount,
      syiAmount,
      0, // amountAMin
      0, // amountBMin
      deployer.address,
      deadline
    );
    const receipt = await addLiquidityTx.wait();
    console.log("✅ 流动性添加成功");
    console.log("Gas used:", receipt.gasUsed.toString());

    // 查询池子信息
    const pairAddress = deployment.contracts.SYI_USDT_Pair;
    const pair = await hre.ethers.getContractAt("@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol:IUniswapV2Pair", pairAddress);
    const reserves = await pair.getReserves();
    const token0 = await pair.token0();

    console.log("\n池子储备量:");
    if (token0.toLowerCase() === usdtAddress.toLowerCase()) {
      console.log("- USDT:", hre.ethers.formatEther(reserves[0]));
      console.log("- SYI:", hre.ethers.formatEther(reserves[1]));
    } else {
      console.log("- SYI:", hre.ethers.formatEther(reserves[0]));
      console.log("- USDT:", hre.ethers.formatEther(reserves[1]));
    }

    console.log("\n✅ 流动性添加完成!");
  } catch (error) {
    console.error("❌ 添加流动性失败:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
