const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Direct Contract Test", function () {
    let deployer, usdt, ola, staking;
    let addresses;

    before(async function () {
        try {
            addresses = JSON.parse(require('fs').readFileSync('deployed-addresses.json', 'utf8'));
            console.log("✅ 合约地址加载成功");
        } catch (error) {
            console.error("❌ 无法读取合约地址");
            throw error;
        }

        [deployer] = await ethers.getSigners();
        
        // 使用实际的合约名称而不是接口
        console.log("🔧 正在连接合约...");
        
        try {
            console.log("连接 USDT 合约...");
            usdt = await ethers.getContractAt("USDT", addresses.usdt);
            console.log("✅ USDT 合约连接成功");
        } catch (e) {
            console.log("❌ USDT 连接失败:", e.message);
        }

        try {
            console.log("连接 OLA 合约...");
            ola = await ethers.getContractAt("OLA", addresses.ola);
            console.log("✅ OLA 合约连接成功");
        } catch (e) {
            console.log("❌ OLA 连接失败:", e.message);
        }

        try {
            console.log("连接 Staking 合约...");
            staking = await ethers.getContractAt("Staking", addresses.staking);
            console.log("✅ Staking 合约连接成功");
        } catch (e) {
            console.log("❌ Staking 连接失败:", e.message);
        }
    });

    it("应该能直接调用 USDT 方法", async function () {
        if (usdt) {
            try {
                console.log("📞 调用 USDT.name()...");
                const name = await usdt.name();
                console.log(`✅ USDT Name: ${name}`);
                
                const symbol = await usdt.symbol();
                console.log(`✅ USDT Symbol: ${symbol}`);
                
                const totalSupply = await usdt.totalSupply();
                console.log(`✅ USDT Total Supply: ${ethers.formatEther(totalSupply)}`);
                
                expect(name).to.equal("Tether USD");
                expect(symbol).to.equal("USDT");
            } catch (e) {
                console.log("❌ USDT调用失败:", e.message);
                throw e;
            }
        } else {
            throw new Error("USDT 合约未连接");
        }
    });

    it("应该能直接调用 OLA 方法", async function () {
        if (ola) {
            try {
                console.log("📞 调用 OLA.name()...");
                const name = await ola.name();
                console.log(`✅ OLA Name: ${name}`);
                
                const symbol = await ola.symbol();
                console.log(`✅ OLA Symbol: ${symbol}`);
                
                const totalSupply = await ola.totalSupply();
                console.log(`✅ OLA Total Supply: ${ethers.formatEther(totalSupply)}`);
                
                expect(name).to.equal("OLA Token");
                expect(symbol).to.equal("OLA");
            } catch (e) {
                console.log("❌ OLA调用失败:", e.message);
                throw e;
            }
        } else {
            throw new Error("OLA 合约未连接");
        }
    });

    it("应该能直接调用 Staking 方法", async function () {
        if (staking) {
            try {
                console.log("📞 调用 Staking 方法...");
                
                // 尝试一些基本的view函数
                const maxStakeAmount = await staking.maxStakeAmount();
                console.log(`✅ Max Stake Amount: ${ethers.formatEther(maxStakeAmount)}`);
                
                const isPreacher = await staking.isPreacher(deployer.address);
                console.log(`✅ Is Preacher: ${isPreacher}`);
                
                // 检查用户信息
                const userInfo = await staking.getUserInfo(deployer.address);
                console.log(`✅ User Info: totalStaked=${ethers.formatEther(userInfo.totalStaked)}, teamKPI=${ethers.formatEther(userInfo.teamKPI)}`);
                
                expect(maxStakeAmount).to.be.gt(0);
            } catch (e) {
                console.log("❌ Staking调用失败:", e.message);
                throw e;
            }
        } else {
            throw new Error("Staking 合约未连接");
        }
    });

    it("应该能测试合约交互", async function () {
        console.log("🔄 测试合约间交互...");
        
        if (usdt && ola && staking) {
            try {
                // 检查余额
                const deployerUSDTBalance = await usdt.balanceOf(deployer.address);
                console.log(`✅ Deployer USDT Balance: ${ethers.formatEther(deployerUSDTBalance)}`);
                
                const deployerOLABalance = await ola.balanceOf(deployer.address);
                console.log(`✅ Deployer OLA Balance: ${ethers.formatEther(deployerOLABalance)}`);
                
                // 验证余额大于0
                expect(deployerUSDTBalance).to.be.gt(0);
                expect(deployerOLABalance).to.be.gt(0);
            } catch (e) {
                console.log("❌ 合约交互测试失败:", e.message);
                throw e;
            }
        } else {
            throw new Error("某些合约未连接");
        }
    });
});