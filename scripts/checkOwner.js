const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    const deployment = require("../syi-deployment.json");
    const stakingAddress = deployment.contracts.Staking;

    const Staking = await ethers.getContractFactory("Staking");
    const staking = Staking.attach(stakingAddress);

    const owner = await staking.owner();
    console.log("Staking 合约的 owner:", owner);

    const accounts = await ethers.getSigners();
    console.log("\n账户列表:");
    for (let i = 0; i < 6; i++) {
        console.log(`  accounts[${i}]:`, accounts[i].address);
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
});
