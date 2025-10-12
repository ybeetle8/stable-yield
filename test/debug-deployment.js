const { ethers } = require("hardhat");

describe("Debug Deployment", function () {
    let addresses;

    before(async function () {
        addresses = JSON.parse(require('fs').readFileSync('deployed-addresses.json', 'utf8'));
        console.log("合约地址:", addresses);
    });

    it("应该检查地址上的字节码", async function () {
        const provider = ethers.provider;
        
        console.log("\n🔍 检查合约字节码...");
        
        // 检查每个合约地址
        for (const [name, address] of Object.entries(addresses)) {
            if (name.startsWith('user') || name === 'deployer') continue;
            
            console.log(`\n检查 ${name} (${address}):`);
            
            try {
                const code = await provider.getCode(address);
                if (code === "0x") {
                    console.log(`❌ ${name}: 没有字节码`);
                } else {
                    console.log(`✅ ${name}: 有字节码 (${code.length} 字符)`);
                }
                
                // 检查余额
                const balance = await provider.getBalance(address);
                console.log(`   ETH 余额: ${ethers.formatEther(balance)}`);
                
            } catch (e) {
                console.log(`❌ ${name}: 检查失败 - ${e.message}`);
            }
        }
    });

    it("应该检查部署者余额", async function () {
        const provider = ethers.provider;
        const [deployer] = await ethers.getSigners();
        
        console.log(`\n💰 部署者地址: ${deployer.address}`);
        const balance = await provider.getBalance(deployer.address);
        console.log(`   ETH 余额: ${ethers.formatEther(balance)}`);
    });

    it("应该检查网络状态", async function () {
        const provider = ethers.provider;
        
        const network = await provider.getNetwork();
        console.log(`\n🌐 网络信息:`);
        console.log(`   Chain ID: ${network.chainId}`);
        console.log(`   Name: ${network.name}`);
        
        const blockNumber = await provider.getBlockNumber();
        console.log(`   最新区块号: ${blockNumber}`);
        
        if (blockNumber > 0) {
            const latestBlock = await provider.getBlock(blockNumber);
            console.log(`   最新区块时间: ${new Date(latestBlock.timestamp * 1000)}`);
        }
    });
});