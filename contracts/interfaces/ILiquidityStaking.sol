// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * @title ILiquidityStaking
 * @notice Interface for Liquidity Staking contract
 */
interface ILiquidityStaking {
    /**
     * @notice Deposits USDT rewards for LP holders
     * @param amount Amount of USDT to deposit
     */
    function depositRewards(uint256 amount) external;

    /**
     * @notice Deposits OLA rewards for LP holders
     * @param amount Amount of OLA tokens to deposit
     */
    function depositBLARewards(uint256 amount) external;

    /**
     * @notice Gets pending rewards for a user
     * @param user User address
     * @return amount Pending reward amount
     */
    function pendingRewards(address user) external view returns (uint256 amount);

    /**
     * @notice Claims rewards for a user
     */
    function claimRewards() external;
}