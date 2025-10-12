// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPancakeRouter02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);

    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

interface IPancakeFactory {
    function getPair(address tokenA, address tokenB)
        external view returns (address pair);
}

interface IPancakePair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (
        uint112 reserve0,
        uint112 reserve1,
        uint32 blockTimestampLast
    );
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title PancakeSwapDemo
 * @notice 演示如何在 fork 的主网环境中调用 PancakeSwap 合约
 * @dev 使用 BSC 主网的 PancakeSwap V2 合约地址
 */
contract PancakeSwapDemo {
    // PancakeSwap V2 主网地址
    address public constant PANCAKE_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address public constant PANCAKE_FACTORY = 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73;

    // 常用代币地址 (BSC 主网)
    address public constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public constant BUSD = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56;
    address public constant USDT = 0x55d398326f99059fF775485246999027B3197955;

    IPancakeRouter02 public router;
    IPancakeFactory public factory;

    event PriceQueried(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event SwapExecuted(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    constructor() {
        router = IPancakeRouter02(PANCAKE_ROUTER);
        factory = IPancakeFactory(PANCAKE_FACTORY);
    }

    /**
     * @notice 查询交易对地址
     * @param tokenA 代币 A 地址
     * @param tokenB 代币 B 地址
     * @return pair 交易对地址
     */
    function getPairAddress(address tokenA, address tokenB)
        external view returns (address pair)
    {
        return factory.getPair(tokenA, tokenB);
    }

    /**
     * @notice 查询交易对储备量
     * @param tokenA 代币 A 地址
     * @param tokenB 代币 B 地址
     * @return reserve0 储备量 0
     * @return reserve1 储备量 1
     * @return token0 代币 0 地址
     * @return token1 代币 1 地址
     */
    function getPairReserves(address tokenA, address tokenB)
        external view returns (
            uint112 reserve0,
            uint112 reserve1,
            address token0,
            address token1
        )
    {
        address pairAddress = factory.getPair(tokenA, tokenB);
        require(pairAddress != address(0), "Pair does not exist");

        IPancakePair pair = IPancakePair(pairAddress);
        (reserve0, reserve1,) = pair.getReserves();
        token0 = pair.token0();
        token1 = pair.token1();
    }

    /**
     * @notice 查询兑换价格 (不执行交易)
     * @param amountIn 输入代币数量
     * @param tokenIn 输入代币地址
     * @param tokenOut 输出代币地址
     * @return amountOut 预期输出代币数量
     */
    function getPrice(
        uint256 amountIn,
        address tokenIn,
        address tokenOut
    ) external view returns (uint256 amountOut) {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint[] memory amounts = router.getAmountsOut(amountIn, path);
        return amounts[1];
    }

    /**
     * @notice 查询通过中间代币的兑换价格
     * @param amountIn 输入代币数量
     * @param tokenIn 输入代币地址
     * @param tokenMid 中间代币地址 (通常是 WBNB)
     * @param tokenOut 输出代币地址
     * @return amountOut 预期输出代币数量
     */
    function getPriceWithHop(
        uint256 amountIn,
        address tokenIn,
        address tokenMid,
        address tokenOut
    ) external view returns (uint256 amountOut) {
        address[] memory path = new address[](3);
        path[0] = tokenIn;
        path[1] = tokenMid;
        path[2] = tokenOut;

        uint[] memory amounts = router.getAmountsOut(amountIn, path);
        return amounts[2];
    }

    /**
     * @notice 执行代币兑换
     * @dev 需要先授权此合约使用 tokenIn
     * @param amountIn 输入代币数量
     * @param amountOutMin 最小输出代币数量 (滑点保护)
     * @param tokenIn 输入代币地址
     * @param tokenOut 输出代币地址
     * @return amountOut 实际输出代币数量
     */
    function swap(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut
    ) external returns (uint256 amountOut) {
        // 从调用者转入代币
        require(
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn),
            "Transfer failed"
        );

        // 授权 Router
        IERC20(tokenIn).approve(PANCAKE_ROUTER, amountIn);

        // 构建交易路径
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        // 执行兑换
        uint[] memory amounts = router.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            msg.sender,  // 代币直接发送给调用者
            block.timestamp + 300  // 5 分钟有效期
        );

        amountOut = amounts[1];
        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }

    /**
     * @notice 查询 BNB 价格 (以 BUSD 计价)
     * @param amountBNB BNB 数量 (wei)
     * @return amountBUSD BUSD 数量
     */
    function getBNBPrice(uint256 amountBNB)
        external view returns (uint256 amountBUSD)
    {
        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = BUSD;

        uint[] memory amounts = router.getAmountsOut(amountBNB, path);
        return amounts[1];
    }

    /**
     * @notice 查询 WBNB/BUSD 交易对信息
     * @return pairAddress 交易对地址
     * @return reserveWBNB WBNB 储备量
     * @return reserveBUSD BUSD 储备量
     */
    function getWBNBBUSDPairInfo()
        external view returns (
            address pairAddress,
            uint256 reserveWBNB,
            uint256 reserveBUSD
        )
    {
        pairAddress = factory.getPair(WBNB, BUSD);
        require(pairAddress != address(0), "Pair does not exist");

        IPancakePair pair = IPancakePair(pairAddress);
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();

        address token0 = pair.token0();
        if (token0 == WBNB) {
            reserveWBNB = reserve0;
            reserveBUSD = reserve1;
        } else {
            reserveWBNB = reserve1;
            reserveBUSD = reserve0;
        }
    }
}
