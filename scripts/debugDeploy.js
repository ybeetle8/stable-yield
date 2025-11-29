const hre = require("hardhat");

async function main() {
  console.log("=== 调试 Staking 部署问题 ===\n");

  const [deployer, feeRecipient, root] = await hre.ethers.getSigners();

  const usdtAddress = "0x55d398326f99059fF775485246999027B3197955";
  const routerAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

  console.log("部署者:", deployer.address);
  console.log("USDT:", usdtAddress);
  console.log("Router:", routerAddress);
  console.log("Root:", root.address);
  console.log("FeeRecipient:", feeRecipient.address);

  // 检查 USDT 合约是否可访问
  console.log("\n[1] 检查 USDT 合约...");
  const usdt = await hre.ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdtAddress
  );

  try {
    const balance = await usdt.balanceOf(deployer.address);
    console.log("✅ USDT 合约可访问，余额:", hre.ethers.formatEther(balance));
  } catch (e) {
    console.log("❌ USDT 合约访问失败:", e.message);
  }

  // 检查 Router 合约
  console.log("\n[2] 检查 Router 合约...");
  const router = await hre.ethers.getContractAt(
    "contracts/SYI/interfaces/IUniswapV2Router02.sol:IUniswapV2Router02",
    routerAddress
  );

  try {
    const factory = await router.factory();
    console.log("✅ Router 可访问，Factory:", factory);
  } catch (e) {
    console.log("❌ Router 访问失败:", e.message);
  }

  // 尝试手动执行构造函数中的操作
  console.log("\n[3] 模拟构造函数中的 USDT.approve() 调用...");
  try {
    const tx = await usdt.approve(routerAddress, hre.ethers.MaxUint256);
    await tx.wait();
    console.log("✅ approve 调用成功");
  } catch (e) {
    console.log("❌ approve 调用失败:", e.message);
    console.log("错误详情:", e);
  }

  // 尝试部署 Staking
  console.log("\n[4] 尝试部署 Staking 合约...");
  try {
    const Staking = await hre.ethers.getContractFactory(
      "contracts/SYI-Staking/mainnet/Staking.sol:Staking"
    );

    console.log("准备部署参数:");
    console.log("  - USDT:", usdtAddress);
    console.log("  - Router:", routerAddress);
    console.log("  - Root:", root.address);
    console.log("  - FeeRecipient:", feeRecipient.address);

    const staking = await Staking.deploy(
      usdtAddress,
      routerAddress,
      root.address,
      feeRecipient.address,
      { gasLimit: 10000000 }
    );

    console.log("等待部署确认...");
    await staking.waitForDeployment();
    const stakingAddress = await staking.getAddress();
    console.log("✅ Staking 部署成功:", stakingAddress);
  } catch (e) {
    console.log("❌ Staking 部署失败");
    console.log("错误类型:", e.constructor.name);
    console.log("错误信息:", e.message);
    if (e.data) {
      console.log("错误数据:", e.data);
    }
    if (e.error) {
      console.log("内部错误:", e.error);
    }
    if (e.receipt) {
      console.log("交易回执:", e.receipt);
    }

    // 尝试获取更多调试信息
    console.log("\n完整错误对象:");
    console.log(JSON.stringify(e, null, 2));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
