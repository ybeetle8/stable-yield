const { ethers } = require("hardhat");

describe("Network Connection Test", function () {
    it("应该能连接到正确的网络", async function () {
        const provider = ethers.provider;
        
        // 检查网络配置
        const network = await provider.getNetwork();
        console.log(`🌐 连接的网络:`);
        console.log(`   Chain ID: ${network.chainId}`);
        console.log(`   Name: ${network.name}`);
        
        // 检查区块高度
        const blockNumber = await provider.getBlockNumber();
        console.log(`   当前区块号: ${blockNumber}`);
        
        // 检查部署者地址
        const [deployer] = await ethers.getSigners();
        console.log(`👤 部署者地址: ${deployer.address}`);
        
        const balance = await provider.getBalance(deployer.address);
        console.log(`   ETH 余额: ${ethers.formatEther(balance)}`);
        
        // 确保我们在正确的网络上
        if (network.chainId !== 31337n) {
            throw new Error(`错误的网络！期望 Chain ID 31337，实际 ${network.chainId}`);
        }
        
        // 确保区块高度大于0（说明有交易发生）
        if (blockNumber === 0) {
            console.log("⚠️  区块号为0，可能是全新的网络");
        } else {
            console.log(`✅ 网络状态正常，已有 ${blockNumber} 个区块`);
        }
    });

    it("应该能读取合约地址文件", async function () {
        let addresses;
        try {
            addresses = JSON.parse(require('fs').readFileSync('deployed-addresses.json', 'utf8'));
            console.log("✅ 成功读取合约地址文件");
            console.log("📋 合约地址列表:");
            
            for (const [name, address] of Object.entries(addresses)) {
                if (!name.startsWith('user') && name !== 'deployer') {
                    console.log(`   ${name}: ${address}`);
                }
            }
        } catch (error) {
            console.log("❌ 无法读取合约地址文件:", error.message);
            throw error;
        }
    });

    it("应该能检查合约部署状态", async function () {
        const addresses = JSON.parse(require('fs').readFileSync('deployed-addresses.json', 'utf8'));
        const provider = ethers.provider;
        
        console.log("🔍 检查关键合约的字节码...");
        
        // 检查USDT合约
        const usdtCode = await provider.getCode(addresses.usdt);
        console.log(`USDT (${addresses.usdt}): ${usdtCode === "0x" ? "❌ 无字节码" : "✅ 有字节码"}`);
        
        // 检查OLA合约  
        const olaCode = await provider.getCode(addresses.ola);
        console.log(`OLA (${addresses.ola}): ${olaCode === "0x" ? "❌ 无字节码" : "✅ 有字节码"}`);
        
        // 检查Staking合约
        const stakingCode = await provider.getCode(addresses.staking);
        console.log(`Staking (${addresses.staking}): ${stakingCode === "0x" ? "❌ 无字节码" : "✅ 有字节码"}`);
        
        // 如果都没有字节码，说明需要重新部署
        if (usdtCode === "0x" && olaCode === "0x" && stakingCode === "0x") {
            console.log("🔄 所有合约都没有字节码，需要重新部署！");
            throw new Error("合约未部署或网络状态不同步");
        }
    });
});