// scripts/sendBnbUsdt.js
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners(); // 使用第一个 signer 发出转账
  const to = "0xa238253d15bBA0CB25B1E7E4d043673edeF60222"; // 改成你自已的钱包

  // BSC 主网 USDT 地址
  const usdtAddress = "0x55d398326f99059fF775485246999027B3197955";

  // 1. 发送 100 ETH (BNB)
  console.log("\n[1/2] 发送 100 BNB...");
  const bnbAmount = hre.ethers.parseEther("100");
  const bnbTx = await deployer.sendTransaction({
    to,
    value: bnbAmount
  });
  console.log("BNB tx hash:", bnbTx.hash);
  await bnbTx.wait();
  console.log("✅ 已发送", hre.ethers.formatEther(bnbAmount), "BNB 到", to);

  // 2. 发送 10000 USDT
  console.log("\n[2/2] 发送 10000 USDT...");
  const usdt = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdtAddress);
  const usdtAmount = hre.ethers.parseEther("10000");

  // 检查 USDT 余额，不足时设置余额（fork模式）
  let usdtBalance = await usdt.balanceOf(deployer.address);
  console.log("当前 USDT 余额:", hre.ethers.formatEther(usdtBalance));

  if (usdtBalance < usdtAmount) {
    console.log("USDT 不足，直接设置余额（fork模式）...");
    console.log("需要:", hre.ethers.formatEther(usdtAmount), "USDT");

    // Bruteforce查找USDT的balance mapping slot
    console.log("正在查找 USDT balance storage slot...");
    let found = false;

    for (let slot = 0; slot < 10 && !found; slot++) {
      // 计算 deployer 地址在 mapping 中的 slot 位置
      const paddedAddress = hre.ethers.zeroPadValue(deployer.address, 32);
      const paddedSlot = hre.ethers.zeroPadValue(hre.ethers.toBeHex(slot), 32);
      const index = hre.ethers.keccak256(hre.ethers.concat([paddedAddress, paddedSlot]));

      // 将余额转换为 32 字节的十六进制
      const value = hre.ethers.zeroPadValue(hre.ethers.toBeHex(usdtAmount), 32);

      // 设置 storage
      await hre.network.provider.send("hardhat_setStorageAt", [
        usdtAddress,
        index,
        value
      ]);

      // 检查余额是否改变
      const newBalance = await usdt.balanceOf(deployer.address);
      if (newBalance === usdtAmount) {
        found = true;
        console.log(`✅ 找到 balance slot: ${slot}`);
        break;
      }
    }

    if (!found) {
      throw new Error("无法找到 USDT balance storage slot");
    }

    usdtBalance = await usdt.balanceOf(deployer.address);
    console.log("✅ 余额设置完成，新 USDT 余额:", hre.ethers.formatEther(usdtBalance));
  }

  // 转账 USDT
  const usdtTx = await usdt.transfer(to, usdtAmount);
  console.log("USDT tx hash:", usdtTx.hash);
  await usdtTx.wait();
  console.log("✅ 已发送", hre.ethers.formatEther(usdtAmount), "USDT 到", to);

  console.log("\n==========================================");
  console.log("✅ 转账完成");
  console.log("==========================================");
  console.log("接收地址:", to);
  console.log("- BNB:", hre.ethers.formatEther(bnbAmount));
  console.log("- USDT:", hre.ethers.formatEther(usdtAmount));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
