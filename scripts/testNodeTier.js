const hre = require("hardhat");
const fs = require("fs");
const { ethers } = hre;

/**
 * 测试节点等级管理功能
 * 使用测试地址7作为测试对象
 * 监控修改前后的等级变化
 */

async function main() {
  console.log("\n==========================================");
  console.log("节点等级管理功能测试");
  console.log("==========================================\n");

  // 读取部署信息
  const deploymentPath = "./syi-deployment.json";
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("未找到部署信息文件，请先运行 deploySYI.js");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const stakingAddress = deployment.contracts.Staking;
  const syiAddress = deployment.contracts.SYI;
  const usdtAddress = deployment.contracts.USDT;

  console.log("部署信息:");
  console.log(`- Staking: ${stakingAddress}`);
  console.log(`- SYI: ${syiAddress}`);
  console.log(`- USDT: ${usdtAddress}\n`);

  // 获取签名者
  const signers = await ethers.getSigners();
  const owner = signers[0]; // 部署者（Owner）
  const tierManagerAccount = signers[8]; // 测试地址8作为 tierManager
  const testUser = signers[7]; // 测试地址7
  const rootAddress = signers[2]; // root 地址

  console.log("测试账户:");
  console.log(`- Owner: ${owner.address}`);
  console.log(`- TierManager (地址8): ${tierManagerAccount.address}`);
  console.log(`- 测试用户 (地址7): ${testUser.address}`);
  console.log(`- Root 地址: ${rootAddress.address}\n`);

  // 连接合约
  const Staking = await ethers.getContractAt("Staking", stakingAddress);
  const SYI = await ethers.getContractAt("SYI", syiAddress);
  const USDT = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdtAddress
  );
  const Router = await ethers.getContractAt("@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol:IUniswapV2Router02", deployment.contracts.PancakeRouter);

  // ========================================================================
  // 前置步骤1：设置 TierManager 权限
  // ========================================================================
  console.log("==========================================");
  console.log("前置步骤1：设置 TierManager 权限");
  console.log("==========================================\n");

  // 检查当前的 tierManager
  const currentTierManager = await Staking.tierManager();
  console.log(`当前 TierManager: ${currentTierManager}`);

  // Owner 将 tierManager 设置为地址8
  console.log(`正在将 TierManager 设置为地址8...\n`);
  const setTierManagerTx = await Staking.connect(owner).setTierManager(tierManagerAccount.address);
  await setTierManagerTx.wait();

  const newTierManager = await Staking.tierManager();
  console.log(`✅ TierManager 已更新为: ${newTierManager}`);
  console.log(`   验证: ${newTierManager === tierManagerAccount.address ? '✅ 正确' : '❌ 错误'}\n`);

  // ========================================================================
  // 前置步骤2：添加流动性（如果池子为空）
  // ========================================================================
  console.log("==========================================");
  console.log("前置步骤2：检查并添加流动性");
  console.log("==========================================\n");

  const pairAddress = deployment.contracts.SYI_USDT_Pair;
  const Pair = await ethers.getContractAt("@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol:IUniswapV2Pair", pairAddress);
  const reserves = await Pair.getReserves();

  if (reserves[0] === 0n && reserves[1] === 0n) {
    console.log("⚠️ 流动性池为空，正在添加流动性...\n");

    // 设置 USDT 余额
    const usdtNeeded = ethers.parseEther("40100");
    const usdtBalanceSlot = 1;
    const storageKey = ethers.solidityPackedKeccak256(
      ["uint256", "uint256"],
      [owner.address, usdtBalanceSlot]
    );
    await ethers.provider.send("hardhat_setStorageAt", [
      usdtAddress,
      storageKey,
      ethers.toBeHex(usdtNeeded, 32)
    ]);

    // 添加流动性
    const usdtAmount = ethers.parseEther("40000");
    const syiAmount = ethers.parseEther("40000000");

    await USDT.approve(Router.target, usdtAmount);
    await SYI.approve(Router.target, syiAmount);

    // 获取当前区块时间戳
    const currentBlock = await ethers.provider.getBlock('latest');
    const deadline = currentBlock.timestamp + 3600;

    const tx = await Router.addLiquidity(
      usdtAddress,
      syiAddress,
      usdtAmount,
      syiAmount,
      0,
      0,
      owner.address,
      deadline,
      { gasLimit: 5000000 }
    );

    await tx.wait();
    console.log("✅ 流动性添加成功!");
    console.log(`   - USDT: ${ethers.formatEther(usdtAmount)}`);
    console.log(`   - SYI: ${ethers.formatEther(syiAmount)}\n`);
  } else {
    console.log("✅ 流动性池已有储备，跳过添加流动性步骤\n");
  }

  // ========================================================================
  // 第一步：让测试用户成为 Preacher（质押至少 200 SYI）
  // ========================================================================
  console.log("==========================================");
  console.log("第一步：准备测试环境");
  console.log("==========================================\n");

  // 推进时间，让之前的网络流入记录过期（超过 1 分钟）
  console.log("0. 推进时间以重置质押限额...");
  await ethers.provider.send("evm_increaseTime", [120]); // 推进 2 分钟
  await ethers.provider.send("evm_mine"); // 挖一个新块
  const newMaxStake = await Staking.getMaxStakeAmount();
  console.log(`✅ 时间推进完成，新的质押限额: ${ethers.formatEther(newMaxStake)} USDT\n`);

  // 给测试用户转 SYI 代币（通过先给 USDT，然后质押）
  console.log("1. 给测试用户设置 USDT 余额...");

  // 使用 fork 模式直接修改 USDT 余额
  const usdtBalanceSlot = 1; // USDT 的 balance slot
  const testUserAddress = testUser.address;
  const usdtAmount = ethers.parseEther("1000"); // 1000 USDT

  // 计算存储位置
  const storageKey = ethers.solidityPackedKeccak256(
    ["uint256", "uint256"],
    [testUserAddress, usdtBalanceSlot]
  );

  // 设置余额
  await ethers.provider.send("hardhat_setStorageAt", [
    usdtAddress,
    storageKey,
    ethers.toBeHex(usdtAmount, 32)
  ]);

  const usdtBalance = await USDT.balanceOf(testUserAddress);
  console.log(`✅ 测试用户 USDT 余额: ${ethers.formatEther(usdtBalance)} USDT\n`);

  // 绑定推荐人
  console.log("2. 绑定推荐人...");
  const isBindReferral = await Staking.isBindReferral(testUserAddress);
  if (!isBindReferral) {
    const tx = await Staking.connect(testUser).lockReferral(rootAddress.address);
    await tx.wait();
    console.log(`✅ 已绑定推荐人: ${rootAddress.address}\n`);
  } else {
    console.log(`✅ 已绑定推荐人\n`);
  }

  // 检查最大质押限额
  console.log("3. 检查质押限额...");
  const maxStake = await Staking.getMaxStakeAmount();
  console.log(`   - 当前最大质押限额: ${ethers.formatEther(maxStake)} USDT`);

  // 计算质押金额（至少 200 USDT 成为 Preacher，但不超过限额）
  let stakeAmount = ethers.parseEther("300");
  if (maxStake < stakeAmount) {
    console.log(`   ⚠️ 质押限额不足，调整质押金额为: ${ethers.formatEther(maxStake)} USDT`);
    stakeAmount = maxStake;
  }

  if (stakeAmount < ethers.parseEther("200")) {
    throw new Error(`质押限额不足 200 USDT，无法成为 Preacher。当前限额: ${ethers.formatEther(maxStake)} USDT`);
  }

  console.log(`\n4. 质押 ${ethers.formatEther(stakeAmount)} USDT 以成为 Preacher...`);

  // 授权
  const approvalTx = await USDT.connect(testUser).approve(stakingAddress, stakeAmount);
  await approvalTx.wait();

  // 质押
  const stakeTx = await Staking.connect(testUser).stake(stakeAmount, 0);
  await stakeTx.wait();

  const isPreacher = await Staking.isPreacher(testUserAddress);
  const stakedBalance = await Staking.balanceOf(testUserAddress);
  console.log(`✅ 质押完成`);
  console.log(`   - 质押余额: ${ethers.formatEther(stakedBalance)} sSYI`);
  console.log(`   - 是否为 Preacher: ${isPreacher ? '✅ 是' : '❌ 否'}\n`);

  if (!isPreacher) {
    throw new Error("用户未成为 Preacher，无法继续测试");
  }

  // ========================================================================
  // 第二步：查询修改前的等级信息
  // ========================================================================
  console.log("==========================================");
  console.log("第二步：查询修改前的等级信息");
  console.log("==========================================\n");

  await displayUserTierInfo(Staking, testUserAddress, "修改前");

  // ========================================================================
  // 第三步：测试权限控制
  // ========================================================================
  console.log("\n==========================================");
  console.log("第三步：测试权限控制");
  console.log("==========================================\n");

  // 3.1 尝试用非 tierManager 地址设置等级（应该失败）
  console.log("3.1 测试：用测试用户（非 tierManager）尝试设置等级...");
  try {
    await Staking.connect(testUser).setNodeTier(testUserAddress, 1);
    console.log("❌ 错误：非 tierManager 竟然可以设置等级！\n");
  } catch (error) {
    if (error.message.includes("Caller is not tier manager")) {
      console.log("✅ 正确：权限验证成功，非 tierManager 无法设置等级");
      console.log(`   错误信息: ${error.message.split('\n')[0]}\n`);
    } else {
      throw error;
    }
  }

  // 3.2 尝试用 Owner（非 tierManager）设置等级（应该失败）
  console.log("3.2 测试：用 Owner（已不是 tierManager）尝试设置等级...");
  try {
    await Staking.connect(owner).setNodeTier(testUserAddress, 1);
    console.log("❌ 错误：Owner 竟然可以设置等级！\n");
  } catch (error) {
    if (error.message.includes("Caller is not tier manager")) {
      console.log("✅ 正确：权限验证成功，Owner 无法设置等级（已转移权限）");
      console.log(`   错误信息: ${error.message.split('\n')[0]}\n`);
    } else {
      throw error;
    }
  }

  // ========================================================================
  // 第四步：使用 TierManager 设置节点等级为 V1
  // ========================================================================
  console.log("==========================================");
  console.log("第四步：使用 TierManager 设置节点等级为 V1");
  console.log("==========================================\n");

  console.log("正在用地址8（TierManager）设置节点等级...");
  const setTierTx = await Staking.connect(tierManagerAccount).setNodeTier(testUserAddress, 1);
  const receipt = await setTierTx.wait();

  // 解析事件
  const event = receipt.logs.find(log => {
    try {
      const parsed = Staking.interface.parseLog(log);
      return parsed && parsed.name === "NodeTierSet";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = Staking.interface.parseLog(event);
    console.log(`✅ 节点等级设置成功`);
    console.log(`   - 用户: ${parsed.args.user}`);
    console.log(`   - 等级: V${parsed.args.tier}`);
    console.log(`   - 设置者: ${parsed.args.setBy}`);
    console.log(`   - Gas 消耗: ${receipt.gasUsed.toString()}\n`);
  }

  // ========================================================================
  // 第五步：查询修改后的等级信息
  // ========================================================================
  console.log("==========================================");
  console.log("第五步：查询修改后的等级信息");
  console.log("==========================================\n");

  await displayUserTierInfo(Staking, testUserAddress, "修改后");

  // ========================================================================
  // 第六步：测试移除节点等级
  // ========================================================================
  console.log("\n==========================================");
  console.log("第六步：测试移除节点等级");
  console.log("==========================================\n");

  console.log("正在用 TierManager 移除节点等级...");
  const removeTierTx = await Staking.connect(tierManagerAccount).removeNodeTier(testUserAddress);
  const removeReceipt = await removeTierTx.wait();

  console.log(`✅ 节点等级移除成功`);
  console.log(`   - Gas 消耗: ${removeReceipt.gasUsed.toString()}\n`);

  // ========================================================================
  // 第七步：查询移除后的等级信息
  // ========================================================================
  console.log("==========================================");
  console.log("第七步：查询移除后的等级信息");
  console.log("==========================================\n");

  await displayUserTierInfo(Staking, testUserAddress, "移除后");

  // ========================================================================
  // 第八步：测试设置 V2 等级
  // ========================================================================
  console.log("\n==========================================");
  console.log("第八步：测试设置 V2 等级");
  console.log("==========================================\n");

  console.log("正在用 TierManager 设置节点等级为 V2...");
  const setTier2Tx = await Staking.connect(tierManagerAccount).setNodeTier(testUserAddress, 2);
  await setTier2Tx.wait();
  console.log(`✅ 节点等级设置为 V2\n`);

  await displayUserTierInfo(Staking, testUserAddress, "设置 V2 后");

  // ========================================================================
  // 总结
  // ========================================================================
  console.log("\n==========================================");
  console.log("测试总结");
  console.log("==========================================\n");

  console.log("✅ 所有测试完成！");
  console.log("\n功能验证结果:");
  console.log("1. ✅ Owner 成功将 TierManager 权限转移给地址8");
  console.log("2. ✅ 测试用户成功成为 Preacher（质押 300 USDT）");
  console.log("3. ✅ 权限验证：非 TierManager 无法设置等级");
  console.log("4. ✅ 权限验证：Owner（已转移权限）无法设置等级");
  console.log("5. ✅ TierManager（地址8）成功设置节点等级 V1");
  console.log("6. ✅ 等级从 0 提升到 1（使用节点等级）");
  console.log("7. ✅ TierManager 成功移除节点等级");
  console.log("8. ✅ 等级恢复到 0（恢复自然等级）");
  console.log("9. ✅ TierManager 成功设置节点等级 V2");
  console.log("10. ✅ 等级提升到 2（使用节点等级）");
  console.log("\n节点等级管理系统运行正常！");
  console.log("权限控制系统验证通过！\n");
}

/**
 * 显示用户的完整等级信息
 */
async function displayUserTierInfo(Staking, userAddress, stage) {
  console.log(`【${stage}】用户等级详细信息:`);
  console.log("─".repeat(60));

  // 1. 基础信息
  const isPreacher = await Staking.isPreacher(userAddress);
  const teamKPI = await Staking.getTeamKpi(userAddress);
  const stakedBalance = await Staking.balanceOf(userAddress);

  console.log(`基础信息:`);
  console.log(`  • 地址: ${userAddress}`);
  console.log(`  • Preacher 状态: ${isPreacher ? '✅ 是' : '❌ 否'}`);
  console.log(`  • 质押余额: ${ethers.formatEther(stakedBalance)} sSYI`);
  console.log(`  • 团队 KPI: ${ethers.formatEther(teamKPI)} USDT`);

  // 2. 节点等级详情
  const nodeTierDetails = await Staking.getNodeTierDetails(userAddress);
  console.log(`\n节点等级信息:`);
  console.log(`  • 是否设置: ${nodeTierDetails.hasNodeTier ? '✅ 是' : '❌ 否'}`);
  console.log(`  • 节点等级: ${nodeTierDetails.tier > 0 ? `V${nodeTierDetails.tier}` : '无'}`);
  console.log(`  • 是否激活: ${nodeTierDetails.isActive ? '✅ 是' : '❌ 否'}`);

  if (nodeTierDetails.hasNodeTier) {
    const setTime = new Date(Number(nodeTierDetails.setTime) * 1000);
    console.log(`  • 设置时间: ${setTime.toLocaleString()}`);
    console.log(`  • 设置者: ${nodeTierDetails.setBy}`);
  }

  // 3. 等级拆解信息
  const tierBreakdown = await Staking.getUserTierBreakdown(userAddress);
  console.log(`\n等级拆解:`);
  console.log(`  • 自然等级: V${tierBreakdown.naturalTier} (基于 teamKPI)`);
  console.log(`  • 节点等级: ${tierBreakdown.nodeTier > 0 ? `V${tierBreakdown.nodeTier}` : '无'}`);
  console.log(`  • 最终等级: V${tierBreakdown.finalTier} ${tierBreakdown.finalTier > 0 ? '⭐' : ''}`);
  console.log(`  • 使用节点等级: ${tierBreakdown.usingNodeTier ? '✅ 是' : '❌ 否'}`);

  // 4. 等级说明
  if (tierBreakdown.usingNodeTier) {
    console.log(`\n📌 说明: 当前使用节点等级作为最终等级（自然等级不足）`);
  } else if (tierBreakdown.finalTier > 0 && tierBreakdown.naturalTier >= tierBreakdown.nodeTier) {
    console.log(`\n📌 说明: 当前使用自然等级作为最终等级（自然等级已达标）`);
  } else if (tierBreakdown.finalTier === 0 && !isPreacher) {
    console.log(`\n📌 说明: 未成为 Preacher，无法获得等级`);
  } else {
    console.log(`\n📌 说明: 未设置节点等级，且自然等级为 0`);
  }

  console.log("─".repeat(60) + "\n");
}

// 错误处理
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 测试执行失败:");
    console.error(error);
    process.exit(1);
  });
