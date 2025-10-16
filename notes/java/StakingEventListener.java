package com.syi.staking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.web3j.abi.EventEncoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Event;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.request.EthFilter;
import org.web3j.protocol.core.methods.response.EthBlock;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.http.HttpService;
import org.web3j.tx.Contract;

import java.io.IOException;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;

/**
 * SYI Staking 合约事件监听器
 * 监听 BindReferral 事件
 *
 * 使用方式:
 * 1. 确保已启动本地节点: npx hardhat node --hostname 0.0.0.0 --port 8545
 * 2. 编译: mvn clean compile
 * 3. 运行: mvn exec:java -Dexec.mainClass="com.syi.staking.StakingEventListener"
 *
 * 或打包后运行:
 * mvn clean package
 * java -jar target/staking-event-listener-1.0.0-jar-with-dependencies.jar
 */
public class StakingEventListener {

    private static final Logger logger = LoggerFactory.getLogger(StakingEventListener.class);

    // 默认 RPC 地址
    private static final String DEFAULT_RPC_URL = "http://localhost:8545";

    // BindReferral 事件定义
    // event BindReferral(address indexed user, address indexed parent, uint256 indexed blockNumber);
    private static final Event BIND_REFERRAL_EVENT = new Event(
        "BindReferral",
        Arrays.asList(
            new TypeReference<Address>(true) {},  // user - indexed
            new TypeReference<Address>(true) {},  // parent - indexed
            new TypeReference<Uint256>(true) {}   // blockNumber - indexed
        )
    );

    private final Web3j web3j;
    private final DeploymentConfig config;
    private final String stakingAddress;

    public StakingEventListener(String rpcUrl, DeploymentConfig config) {
        this.web3j = Web3j.build(new HttpService(rpcUrl));
        this.config = config;
        this.stakingAddress = config.getStakingAddress();
    }

