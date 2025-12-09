// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;
import {IEVMAccessControl} from "./IEVMAccessControl.sol";

/**
 * @title OasysDDP
 * @notice Deterministic deployment proxy for Oasys network using CREATE2
 * @dev Uses EVMAccessControl for access control instead of local whitelist.
 * @dev Original implementation: https://github.com/Arachnid/deterministic-deployment-proxy/blob/v1.0.0/source/deterministic-deployment-proxy.yul
 */
contract OasysDDP {
    /// @notice Thrown when an invalid address (zero address) is provided
    error InvalidAddress();

    /// @notice Thrown when address is not allowed to create contracts
    error NotAllowedToCreate();

    /// @notice Thrown when CREATE2 deployment fails (returns zero address)
    error DeploymentFailed();

    /// @notice Emitted when a contract is deployed using CREATE2
    /// @param deployedAddress Address of the deployed contract
    event Deployed(address indexed deployedAddress);

    /// @notice EVM Access Control contract for checking deployment permissions
    IEVMAccessControl public immutable EVM_ACCESS_CONTROL;

    /// @notice Constructor sets the EVM access control address
    /// @param _evmAccessControl Address of the EVMAccessControl contract
    // solhint-disable-next-line func-visibility
    constructor(address _evmAccessControl) {
        if (_evmAccessControl == address(0)) revert InvalidAddress();
        EVM_ACCESS_CONTROL = IEVMAccessControl(_evmAccessControl);
    }

    /**
     * @notice Deploys contract using CREATE2 with deterministic address
     * @dev Calldata format: [salt (32 bytes)][bytecode (rest)]
     * @dev Checks EVMAccessControl to verify sender is allowed to create contracts
     */
    fallback() external payable {
        // Check if sender is allowed to create contracts via EVMAccessControl
        if (!EVM_ACCESS_CONTROL.isAllowedToCreate(msg.sender))
            revert NotAllowedToCreate();

        // Require at least salt (32 bytes) + bytecode
        if (msg.data.length < 33) revert InvalidAddress();

        address deployedAddress;
        assembly {
            // Copy bytecode from calldata (skip first 32 bytes = salt)
            calldatacopy(0, 32, sub(calldatasize(), 32))

            // Deploy using CREATE2: salt is first 32 bytes of calldata
            deployedAddress := create2(
                callvalue(), // value to send
                0, // bytecode offset in memory
                sub(calldatasize(), 32), // bytecode length
                calldataload(0) // salt
            )
        }

        if (deployedAddress == address(0)) revert DeploymentFailed();

        emit Deployed(deployedAddress);

        // Return deployed address (20 bytes, offset 12 to skip zero padding)
        assembly {
            mstore(0, deployedAddress)
            return(12, 20)
        }
    }
}
