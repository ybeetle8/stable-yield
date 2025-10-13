// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {SYIBase} from "../abstract/SYIBase.sol";

/**
 * @title SYI - Mainnet implementation of SYI token
 * @notice Production environment SYI token with mainnet-specific constants
 */
contract SYI is SYIBase {
    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(
        address _usdt,
        address _router,
        address _staking
    ) SYIBase(_usdt, _router, _staking) {}

    // =========================================================================
    // ENVIRONMENT SPECIFIC CONSTANTS - MAINNET VALUES
    // =========================================================================

    // Delayed buy period - 30 days for mainnet
    function getDelayedBuyPeriod() internal pure override returns (uint256) {
        return 30 days;
    }

    // Presale duration - 30 days for mainnet
    function getPresaleDuration() internal pure override returns (uint256) {
        return 30 days;
    }
}
