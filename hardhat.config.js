require("@nomicfoundation/hardhat-toolbox");

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
  networks: {
    hardhat: {
      mining: {
        auto: false,
        interval: 3000  // 每3秒自动挖一个块 (单位: 毫秒)
      }
    },
    localhost: {
      url: "http://127.0.0.1:8545",
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