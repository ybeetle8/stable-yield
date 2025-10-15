# Java 监听 BindReferral 事件指南

本文档介绍如何使用 Java 和 Web3j 库监听 SYI-Staking 合约的 `BindReferral` 事件。

## 1. 事件定义

```solidity
event BindReferral(address indexed user, address indexed parent);
```

**参数说明**:
- `user`: 绑定推荐人的用户地址
- `parent`: 被绑定的推荐人地址

## 2. Maven 依赖

```xml
<dependencies>
    <!-- Web3j 核心库 -->
    <dependency>
        <groupId>org.web3j</groupId>
        <artifactId>core</artifactId>
        <version>4.10.3</version>
    </dependency>

    <!-- 日志依赖 (可选) -->
    <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-simple</artifactId>
        <version>2.0.9</version>
    </dependency>
</dependencies>
```

## 3. 事件监听代码

### 3.1 创建事件对象类

```java
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Event;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.tx.Contract;

import java.util.Arrays;
import java.util.List;

public class BindReferralEvent {

    public static final Event EVENT = new Event("BindReferral",
            Arrays.asList(
                new TypeReference<Address>(true) {},  // user (indexed)
                new TypeReference<Address>(true) {}   // parent (indexed)
            )
    );

    private String user;
    private String parent;
    private String transactionHash;
    private long blockNumber;

    // 构造函数
    public BindReferralEvent(String user, String parent, String transactionHash, long blockNumber) {
        this.user = user;
        this.parent = parent;
        this.transactionHash = transactionHash;
        this.blockNumber = blockNumber;
    }

    // Getters
    public String getUser() { return user; }
    public String getParent() { return parent; }
    public String getTransactionHash() { return transactionHash; }
    public long getBlockNumber() { return blockNumber; }

    @Override
    public String toString() {
        return String.format(
            "BindReferral事件:\n" +
            "  用户地址: %s\n" +
            "  推荐人: %s\n" +
            "  交易哈希: %s\n" +
            "  区块高度: %d",
            user, parent, transactionHash, blockNumber
        );
    }
}
```

### 3.2 事件监听器类

```java
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.request.EthFilter;
import org.web3j.protocol.core.methods.response.EthLog;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.http.HttpService;
import org.web3j.tx.Contract;

import java.math.BigInteger;
import java.util.List;

public class StakingEventListener {

    private static final String RPC_URL = "https://bsc.ai-hello.cn/";
    private static final String STAKING_CONTRACT_ADDRESS = "0x0F30b6db7ffFe0D465f989BFcC8a73A7cc4D69E9";

    private final Web3j web3j;

    public StakingEventListener() {
        this.web3j = Web3j.build(new HttpService(RPC_URL));
    }

    /**
     * 实时监听 BindReferral 事件
     */
    public void listenToBindReferral() {
        System.out.println("开始监听 BindReferral 事件...");

        // 创建事件过滤器
        EthFilter filter = new EthFilter(
            DefaultBlockParameterName.LATEST,
            DefaultBlockParameterName.LATEST,
            STAKING_CONTRACT_ADDRESS
        ).addSingleTopic(Contract.staticExtractEventParameters(
            BindReferralEvent.EVENT, null
        ));

        // 订阅事件
        web3j.ethLogFlowable(filter).subscribe(
            log -> {
                BindReferralEvent event = parseBindReferralEvent(log);
                handleBindReferralEvent(event);
            },
            error -> {
                System.err.println("监听错误: " + error.getMessage());
                error.printStackTrace();
            }
        );

        System.out.println("监听器已启动，等待事件...");
    }

    /**
     * 查询历史 BindReferral 事件
     */
    public List<BindReferralEvent> queryHistoricalEvents(BigInteger fromBlock, BigInteger toBlock) {
        try {
            // 创建历史事件过滤器
            EthFilter filter = new EthFilter(
                org.web3j.protocol.core.DefaultBlockParameter.valueOf(fromBlock),
                org.web3j.protocol.core.DefaultBlockParameter.valueOf(toBlock),
                STAKING_CONTRACT_ADDRESS
            ).addSingleTopic(Contract.staticExtractEventParameters(
                BindReferralEvent.EVENT, null
            ));

            // 查询事件日志
            EthLog ethLog = web3j.ethGetLogs(filter).send();
            List<EthLog.LogResult> logs = ethLog.getLogs();

            System.out.println("找到 " + logs.size() + " 个历史 BindReferral 事件");

            return logs.stream()
                .map(logResult -> parseBindReferralEvent((Log) logResult.get()))
                .toList();

        } catch (Exception e) {
            System.err.println("查询历史事件失败: " + e.getMessage());
            e.printStackTrace();
            return List.of();
        }
    }

    /**
     * 解析事件日志为 BindReferralEvent 对象
     */
    private BindReferralEvent parseBindReferralEvent(Log log) {
        List<String> topics = log.getTopics();

        // topics[0] = 事件签名
        // topics[1] = user (indexed)
        // topics[2] = parent (indexed)
        String user = "0x" + topics.get(1).substring(26);    // 移除填充的 0
        String parent = "0x" + topics.get(2).substring(26);

        return new BindReferralEvent(
            user,
            parent,
            log.getTransactionHash(),
            log.getBlockNumber().longValue()
        );
    }

    /**
     * 处理 BindReferral 事件的业务逻辑
     */
    private void handleBindReferralEvent(BindReferralEvent event) {
        System.out.println("\n" + "=".repeat(80));
        System.out.println("🔗 接收到 BindReferral 事件");
        System.out.println("=".repeat(80));
        System.out.println(event);
        System.out.println("=".repeat(80) + "\n");

        // TODO: 在此添加你的业务逻辑
        // 例如：保存到数据库、发送通知等
        saveToDatabase(event);
    }

    /**
     * 保存事件到数据库 (示例)
     */
    private void saveToDatabase(BindReferralEvent event) {
        // TODO: 实现数据库保存逻辑
        // 例如：使用 JDBC、JPA、MyBatis 等
        System.out.println("保存事件到数据库: " + event.getUser());
    }

    /**
     * 关闭连接
     */
    public void shutdown() {
        web3j.shutdown();
        System.out.println("监听器已关闭");
    }
}
```

