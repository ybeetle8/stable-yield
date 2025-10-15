// scripts/sendEth.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners(); // 使用第一个 signer 发出转账
  const to = "0xA14AB5CEC3E43b39Ce9bD2172e98daaf95CD63eD";
  const amount = ethers.parseEther("888"); // 0.1 ETH

  const tx = await deployer.sendTransaction({
    to,
    value: amount
  });
  console.log("tx hash:", tx.hash);
  await tx.wait();
  console.log("sent", amount.toString(), "to", to);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
