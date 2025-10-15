require("@nomicfoundation/hardhat-toolbox");
require("hardhat-preprocessor");
const fs = require("fs");

function getRemappings() {
  return fs
    .readFileSync("remappings.txt", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.trim().split("="));
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  preprocess: {
    eachLine: (hre) => ({
      transform: (line) => {
        if (line.match(/^\s*import /i)) {
          getRemappings().forEach(([find, replace]) => {
            if (line.match(find)) {
              line = line.replace(find, replace);
            }
          });
        }
        return line;
      },
    }),
  },
  networks: {
    hardhat: {
      mining: {
        auto: false,
        interval: 3000  // 每3秒自动挖一个块 (单位: 毫秒)
      }
    },
    localhost: {
      //url: "http://127.0.0.1:8545",
      url: "https://bsc.ai-hello.cn/",
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk"
      }
    },
    bsc: {
      url: "https://bsc-dataseed1.binance.org/",
      chainId: 56,
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
    }
  }
};