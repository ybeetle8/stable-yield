// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FundRelay
 * @notice Dedicated fund relay contract to solve INVALID_TO issues during SYI contract swaps
 * @dev Acts as an intermediary between SYI contract and Uniswap Router, safely handling USDT transfers
 * @author SYI Protocol Team
 * @custom:security-contact security@syi.com
 */
contract FundRelay {
    // =========================================================================
    // State Variables
    // =========================================================================

    /// @notice SYI contract address
    address public immutable SYI_CONTRACT;

    /// @notice USDT token address
    address public immutable USDT;

    /// @notice Emergency withdrawal address (usually owner)
    address public immutable EMERGENCY_RECIPIENT;

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice Emitted when USDT is received
    event USDTReceived(uint256 amount, address indexed from);

    /// @notice Emitted when USDT is forwarded
    event USDTForwarded(uint256 amount, address indexed to);

    /// @notice Emitted when emergency withdrawal occurs
    event EmergencyWithdraw(uint256 amount, address indexed to);

    // =========================================================================
    // Errors
    // =========================================================================

    /// @notice Only SYI contract can call this function
    error OnlySYIContract();

    /// @notice Only emergency recipient can call this function
    error OnlyEmergencyRecipient();

    /// @notice Insufficient balance for operation
    error InsufficientBalance();

    /// @notice Token transfer failed
    error TransferFailed();

    // =========================================================================
    // Modifiers
    // =========================================================================

    /// @dev Only SYI contract can call
    modifier onlySYI() {
        if (msg.sender != SYI_CONTRACT) revert OnlySYIContract();
        _;
    }

    /// @dev Only emergency recipient can call
    modifier onlyEmergency() {
        if (msg.sender != EMERGENCY_RECIPIENT) revert OnlyEmergencyRecipient();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    /**
     * @notice Initializes the FundRelay contract
     * @param _syiContract SYI contract address
     * @param _usdt USDT token address
     * @param _emergencyRecipient Emergency withdrawal recipient address
     */
    constructor(
        address _syiContract,
        address _usdt,
        address _emergencyRecipient
    ) {
        require(_syiContract != address(0), "Invalid SYI contract");
        require(_usdt != address(0), "Invalid USDT");
        require(
            _emergencyRecipient != address(0),
            "Invalid emergency recipient"
        );

        SYI_CONTRACT = _syiContract;
        USDT = _usdt;
        EMERGENCY_RECIPIENT = _emergencyRecipient;

        // Pre-approve SYI contract to withdraw all USDT
        IERC20(_usdt).approve(_syiContract, type(uint256).max);
    }

    // =========================================================================
    // Main Functions
    // =========================================================================

    /**
     * @notice Receive USDT and immediately forward to SYI contract
     * @dev This function will be called by Uniswap Router to receive swapped USDT
     * @return usdtAmount Amount of USDT forwarded
     */
    function receiveAndForward() external returns (uint256 usdtAmount) {
        uint256 balance = IERC20(USDT).balanceOf(address(this));

        if (balance > 0) {
            emit USDTReceived(balance, msg.sender);

            // Immediately forward to SYI contract
            bool success = IERC20(USDT).transfer(SYI_CONTRACT, balance);
            if (!success) revert TransferFailed();

            emit USDTForwarded(balance, SYI_CONTRACT);
            return balance;
        }

        return 0;
    }

    /**
     * @notice SYI contract withdraws USDT
     * @param amount Amount to withdraw
     * @dev Only SYI contract can call this function
     */
    function withdrawToSYI(uint256 amount) external onlySYI {
        uint256 balance = IERC20(USDT).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance();

        bool success = IERC20(USDT).transfer(SYI_CONTRACT, amount);
        if (!success) revert TransferFailed();

        emit USDTForwarded(amount, SYI_CONTRACT);
    }

    /**
     * @notice Get current USDT balance
     * @return balance Current USDT balance in this contract
     */
    function getUSDTBalance() external view returns (uint256 balance) {
        return IERC20(USDT).balanceOf(address(this));
    }

    /**
     * @notice Withdraw SYI tokens to SYI contract for processing
     * @dev Only SYI contract can call this function
     * @param amount Amount of SYI to withdraw
     */
    function withdrawSYIToContract(uint256 amount) external onlySYI {
        uint256 xfBalance = IERC20(SYI_CONTRACT).balanceOf(address(this));
        if (xfBalance < amount) revert InsufficientBalance();

        bool success = IERC20(SYI_CONTRACT).transfer(SYI_CONTRACT, amount);
        if (!success) revert TransferFailed();
    }

    // =========================================================================
    // Emergency Functions
    // =========================================================================

    /**
     * @notice Emergency withdraw all USDT
     * @dev Only emergency recipient can call this function, used for fund rescue in exceptional situations
     */
    function emergencyWithdraw() external onlyEmergency {
        uint256 balance = IERC20(USDT).balanceOf(address(this));

        if (balance > 0) {
            bool success = IERC20(USDT).transfer(EMERGENCY_RECIPIENT, balance);
            if (!success) revert TransferFailed();

            emit EmergencyWithdraw(balance, EMERGENCY_RECIPIENT);
        }
    }

    /**
     * @notice Emergency withdraw specific token
     * @param token Token address to withdraw
     * @param amount Amount to withdraw
     */
    function emergencyWithdrawToken(
        address token,
        uint256 amount
    ) external onlyEmergency {
        bool success = IERC20(token).transfer(EMERGENCY_RECIPIENT, amount);
        if (!success) revert TransferFailed();
    }
}
