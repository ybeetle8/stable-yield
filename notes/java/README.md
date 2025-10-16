# SYI Staking BindReferral 事件监听器 (Java 版本)

## 项目说明

这是一个基于 Web3j 的 Java 应用程序，用于监听 SYI Staking 合约的 `BindReferral` 事件。

## 目录结构

```
notes/java/
├── pom.xml                      # Maven 项目配置文件
├── DeploymentConfig.java        # 部署配置读取类
├── Utils.java                   # 工具类（格式化函数）
├── StakingEventListener.java   # 主类（事件监听器）
└── README.md                    # 本文件
```

## 依赖说明

- **Web3j 4.10.3**: 以太坊 Java 客户端库
- **Gson 2.10.1**: JSON 解析库
- **SLF4J + Logback**: 日志框架
- **Java 11+**: 最低 Java 版本要求

## 快速开始

### 1. 前置条件

确保已安装：
- Java 11 或更高版本
- Maven 3.6+

检查版本：
```bash
java -version
mvn -version
```

### 2. 项目结构调整

将 Java 文件移动到标准 Maven 目录结构：

```bash
cd notes/java

# 创建标准 Maven 目录结构
mkdir -p src/main/java/com/syi/staking
mkdir -p src/main/resources

# 移动 Java 文件
mv DeploymentConfig.java src/main/java/com/syi/staking/
mv Utils.java src/main/java/com/syi/staking/
mv StakingEventListener.java src/main/java/com/syi/staking/
```

### 3. 编译项目

```bash
# 在 notes/java 目录下执行
mvn clean compile
```

### 4. 启动本地节点

在另一个终端窗口启动 Hardhat 节点：

```bash
# 在项目根目录执行
npx hardhat node --hostname 0.0.0.0 --port 8545 --fork https://rpc.tornadoeth.cash/bsc --fork-block-number 64340000
```

### 5. 部署合约

```bash
# 在项目根目录执行
npx hardhat run scripts/deploySYI.js --network localhost
```

### 6. 运行监听器

**方式一：使用 Maven exec 插件**

```bash
cd notes/java
mvn exec:java -Dexec.mainClass="com.syi.staking.StakingEventListener"
```

**方式二：打包成可执行 JAR**

```bash
# 打包
mvn clean package

# 运行
java -jar target/staking-event-listener-1.0.0-jar-with-dependencies.jar
```

**方式三：指定自定义 RPC 和配置文件**

```bash
# 指定 RPC URL
java -jar target/staking-event-listener-1.0.0-jar-with-dependencies.jar http://localhost:8545

# 指定 RPC 和配置文件路径
java -jar target/staking-event-listener-1.0.0-jar-with-dependencies.jar \
  http://localhost:8545 \
  /path/to/syi-deployment.json
```

## 事件说明

### BindReferral 事件

**Solidity 定义：**
```solidity
event BindReferral(
    address indexed user,        // 用户地址
    address indexed parent,      // 推荐人地址
    uint256 indexed blockNumber  // 绑定时的区块号
);
```

**触发条件：**
- 用户调用 `lockReferral(address _referrer)` 函数
- 用户首次绑定推荐人关系

**输出示例：**
```
================================================================================
🔗 事件: 绑定推荐人 (BindReferral)
================================================================================
用户地址:       0x1234567890123456789012345678901234567890 (0x1234...7890)
推荐人:         0x0987654321098765432109876543210987654321 (0x0987...4321)
绑定块高度:     #12345678
链上块高度:     12345678
交易哈希:       0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
================================================================================
```

## 配置文件

程序会自动读取项目根目录下的 `syi-deployment.json` 文件：

**默认路径计算：**
```
当前目录: notes/java/
配置文件: ../../syi-deployment.json
```

**配置文件示例：**
```json
{
  "network": "localhost",
  "contracts": {
    "Staking": "0x1234567890123456789012345678901234567890",
    "SYI": "0x0987654321098765432109876543210987654321"
  }
}
```

## 代码说明

### StakingEventListener.java

**核心功能：**
1. 连接到本地/远程以太坊节点
2. 读取 Staking 合约地址
3. 订阅 `BindReferral` 事件
4. 查询历史事件（最近 100 个区块）
5. 实时监听新事件

**关键方法：**
- `startListening()`: 启动事件监听
- `queryHistoricalEvents()`: 查询历史事件
- `handleBindReferralEvent()`: 处理事件并格式化输出

### DeploymentConfig.java

**功能：**
- 读取 `syi-deployment.json` 配置文件
- 解析合约地址
- 提供类型安全的访问方法

### Utils.java

**工具函数：**
- `formatAddress()`: 格式化地址为简短形式（0x1234...5678）
- `formatTimestamp()`: 格式化时间戳（北京时间）
- `printSeparator()`: 打印分隔线
- `isZeroAddress()`: 检查是否为零地址

## 测试事件

在另一个终端运行测试脚本触发 `BindReferral` 事件：

```bash
# 在项目根目录执行
npx hardhat run scripts/testSYIStaking.js --network localhost
```

监听器会实时输出事件信息。

## 常见问题

### 1. 编译错误：找不到包

**原因：** Java 文件不在标准 Maven 目录结构中

**解决：** 将文件移动到 `src/main/java/com/syi/staking/` 目录

### 2. 运行时错误：Connection refused

**原因：** Hardhat 节点未启动或端口不正确

**解决：** 启动节点并确保端口为 8545

### 3. 配置文件读取失败

**原因：** `syi-deployment.json` 文件不存在或路径错误

**解决：**
- 确保已运行部署脚本
- 检查配置文件路径是否正确
- 可通过命令行参数指定路径

### 4. 未找到历史事件

**原因：** 区块链上尚未发生 `BindReferral` 事件

**解决：** 运行测试脚本触发事件

## 生产环境部署

### 连接到 BSC 主网/测试网

修改 RPC URL：

```bash
# BSC 主网
java -jar staking-event-listener.jar https://bsc-dataseed.binance.org/

# BSC 测试网
java -jar staking-event-listener.jar https://data-seed-prebsc-1-s1.binance.org:8545/
```

### 环境变量配置

```bash
export RPC_URL=https://bsc-dataseed.binance.org/
export CONFIG_PATH=/path/to/syi-deployment.json

java -jar staking-event-listener.jar $RPC_URL $CONFIG_PATH
```

### 后台运行

```bash
# 使用 nohup
nohup java -jar staking-event-listener.jar > staking-listener.log 2>&1 &

# 使用 systemd (推荐)
# 创建服务文件: /etc/systemd/system/staking-listener.service
```

## 日志配置

在 `src/main/resources/logback.xml` 中配置日志：

```xml
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <appender name="FILE" class="ch.qos.logback.core.FileAppender">
        <file>logs/staking-listener.log</file>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <root level="info">
        <appender-ref ref="STDOUT" />
        <appender-ref ref="FILE" />
    </root>
</configuration>
```

## 扩展功能

如果需要监听其他事件，可以参考 `StakingEventListener.java` 添加新的事件定义：

```java
// 示例：添加 BindFriend 事件
private static final Event BIND_FRIEND_EVENT = new Event(
    "BindFriend",
    Arrays.asList(
        new TypeReference<Address>(true) {},  // user
        new TypeReference<Address>(true) {},  // friend
        new TypeReference<Uint256>(true) {}   // blockNumber
    )
);
```

## 许可证

本代码仅供 SYI 项目内部使用。
