const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n==========================================");
  console.log("测试 SYI 买卖功能");
  console.log("==========================================\n");

  // 加载部署信息
  const deploymentPath = path.join(__dirname, "..", "syi-deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("找不到 syi-deployment.json，请先运行 deploySYI.js");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const syiAddress = deployment.contracts.SYI;
  const usdtAddress = deployment.contracts.USDT;
  const routerAddress = deployment.contracts.PancakeRouter;
  const pairAddress = deployment.contracts.SYI_USDT_Pair;

  console.log("合约地址:");
  console.log("- SYI:", syiAddress);
  console.log("- USDT:", usdtAddress);
  console.log("- Router:", routerAddress);
  console.log("- Pair:", pairAddress);

  // 获取第6号测试钱包
  const signers = await hre.ethers.getSigners();
  const wallet6 = signers[6];
  console.log("\n测试钱包6地址:", wallet6.address);

  // 连接合约
  const syi = await hre.ethers.getContractAt("contracts/SYI/mainnet/SYI.sol:SYI", syiAddress);
  const usdt = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdtAddress);
  const router = await hre.ethers.getContractAt("contracts/SYI/interfaces/IUniswapV2Router02.sol:IUniswapV2Router02", routerAddress);

  // ========================================
  // 0. 检查并关闭预售（如果需要）
  // ========================================
  console.log("\n[0/5] 检查预售状态...");
  const presaleActive = await syi.presaleActive();
  console.log("预售激活:", presaleActive);

  if (presaleActive) {
    console.log("预售期间不允许买入，正在关闭预售...");
    const deployer = signers[0];
    const setPresaleTx = await syi.connect(deployer).setPresaleActive(false);
    await setPresaleTx.wait();
    console.log("✅ 预售已关闭");
  }

  // ========================================
  // 1. 检查并设置 USDT 余额
  // ========================================
  console.log("\n[1/5] 检查 USDT 余额...");
  let usdtBalance = await usdt.balanceOf(wallet6.address);
  console.log("当前 USDT 余额:", hre.ethers.formatEther(usdtBalance), "USDT");

  const requiredUsdt = hre.ethers.parseEther("300"); // 准备 300 USDT，确保足够

  if (usdtBalance < requiredUsdt) {
    console.log("USDT 不足，正在设置余额（fork模式）...");
    console.log("需要:", hre.ethers.formatEther(requiredUsdt), "USDT");

    // 查找 USDT balance storage slot
    console.log("正在查找 USDT balance storage slot...");
    let found = false;

    for (let slot = 0; slot < 10 && !found; slot++) {
      const paddedAddress = hre.ethers.zeroPadValue(wallet6.address, 32);
      const paddedSlot = hre.ethers.zeroPadValue(hre.ethers.toBeHex(slot), 32);
      const index = hre.ethers.keccak256(hre.ethers.concat([paddedAddress, paddedSlot]));
      const value = hre.ethers.zeroPadValue(hre.ethers.toBeHex(requiredUsdt), 32);

      await hre.network.provider.send("hardhat_setStorageAt", [
        usdtAddress,
        index,
        value
      ]);

      const newBalance = await usdt.balanceOf(wallet6.address);
      if (newBalance === requiredUsdt) {
        found = true;
        console.log(`✅ 找到 balance slot: ${slot}`);
        break;
      }
    }

    if (!found) {
      throw new Error("无法找到 USDT balance storage slot");
    }

    usdtBalance = await usdt.balanceOf(wallet6.address);
    console.log("✅ 余额设置完成，新 USDT 余额:", hre.ethers.formatEther(usdtBalance), "USDT");
  }

  // ========================================
  // 2. 买入 200 USDT 的 SYI
  // ========================================
  console.log("\n[2/5] 买入 SYI...");
  const buyAmount = hre.ethers.parseEther("200");
  console.log("准备用", hre.ethers.formatEther(buyAmount), "USDT 买入 SYI");

  // 记录买入前的状态
  const usdtBefore = await usdt.balanceOf(wallet6.address);
  const syiBefore = await syi.balanceOf(wallet6.address);

  console.log("\n买入前:");
  console.log("- USDT 余额:", hre.ethers.formatEther(usdtBefore), "USDT");
  console.log("- SYI 余额:", hre.ethers.formatEther(syiBefore), "SYI");

  // 授权 Router 使用 USDT
  console.log("\n授权 Router 使用 USDT...");
  const approveUsdtTx = await usdt.connect(wallet6).approve(routerAddress, buyAmount);
  await approveUsdtTx.wait();
  console.log("✅ USDT 授权完成");

  // 买入 SYI
  console.log("执行买入交易...");
  const currentBlock = await hre.ethers.provider.getBlock("latest");
  const deadline = currentBlock.timestamp + 60 * 20; // 当前区块时间 + 20分钟
  const swapPath = [usdtAddress, syiAddress];

  const swapTx = await router.connect(wallet6).swapExactTokensForTokensSupportingFeeOnTransferTokens(
    buyAmount,
    0, // 接受任何数量（实际应该设置滑点保护）
    swapPath,
    wallet6.address,
    deadline
  );
  await swapTx.wait();
  console.log("✅ 买入交易完成");

  // 记录买入后的状态
  const usdtAfterBuy = await usdt.balanceOf(wallet6.address);
  const syiAfterBuy = await syi.balanceOf(wallet6.address);

  console.log("\n买入后:");
  console.log("- USDT 余额:", hre.ethers.formatEther(usdtAfterBuy), "USDT");
  console.log("- SYI 余额:", hre.ethers.formatEther(syiAfterBuy), "SYI");

  const usdtSpent = usdtBefore - usdtAfterBuy;
  const syiReceived = syiAfterBuy - syiBefore;

  console.log("\n买入统计:");
  console.log("- 花费 USDT:", hre.ethers.formatEther(usdtSpent), "USDT");
  console.log("- 获得 SYI:", hre.ethers.formatEther(syiReceived), "SYI");
  console.log("- 平均价格:", (Number(usdtSpent) / Number(syiReceived)).toFixed(9), "USDT/SYI");

  // ========================================
  // 3. 检查冷却时间并等待
  // ========================================
  const coldTime = await syi.coldTime();
  const waitTime = Number(coldTime) * 1000 + 2000; // 冷却时间 + 2秒缓冲

  console.log("\n[3/5] 等待冷却时间...");
  console.log("冷却时间:", Number(coldTime), "秒");
  console.log("实际等待:", waitTime / 1000, "秒");

  await new Promise(resolve => setTimeout(resolve, waitTime));
  console.log("✅ 等待完成");

  // ========================================
  // 4. 卖出所有 SYI
  // ========================================
  console.log("\n[4/5] 卖出所有 SYI...");
  const syiToSell = await syi.balanceOf(wallet6.address);
  console.log("准备卖出", hre.ethers.formatEther(syiToSell), "SYI");

  if (syiToSell === 0n) {
    console.log("⚠️  没有 SYI 可以卖出");
    return;
  }

  // 记录卖出前的状态
  const usdtBeforeSell = await usdt.balanceOf(wallet6.address);
  const syiBeforeSell = syiToSell;

  console.log("\n卖出前:");
  console.log("- USDT 余额:", hre.ethers.formatEther(usdtBeforeSell), "USDT");
  console.log("- SYI 余额:", hre.ethers.formatEther(syiBeforeSell), "SYI");

  // 授权 Router 使用 SYI
  console.log("\n授权 Router 使用 SYI...");
  const approveSyiTx = await syi.connect(wallet6).approve(routerAddress, syiToSell);
  await approveSyiTx.wait();
  console.log("✅ SYI 授权完成");

  // 卖出 SYI
  console.log("执行卖出交易...");
  const sellBlock = await hre.ethers.provider.getBlock("latest");
  const sellDeadline = sellBlock.timestamp + 60 * 20; // 当前区块时间 + 20分钟
  const swapSellPath = [syiAddress, usdtAddress];

  const sellTx = await router.connect(wallet6).swapExactTokensForTokensSupportingFeeOnTransferTokens(
    syiToSell,
    0, // 接受任何数量
    swapSellPath,
    wallet6.address,
    sellDeadline
  );
  await sellTx.wait();
  console.log("✅ 卖出交易完成");

  // 记录卖出后的状态
  const usdtAfterSell = await usdt.balanceOf(wallet6.address);
  const syiAfterSell = await syi.balanceOf(wallet6.address);

  console.log("\n卖出后:");
  console.log("- USDT 余额:", hre.ethers.formatEther(usdtAfterSell), "USDT");
  console.log("- SYI 余额:", hre.ethers.formatEther(syiAfterSell), "SYI");

  const syiSold = syiBeforeSell - syiAfterSell;
  const usdtReceived = usdtAfterSell - usdtBeforeSell;

  console.log("\n卖出统计:");
  console.log("- 卖出 SYI:", hre.ethers.formatEther(syiSold), "SYI");
  console.log("- 获得 USDT:", hre.ethers.formatEther(usdtReceived), "USDT");
  console.log("- 平均价格:", (Number(usdtReceived) / Number(syiSold)).toFixed(9), "USDT/SYI");

  // ========================================
  // 最终统计
  // ========================================
  console.log("\n==========================================");
  console.log("最终统计");
  console.log("==========================================\n");

  const finalUsdt = await usdt.balanceOf(wallet6.address);
  const finalSyi = await syi.balanceOf(wallet6.address);

  console.log("最终余额:");
  console.log("- USDT:", hre.ethers.formatEther(finalUsdt), "USDT");
  console.log("- SYI:", hre.ethers.formatEther(finalSyi), "SYI");

  const totalUsdtChange = finalUsdt - usdtBefore;
  console.log("\n总体损益:");
  console.log("- USDT 变化:", hre.ethers.formatEther(totalUsdtChange), "USDT");
  console.log("- 损失百分比:", ((Number(totalUsdtChange) / Number(buyAmount)) * 100).toFixed(4), "%");

  console.log("\n==========================================");
  console.log("✅ 测试完成！");
  console.log("==========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
