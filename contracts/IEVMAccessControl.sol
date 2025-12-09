// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title IEVMAccessControl
 * @notice Interface for EVM access control
 * @dev EVMAccessControl manage the Oasys L1 deployment permission
 * @dev Original implementation: https://github.com/oasysgames/oasys-governance-contract/blob/v1.0.0/contracts/EVMAccessControl.sol
 */
interface IEVMAccessControl {
    /**
     * @notice Returns true if `addr` is in the allowed create list, false otherwise.
     * @param addr The address to check.
     * @return True if the address is allowed to create, false otherwise.
     */
    function isAllowedToCreate(address addr) external view returns (bool);
}
