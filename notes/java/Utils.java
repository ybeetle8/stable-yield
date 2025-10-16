package com.syi.staking;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 工具类 - 提供格式化功能
 */
public class Utils {

    private static final String ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    private static final DateTimeFormatter DATETIME_FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.of("Asia/Shanghai"));

    /**
     * 格式化地址（缩短显示）
     * @param address 完整地址
     * @return 格式化后的地址，如 "0x1234...5678"
     */
    public static String formatAddress(String address) {
        if (address == null || address.isEmpty()) {
            return "未知地址";
        }

        if (ZERO_ADDRESS.equalsIgnoreCase(address)) {
            return "零地址";
        }

        if (address.length() < 10) {
            return address;
        }

        return address.substring(0, 6) + "..." + address.substring(address.length() - 4);
    }

    /**
     * 格式化时间戳
     * @param blockNumber 区块号
     * @return 格式化后的时间字符串
     */
    public static String formatTimestamp(long blockNumber) {
        Instant instant = Instant.ofEpochSecond(blockNumber);
        return DATETIME_FORMATTER.format(instant);
    }

    /**
     * 打印分隔线
     * @param length 分隔线长度
     */
    public static void printSeparator(int length) {
        System.out.println("=".repeat(length));
    }

    /**
     * 打印分隔线（默认80字符）
     */
    public static void printSeparator() {
        printSeparator(80);
    }

    /**
     * 检查地址是否为零地址
     */
    public static boolean isZeroAddress(String address) {
        return ZERO_ADDRESS.equalsIgnoreCase(address);
    }
}
