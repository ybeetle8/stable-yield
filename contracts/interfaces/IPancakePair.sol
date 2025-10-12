// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPancakePair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function sync() external;
    function balanceOf(address owner) external view returns (uint);
    function totalSupply() external view returns (uint);
}