    /**
     * 启动事件监听
     */
    public void startListening() throws Exception {
        logger.info("\n" + "★".repeat(80));
        logger.info("🎯 SYI Staking 合约 BindReferral 事件监听器");
        logger.info("★".repeat(80) + "\n");

        // 获取网络信息
        String clientVersion = web3j.web3ClientVersion().send().getWeb3ClientVersion();
        BigInteger blockNumber = web3j.ethBlockNumber().send().getBlockNumber();

        logger.info("📍 Staking 合约地址: {}", stakingAddress);
        logger.info("📡 网络: {}", config.getNetwork() != null ? config.getNetwork() : "localhost");
        logger.info("🔗 客户端版本: {}", clientVersion);
        logger.info("📊 当前区块: {}\n", blockNumber);

        // 创建事件过滤器
        String eventSignature = EventEncoder.encode(BIND_REFERRAL_EVENT);
        EthFilter filter = new EthFilter(
            DefaultBlockParameterName.LATEST,
            DefaultBlockParameterName.LATEST,
            stakingAddress
        ).addSingleTopic(eventSignature);

        logger.info("🎧 开始监听 BindReferral 事件...\n");
        logger.info("提示: 执行 lockReferral() 操作以触发事件");
        logger.info("按 Ctrl+C 停止监听\n");

        // 查询历史事件 (最近 100 个区块)
        queryHistoricalEvents(blockNumber);

        Utils.printSeparator();
        logger.info("✅ 历史事件查询完成，继续监听新事件...");
        Utils.printSeparator();
        System.out.println();

        // 订阅新事件
        web3j.ethLogFlowable(filter).subscribe(
            log -> handleBindReferralEvent(log),
            error -> logger.error("❌ 事件监听错误: {}", error.getMessage())
        );

        // 保持程序运行
        CountDownLatch latch = new CountDownLatch(1);

        // 优雅退出
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            logger.info("\n\n👋 停止监听事件...");
            web3j.shutdown();
            latch.countDown();
        }));

        latch.await();
    }

    /**
     * 查询历史事件
     */
    private void queryHistoricalEvents(BigInteger currentBlock) throws IOException {
        BigInteger fromBlock = currentBlock.subtract(BigInteger.valueOf(100));
        if (fromBlock.compareTo(BigInteger.ZERO) < 0) {
            fromBlock = BigInteger.ZERO;
        }

        logger.info("\n🔍 查询历史事件 (区块 {} - {})...\n", fromBlock, currentBlock);

        String eventSignature = EventEncoder.encode(BIND_REFERRAL_EVENT);
        EthFilter historicalFilter = new EthFilter(
            org.web3j.protocol.core.DefaultBlockParameter.valueOf(fromBlock),
            org.web3j.protocol.core.DefaultBlockParameter.valueOf(currentBlock),
            stakingAddress
        ).addSingleTopic(eventSignature);

        List<Log> logs = web3j.ethGetLogs(historicalFilter).send().getLogs();

        if (logs.isEmpty()) {
            logger.info("未找到历史 BindReferral 事件\n");
        } else {
            logger.info("找到 {} 个 BindReferral 事件:\n", logs.size());
            for (org.web3j.protocol.core.methods.response.EthLog.LogResult logResult : logs) {
                if (logResult instanceof org.web3j.protocol.core.methods.response.EthLog.LogObject) {
                    Log log = ((org.web3j.protocol.core.methods.response.EthLog.LogObject) logResult).get();
                    handleBindReferralEvent(log);
                }
            }
        }
    }

    /**
     * 处理 BindReferral 事件
     */
    private void handleBindReferralEvent(Log log) {
        try {
            // 解析 indexed 参数
            List<String> topics = log.getTopics();

            if (topics.size() != 4) {
                logger.error("❌ 事件参数数量不匹配: expected 4, got {}", topics.size());
                return;
            }

            // topic[0] 是事件签名
            // topic[1] 是 user (indexed)
            // topic[2] 是 parent (indexed)
            // topic[3] 是 blockNumber (indexed)

            String user = "0x" + topics.get(1).substring(26);  // 去掉前面的填充零
            String parent = "0x" + topics.get(2).substring(26);
            BigInteger bindBlockNumber = new BigInteger(topics.get(3).substring(2), 16);

            // 打印事件信息
            System.out.println();
            Utils.printSeparator();
            System.out.println("🔗 事件: 绑定推荐人 (BindReferral)");
            Utils.printSeparator();
            System.out.println("用户地址:       " + user + " (" + Utils.formatAddress(user) + ")");
            System.out.println("推荐人:         " + parent + " (" + Utils.formatAddress(parent) + ")");
            System.out.println("绑定块高度:     #" + bindBlockNumber);
            System.out.println("链上块高度:     " + log.getBlockNumber());
            System.out.println("交易哈希:       " + log.getTransactionHash());
            Utils.printSeparator();

        } catch (Exception e) {
            logger.error("❌ 处理 BindReferral 事件时出错: {}", e.getMessage(), e);
        }
    }

    /**
     * 主函数
     */
    public static void main(String[] args) {
        try {
            // 从环境变量或参数获取 RPC URL
            String rpcUrl = System.getenv("RPC_URL");
            if (rpcUrl == null || rpcUrl.isEmpty()) {
                rpcUrl = args.length > 0 ? args[0] : DEFAULT_RPC_URL;
            }

            // 加载部署配置
            DeploymentConfig config;
            if (args.length > 1) {
                // 从命令行参数指定配置文件路径
                config = DeploymentConfig.load(args[1]);
            } else {
                // 使用默认路径
                config = DeploymentConfig.load();
            }

            logger.info("✅ 配置加载成功: {}", config);

            // 创建监听器并启动
            StakingEventListener listener = new StakingEventListener(rpcUrl, config);
            listener.startListening();

        } catch (IOException e) {
            logger.error("\n❌ 配置文件读取失败: {}", e.getMessage());
            logger.info("\n提示: 请确保 syi-deployment.json 文件存在");
            logger.info("默认路径: <项目根目录>/syi-deployment.json\n");
            System.exit(1);
        } catch (Exception e) {
            logger.error("\n❌ 程序异常: {}", e.getMessage(), e);
            if (e.getMessage() != null && e.getMessage().contains("Connection refused")) {
                logger.info("\n提示: 请确保本地节点正在运行");
                logger.info("启动命令: npx hardhat node --hostname 0.0.0.0 --port 8545\n");
            }
            System.exit(1);
        }
    }
}