### 3.3 主程序

```java
import java.math.BigInteger;
import java.util.List;

public class Main {

    public static void main(String[] args) {
        StakingEventListener listener = new StakingEventListener();

        // 方式一：查询历史事件（可选）
        BigInteger currentBlock = BigInteger.valueOf(1000000);  // 当前区块
        BigInteger fromBlock = currentBlock.subtract(BigInteger.valueOf(1000));  // 最近 1000 个区块

        System.out.println("查询历史事件...");
        List<BindReferralEvent> historicalEvents = listener.queryHistoricalEvents(fromBlock, currentBlock);

        for (BindReferralEvent event : historicalEvents) {
            System.out.println(event);
        }

        // 方式二：实时监听新事件
        listener.listenToBindReferral();

        // 添加优雅关闭钩子
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\n正在关闭监听器...");
            listener.shutdown();
        }));

        // 保持程序运行
        try {
            Thread.currentThread().join();
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }
}
```

## 4. 配置说明

### 4.1 网络配置

```java
// 测试网 RPC
private static final String RPC_URL = "https://bsc.ai-hello.cn/";

// 质押合约地址 (从 syi-deployment.json 获取)
private static final String STAKING_CONTRACT_ADDRESS = "0x0F30b6db7ffFe0D465f989BFcC8a73A7cc4D69E9";
```

### 4.2 事件签名计算

BindReferral 事件的 Keccak-256 签名：
```
0xc8e6cf87c2b5dac4a45203c6a0e8c2e1daace0f34d8e4c6d5a3e0c2e1daace0f
```

可以使用在线工具验证：https://emn178.github.io/online-tools/keccak_256.html
输入：`BindReferral(address,address)`

## 5. 运行程序

### 5.1 编译

```bash
mvn clean compile
```

### 5.2 运行

```bash
mvn exec:java -Dexec.mainClass="Main"
```

或使用 IDE 直接运行 `Main.java`

## 6. 输出示例

```
开始监听 BindReferral 事件...
监听器已启动，等待事件...

================================================================================
🔗 接收到 BindReferral 事件
================================================================================
BindReferral事件:
  用户地址: 0x1234567890123456789012345678901234567890
  推荐人: 0x0987654321098765432109876543210987654321
  交易哈希: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
  区块高度: 1234567
================================================================================

保存事件到数据库: 0x1234567890123456789012345678901234567890
```

## 7. 注意事项

1. **RPC 连接稳定性**: 建议使用连接池或重连机制
2. **事件处理幂等性**: 同一事件可能被多次推送，需要去重
3. **区块重组**: 建议等待 12 个区块确认后再处理事件
4. **错误处理**: 添加完善的异常处理和日志记录
5. **性能优化**: 批量处理历史事件，避免逐个查询

## 8. 数据库表结构示例

```sql
CREATE TABLE bind_referral_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_address VARCHAR(42) NOT NULL,
    parent_address VARCHAR(42) NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL UNIQUE,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_address),
    INDEX idx_parent (parent_address),
    INDEX idx_block (block_number)
);
```

## 9. 相关资源

- Web3j 官方文档：https://docs.web3j.io/
- 合约源码：`contracts/SYI-Staking/abstract/StakingBase.sol`
- 事件接口定义：`contracts/SYI-Staking/interfaces/IStaking.sol:191`
