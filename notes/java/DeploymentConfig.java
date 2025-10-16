package com.syi.staking;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.FileReader;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 部署配置读取类
 * 从 syi-deployment.json 文件中读取合约地址
 */
public class DeploymentConfig {

    private String stakingAddress;
    private String syiAddress;
    private String network;

    /**
     * 从默认路径加载配置文件
     * 默认路径: ../../../syi-deployment.json (相对于 notes/java/)
     */
    public static DeploymentConfig load() throws IOException {
        Path currentPath = Paths.get("").toAbsolutePath();
        Path configPath = currentPath.getParent().getParent().resolve("syi-deployment.json");
        return load(configPath.toString());
    }

    /**
     * 从指定路径加载配置文件
     * @param filePath 配置文件路径
     */
    public static DeploymentConfig load(String filePath) throws IOException {
        DeploymentConfig config = new DeploymentConfig();

        try (FileReader reader = new FileReader(filePath)) {
            Gson gson = new Gson();
            JsonObject json = gson.fromJson(reader, JsonObject.class);

            // 读取合约地址
            if (json.has("contracts")) {
                JsonObject contracts = json.getAsJsonObject("contracts");

                if (contracts.has("Staking")) {
                    config.stakingAddress = contracts.get("Staking").getAsString();
                }

                if (contracts.has("SYI")) {
                    config.syiAddress = contracts.get("SYI").getAsString();
                }
            }

            // 读取网络信息
            if (json.has("network")) {
                config.network = json.get("network").getAsString();
            }

            // 验证必需字段
            if (config.stakingAddress == null || config.stakingAddress.isEmpty()) {
                throw new IOException("配置文件中未找到 Staking 合约地址");
            }

            return config;
        }
    }

    public String getStakingAddress() {
        return stakingAddress;
    }

    public String getSyiAddress() {
        return syiAddress;
    }

    public String getNetwork() {
        return network;
    }

    @Override
    public String toString() {
        return "DeploymentConfig{" +
                "stakingAddress='" + stakingAddress + '\'' +
                ", syiAddress='" + syiAddress + '\'' +
                ", network='" + network + '\'' +
                '}';
    }
}
