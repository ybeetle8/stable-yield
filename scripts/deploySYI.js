const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n==========================================");
  console.log("开始部署完整的 SYI 系统");
  console.log("==========================================\n");

  const [deployer, marketingWallet, rootWallet] = await hre.ethers.getSigners();

  console.log("部署账户:", deployer.address);
  console.log("营销钱包:", marketingWallet.address);
  console.log("Root 钱包:", rootWallet.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("账户余额:", hre.ethers.formatEther(balance), "ETH\n");

  // ========================================
  // 1. 使用 BSC 主网合约地址
  // ========================================
  console.log("[1/4] 使用 BSC 主网合约...");
  const usdtAddress = "0x55d398326f99059fF775485246999027B3197955"; // BSC USDT
  const wbnbAddress = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // BSC WBNB
  const factoryAddress = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"; // PancakeSwap Factory
  const routerAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E"; // PancakeSwap Router
  console.log("✅ USDT:", usdtAddress);
  console.log("✅ WBNB:", wbnbAddress);
  console.log("✅ Factory:", factoryAddress);
  console.log("✅ Router:", routerAddress);

  const factory = await hre.ethers.getContractAt("contracts/SYI/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory", factoryAddress);

  // 等待几个区块确保部署完成
  console.log("\n等待区块确认...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ========================================
  // 2. 部署 Staking 合约
  // ========================================
  console.log("\n[2/4] 部署 Staking 合约...");
  const Staking = await hre.ethers.getContractFactory("contracts/SYI-Staking/mainnet/Staking.sol:Staking");
  const staking = await Staking.deploy(
    usdtAddress,
    routerAddress,
    rootWallet.address,      // rootAddress - 推荐系统根节点
    marketingWallet.address  // feeRecipient - 手续费接收地址
  );
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("✅ Staking 部署成功:", stakingAddress);

  // ========================================
  // 3. 部署 SYI 代币
  // ========================================
  console.log("\n[3/4] 部署 SYI 代币合约...");

  // 部署 SYI（无需 FundRelay）
  console.log("  - 部署 SYI 代币...");
  const SYI = await hre.ethers.getContractFactory("contracts/SYI/mainnet/SYI.sol:SYI");
  const syi = await SYI.deploy(
    usdtAddress,
    routerAddress,
    stakingAddress
  );
  await syi.waitForDeployment();
  const syiAddress = await syi.getAddress();
  console.log("  ✅ SYI 代币部署成功:", syiAddress);

  // ========================================
  // 4. 配置阶段
  // ========================================
  console.log("\n==========================================");
  console.log("开始配置合约关联关系");
  console.log("==========================================\n");

  // 1. 初始化 SYI 白名单
  console.log("[1/5] 初始化 SYI 白名单...");
  const initWhitelistTx = await syi.initializeWhitelist();
  await initWhitelistTx.wait();
  console.log("✅ 白名单初始化完成");

  // 2. 配置 Staking 的 SYI 地址
  console.log("\n[2/3] 配置 Staking.setSYI()...");
  const setSYITx = await staking.setSYI(syiAddress);
  await setSYITx.wait();
  console.log("✅ Staking 配置完成");

  // 3. 创建并设置交易对
  console.log("\n[3/3] 创建 SYI/USDT 交易对...");
  const createPairTx = await factory.createPair(syiAddress, usdtAddress);
  await createPairTx.wait();
  const pairAddress = await factory.getPair(syiAddress, usdtAddress);
  console.log("✅ 交易对创建成功:", pairAddress);

  console.log("设置 SYI.setPair()...");
  const setPairTx = await syi.setPair(pairAddress);
  await setPairTx.wait();
  console.log("✅ Pair 地址设置完成");

  // ========================================
  // 验证部署信息
  // ========================================
  console.log("\n==========================================");
  console.log("验证部署信息");
  console.log("==========================================\n");

  const name = await syi.name();
  const symbol = await syi.symbol();
  const decimals = await syi.decimals();
  const totalSupply = await syi.totalSupply();
  const ownerBalance = await syi.balanceOf(deployer.address);

  console.log("SYI 代币信息:");
  console.log("- 名称:", name);
  console.log("- 符号:", symbol);
  console.log("- 精度:", decimals.toString());
  console.log("- 总供应量:", hre.ethers.formatEther(totalSupply), symbol);
  console.log("- Owner 余额:", hre.ethers.formatEther(ownerBalance), symbol);

  const presaleActive = await syi.presaleActive();
  const delayedBuyEnabled = await syi.delayedBuyEnabled();
  console.log("\nSYI 配置:");
  console.log("- 预售激活:", presaleActive);
  console.log("- 延迟购买:", delayedBuyEnabled);

  // ========================================
  // 保存部署信息
  // ========================================
  const deployment = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    marketingWallet: marketingWallet.address,
    rootWallet: rootWallet.address,
    contracts: {
      SYI: syiAddress,
      Staking: stakingAddress,
      USDT: usdtAddress,
      WBNB: wbnbAddress,
      PancakeFactory: factoryAddress,
      PancakeRouter: routerAddress,
      SYI_USDT_Pair: pairAddress
    },
    tokenInfo: {
      name,
      symbol,
      decimals: decimals.toString(),
      totalSupply: totalSupply.toString(),
      ownerBalance: ownerBalance.toString()
    },
    configuration: {
      presaleActive,
      delayedBuyEnabled,
      coldTime: (await syi.coldTime()).toString()
    },
    taxRates: {
      buyTax: "0%",
      buyBurn: "0%",
      sellTax: "0%",
      sellMarketing: "0%",
      profitTax: "0%",
      note: "完全移除所有交易税，买卖无任何费用"
    }
  };

  const outputPath = path.join(__dirname, "..", "syi-deployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
  console.log("\n✅ 部署信息已保存到:", outputPath);

  // ========================================
  // 5. 后续配置：转账和添加流动性
  // ========================================
  console.log("\n==========================================");
  console.log("执行后续配置");
  console.log("==========================================\n");

  // 获取测试钱包9
  const signers = await hre.ethers.getSigners();
  const wallet9 = signers[9];
  console.log("测试钱包9地址:", wallet9.address);

  // 1. 转移 1500万 SYI 到 Staking 合约
  console.log("\n[1/4] 转移 15,000,000 SYI 到 Staking 合约作为储备...");
  const stakingReserve = hre.ethers.parseEther("15000000");
  const transferToStakingTx = await syi.transfer(stakingAddress, stakingReserve);
  await transferToStakingTx.wait();
  console.log("✅ 已转移 15,000,000 SYI 到 Staking");

  // 2. 检查 USDT 余额，必要时直接设置余额（fork模式）
  console.log("\n[2/4] 检查 USDT 余额并准备流动性...");
  const usdt = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdtAddress);
  const router = await hre.ethers.getContractAt("contracts/SYI/interfaces/IUniswapV2Router02.sol:IUniswapV2Router02", routerAddress);

  let usdtBalance = await usdt.balanceOf(deployer.address);
  console.log("当前 USDT 余额:", hre.ethers.formatEther(usdtBalance));

  const requiredUsdt = hre.ethers.parseEther("40100");

  if (usdtBalance < requiredUsdt) {
    console.log("USDT 不足，直接设置余额（fork模式）...");
    console.log("需要:", hre.ethers.formatEther(requiredUsdt), "USDT");

    // Bruteforce查找USDT的balance mapping slot
    console.log("正在查找 USDT balance storage slot...");
    let found = false;
    let balanceSlot = -1;

    for (let slot = 0; slot < 10 && !found; slot++) {
      // 计算 deployer 地址在 mapping 中的 slot 位置
      const paddedAddress = hre.ethers.zeroPadValue(deployer.address, 32);
      const paddedSlot = hre.ethers.zeroPadValue(hre.ethers.toBeHex(slot), 32);
      const index = hre.ethers.keccak256(hre.ethers.concat([paddedAddress, paddedSlot]));

      // 将余额转换为 32 字节的十六进制
      const value = hre.ethers.zeroPadValue(hre.ethers.toBeHex(requiredUsdt), 32);

      // 设置 storage
      await hre.network.provider.send("hardhat_setStorageAt", [
        usdtAddress,
        index,
        value
      ]);

      // 检查余额是否改变
      const newBalance = await usdt.balanceOf(deployer.address);
      if (newBalance === requiredUsdt) {
        found = true;
        balanceSlot = slot;
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

  // 3. 添加流动性：40000 USDT + 40000000 SYI
  console.log("\n[3/4] 添加流动性...");
  const liquidityUsdt = hre.ethers.parseEther("40000");
  const liquiditySyi = hre.ethers.parseEther("40000000");

  console.log("准备添加流动性:");
  console.log("- USDT:", hre.ethers.formatEther(liquidityUsdt));
  console.log("- SYI:", hre.ethers.formatEther(liquiditySyi));

  // 授权 Router
  console.log("授权 USDT...");
  const approveUsdtTx = await usdt.approve(routerAddress, liquidityUsdt);
  await approveUsdtTx.wait();

  console.log("授权 SYI...");
  const approveSyiTx = await syi.approve(routerAddress, liquiditySyi);
  await approveSyiTx.wait();

  // 添加流动性
  console.log("添加流动性到池子...");
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  const addLiquidityTx = await router.addLiquidity(
    syiAddress,
    usdtAddress,
    liquiditySyi,
    liquidityUsdt,
    liquiditySyi * 95n / 100n, // 允许5%滑点
    liquidityUsdt * 95n / 100n,
    deployer.address,
    deadline
  );
  await addLiquidityTx.wait();
  console.log("✅ 流动性添加成功");

  // 4. 转移剩余 SYI 到测试钱包9
  console.log("\n[4/4] 转移剩余 SYI 到测试钱包9...");
  const remainingSyi = await syi.balanceOf(deployer.address);
  console.log("剩余 SYI:", hre.ethers.formatEther(remainingSyi));

  if (remainingSyi > 0n) {
    const transferToWallet9Tx = await syi.transfer(wallet9.address, remainingSyi);
    await transferToWallet9Tx.wait();
    console.log("✅ 已转移", hre.ethers.formatEther(remainingSyi), "SYI 到钱包9");
  }

  // ========================================
  // 打印最终状态
  // ========================================
  console.log("\n==========================================");
  console.log("最终状态统计");
  console.log("==========================================\n");

  // Staking 合约上的 SYI 数量
  const stakingSyiBalance = await syi.balanceOf(stakingAddress);
  console.log("Staking 合约 SYI 余额:", hre.ethers.formatEther(stakingSyiBalance), "SYI");

  // 流动池余额和价格
  const pair = await hre.ethers.getContractAt("contracts/SYI/interfaces/IUniswapV2Pair.sol:IUniswapV2Pair", pairAddress);
  const reserves = await pair.getReserves();
  const token0 = await pair.token0();

  let syiReserve, usdtReserve;
  if (token0.toLowerCase() === syiAddress.toLowerCase()) {
    syiReserve = reserves[0];
    usdtReserve = reserves[1];
  } else {
    syiReserve = reserves[1];
    usdtReserve = reserves[0];
  }

  console.log("\n流动池状态:");
  console.log("- USDT 储备:", hre.ethers.formatEther(usdtReserve), "USDT");
  console.log("- SYI 储备:", hre.ethers.formatEther(syiReserve), "SYI");

  // 计算价格 (USDT per SYI)
  const price = Number(usdtReserve) / Number(syiReserve);
  console.log("- SYI 价格:", price.toFixed(9), "USDT/SYI");

  // 钱包9余额
  const wallet9Balance = await syi.balanceOf(wallet9.address);
  console.log("\n钱包9 SYI 余额:", hre.ethers.formatEther(wallet9Balance), "SYI");

  console.log("\n==========================================");
  console.log("✅ SYI 系统部署完成！");
  console.log("==========================================");
  console.log("\n合约地址总结:");
  console.log("- SYI 代币:", syiAddress);
  console.log("- Staking:", stakingAddress);
  console.log("- USDT:", usdtAddress);
  console.log("- Router:", routerAddress);
  console.log("- Factory:", factoryAddress);
  console.log("- Pair:", pairAddress);
  console.log("\n税费结构:");
  console.log("- 买入税: 0% (完全无税)");
  console.log("- 卖出税: 0% (完全无税)");
  console.log("- 盈利税: 0% (完全无税)");
  console.log("- 说明: 已移除所有交易税机制，买卖无任何费用");
  console.log("\n下一步:");
  console.log("1. 运行测试脚本: npx hardhat run scripts/testSYI.js --network localhost");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
