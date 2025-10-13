// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {StakingBase} from "../abstract/StakingBase.sol";

/**
 * @title Staking - Mainnet implementation of Staking contract
 * @notice Production environment staking with mainnet-specific constants
 */
contract Staking is StakingBase {
    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(
        address _usdt,
        address _router,
        address _rootAddress,
        address _feeRecipient
    ) StakingBase(_usdt, _router, _rootAddress, _feeRecipient) {}

    // =========================================================================
    // ENVIRONMENT SPECIFIC CONSTANTS - MAINNET VALUES
    // =========================================================================

    // APY Rates (Production mode: daily compounding)
    function getAPYRate1D() internal pure override returns (uint256) {
        return 1003000000000000000; // 0.3% daily
    }

    function getAPYRate30D() internal pure override returns (uint256) {
        return 1006000000000000000; // 0.6% daily
    }

    function getAPYRate90D() internal pure override returns (uint256) {
        return 1009000000000000000; // 0.9% daily
    }

    function getAPYRate180D() internal pure override returns (uint256) {
        return 1015000000000000000; // 1.5% daily
    }

    // Staking Periods (Production mode: days)
    function getStakePeriod1D() internal pure override returns (uint256) {
        // return 1 days; // Production
        return 1; // Test: 1 second
    }

    function getStakePeriod30D() internal pure override returns (uint256) {
        // return 30 days; // Production
        return 30; // Test: 30 seconds
    }

    function getStakePeriod90D() internal pure override returns (uint256) {
        // return 90 days; // Production
        return 90; // Test: 90 seconds
    }

    function getStakePeriod180D() internal pure override returns (uint256) {
        // return 180 days; // Production
        return 180; // Test: 180 seconds
    }

    // Team Thresholds (Production mode: V1..V7)
    function getTeamThresholdTier1() internal pure override returns (uint256) {
        return 10_000 ether; // V1
    }

    function getTeamThresholdTier2() internal pure override returns (uint256) {
        return 50_000 ether; // V2
    }

    function getTeamThresholdTier3() internal pure override returns (uint256) {
        return 200_000 ether; // V3
    }

    function getTeamThresholdTier4() internal pure override returns (uint256) {
        return 500_000 ether; // V4
    }

    function getTeamThresholdTier5() internal pure override returns (uint256) {
        return 1_000_000 ether; // V5
    }

    function getTeamThresholdTier6() internal pure override returns (uint256) {
        return 2_500_000 ether; // V6
    }

    function getTeamThresholdTier7() internal pure override returns (uint256) {
        return 5_000_000 ether; // V7
    }

    // EOA check - enabled for mainnet
    function shouldCheckEOA() internal pure override returns (bool) {
        return true;
    }

    // Compound Interest Time Unit - daily for mainnet
    function getCompoundTimeUnit() internal pure override returns (uint256) {
        // return 1 days; // Production: daily compounding
        return 1; // Test: per-second compounding
    }
}
