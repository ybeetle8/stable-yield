// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * @title Math
 * @notice Simplified math library for staking calculations
 */
library Math {
    uint256 constant SCALE = 1e18;
    
    /**
     * @notice Power function with fixed point arithmetic
     * @param base Base value (scaled by 1e18)
     * @param exponent Exponent value
     * @return result Result (scaled by 1e18)
     */
    function pow(uint256 base, uint256 exponent) internal pure returns (uint256) {
        if (exponent == 0) return SCALE;
        
        uint256 result = SCALE;
        while (exponent > 0) {
            if (exponent % 2 == 1) {
                result = (result * base) / SCALE;
            }
            base = (base * base) / SCALE;
            exponent /= 2;
        }
        return result;
    }
    
    /**
     * @notice Convert uint256 to scaled value
     */
    function fromUint(uint256 value) internal pure returns (uint256) {
        return value * SCALE;
    }
    
    /**
     * @notice Convert scaled value to uint256
     */
    function toUint(uint256 value) internal pure returns (uint256) {
        return value / SCALE;
    }
}