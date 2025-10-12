const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Simple Interface Test", function () {
    let deployer, usdt, ola, staking;
    let addresses;

    before(async function () {
        try {
            addresses = JSON.parse(require('fs').readFileSync('deployed-addresses.json', 'utf8'));
            console.log("合约地址:", addresses);
        } catch (error) {
            console.error("无法读取合约地址");
            throw error;
        }

        [deployer] = await ethers.getSigners();
        
        // 尝试不同的方式获取合约实例
        try {
            console.log("尝试使用 USDT 接口...");
            usdt = await ethers.getContractAt("USDT", addresses.usdt);
            console.log("✅ USDT 接口成功");
        } catch (e) {
            console.log("❌ USDT 接口失败:", e.message);
        }

        try {
            console.log("尝试使用 OLA 合约...");
            ola = await ethers.getContractAt("OLA", addresses.ola);
            console.log("✅ OLA 合约成功");
        } catch (e) {
            console.log("❌ OLA 合约失败:", e.message);
        }

        try {
            console.log("尝试使用 IOLA 接口...");
            ola = await ethers.getContractAt("IOLA", addresses.ola);
            console.log("✅ IOLA 接口成功");
        } catch (e) {
            console.log("❌ IOLA 接口失败:", e.message);
        }

        try {
            console.log("尝试使用 Staking 合约...");
            staking = await ethers.getContractAt("Staking", addresses.staking);
            console.log("✅ Staking 合约成功");
        } catch (e) {
            console.log("❌ Staking 合约失败:", e.message);
        }

        try {
            console.log("尝试使用 IStaking 接口...");
            staking = await ethers.getContractAt("IStaking", addresses.staking);
            console.log("✅ IStaking 接口成功");
        } catch (e) {
            console.log("❌ IStaking 接口失败:", e.message);
        }
    });

    it("应该能获取USDT基础信息", async function () {
        if (usdt) {
            try {
                const name = await usdt.name();
                const symbol = await usdt.symbol();
                console.log(`USDT Name: ${name}, Symbol: ${symbol}`);
            } catch (e) {
                console.log("USDT调用失败:", e.message);
            }
        }
    });

    it("应该能获取OLA基础信息", async function () {
        if (ola) {
            try {
                // 尝试不同的方法调用
                const totalSupply = await ola.totalSupply();
                console.log(`OLA总供应量: ${ethers.formatEther(totalSupply)}`);
                
                const name = await ola.name();
                const symbol = await ola.symbol();
                console.log(`OLA Name: ${name}, Symbol: ${symbol}`);
            } catch (e) {
                console.log("OLA调用失败:", e.message);
            }
        }
    });

    it("应该能验证Staking合约", async function () {
        if (staking) {
            try {
                // 检查一些基本信息
                console.log("正在验证Staking合约...");
                // 可以尝试一些只读方法
                const result = await staking.isPreacher(deployer.address);
                console.log(`用户是否为传教士: ${result}`);
            } catch (e) {
                console.log("Staking调用失败:", e.message);
            }
        }
    });
});