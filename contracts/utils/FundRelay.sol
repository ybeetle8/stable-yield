// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FundRelay
 * @notice Handles fee distribution and fund relaying for OLA ecosystem
 */
contract FundRelay is Ownable {
    IERC20 public immutable USDT;
    IERC20 public immutable OLA;

    constructor(address _usdt, address _ola) Ownable(msg.sender) {
        USDT = IERC20(_usdt);
        OLA = IERC20(_ola);
    }

    /**
     * @notice Receives and forwards USDT to the OLA contract
     * @return amount Amount received and forwarded
     */
    function receiveAndForward() external returns (uint256 amount) {
        amount = USDT.balanceOf(address(this));
        if (amount > 0) {
            USDT.transfer(msg.sender, amount);
        }
        return amount;
    }

    /**
     * @notice Withdraws OLA tokens to contract
     * @param amount Amount to withdraw
     */
    function withdrawOLAToContract(uint256 amount) external onlyOwner {
        OLA.transfer(msg.sender, amount);
    }

    /**
     * @notice Withdraws USDT to OLA contract
     * @param amount Amount to withdraw
     */
    function withdrawToOLA(uint256 amount) external onlyOwner {
        USDT.transfer(msg.sender, amount);
    }

    /**
     * @notice Emergency withdrawal function
     * @param token Token to withdraw
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
}