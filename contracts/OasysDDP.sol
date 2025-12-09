// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OasysDDP
 * @notice Deterministic deployment proxy for Oasys network using CREATE2
 * @dev Whitelist functionality is added to the original implementation.
 * @dev Original implementation: https://github.com/Arachnid/deterministic-deployment-proxy/blob/v1.0.0/source/deterministic-deployment-proxy.yul
 */
contract OasysDDP is Ownable {
    /// @notice Thrown when an empty array is provided to a function that requires non-empty input
    error EmptyArray();

    /// @notice Thrown when an invalid address (zero address) is provided
    error InvalidAddress();

    /// @notice Thrown when attempting to unwhitelist an address that is not whitelisted
    error NotWhitelisted();

    /// @notice Thrown when attempting to whitelist an address that is already whitelisted
    error AlreadyWhitelisted();

    /// @notice Thrown when CREATE2 deployment fails (returns zero address)
    error DeploymentFailed();

    /// @notice Emitted when multiple addresses are whitelisted in bulk
    /// @param accounts Array of addresses that were whitelisted
    event BulkWhitelisted(address[] accounts);

    /// @notice Emitted when multiple addresses are removed from whitelist in bulk
    /// @param accounts Array of addresses that were unwhitelisted
    event BulkUnwhitelisted(address[] accounts);

    /// @notice Emitted when a contract is deployed using CREATE2
    /// @param deployedAddress Address of the deployed contract
    event Deployed(address indexed deployedAddress);

    /// @notice Mapping to track whitelisted addresses and their positions in the array
    /// @dev The value is a 1-based index in whitelistedAddresses (0 = not whitelisted)
    mapping(address => uint256) private _whitelistedAddresses;

    /// @notice Array of all whitelisted addresses
    address[] public whitelistedAddresses;

    /// @notice Flag to disable whitelist check
    /// @notice When true, whitelist check is bypassed
    bool public disableWhitelist;

    /// @notice Constructor sets the deployer as the owner
    // solhint-disable-next-line func-visibility
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Whitelists multiple addresses
     * @param accounts Array of addresses to whitelist
     */
    function bulkWhitelist(address[] calldata accounts) public onlyOwner {
        if (accounts.length == 0) revert EmptyArray();
        for (uint256 i = 0; i < accounts.length; ++i) {
            if (accounts[i] == address(0)) revert InvalidAddress();
            if (isWhitelisted(accounts[i])) revert AlreadyWhitelisted();
            whitelistedAddresses.push(accounts[i]);
            // Store 1-based index for efficient removal
            _whitelistedAddresses[accounts[i]] = whitelistedAddresses.length;
        }
        emit BulkWhitelisted(accounts);
    }

    /**
     * @notice Removes multiple addresses from whitelist
     * @param accounts Array of addresses to remove from whitelist
     */
    function bulkUnwhitelist(address[] calldata accounts) public onlyOwner {
        if (accounts.length == 0) revert EmptyArray();
        for (uint256 i = 0; i < accounts.length; ++i) {
            if (!isWhitelisted(accounts[i])) revert NotWhitelisted();

            uint256 arrayIndex = _whitelistedAddresses[accounts[i]] - 1;
            address last = whitelistedAddresses[
                whitelistedAddresses.length - 1
            ];

            whitelistedAddresses.pop();
            delete _whitelistedAddresses[accounts[i]];

            // Swap with last element for O(1) removal
            if (last != accounts[i]) {
                whitelistedAddresses[arrayIndex] = last;
                _whitelistedAddresses[last] = arrayIndex + 1;
            }
        }
        emit BulkUnwhitelisted(accounts);
    }

    /**
     * @notice Enables/disables whitelist requirement
     * @param _disableWhitelist True to disable whitelist, false to enable it
     */
    function setDisableWhitelist(bool _disableWhitelist) public onlyOwner {
        disableWhitelist = _disableWhitelist;
    }

    /**
     * @notice Checks if an address is whitelisted
     * @param account Address to check
     * @return True if the address is whitelisted, false otherwise
     */
    function isWhitelisted(address account) public view returns (bool) {
        return _whitelistedAddresses[account] > 0;
    }

    /**
     * @notice Returns all whitelisted addresses
     * @return Array of all whitelisted addresses
     */
    function getWhitelistedAddresses() public view returns (address[] memory) {
        return whitelistedAddresses;
    }

    /**
     * @notice Deploys contract using CREATE2 with deterministic address
     * @dev Calldata format: [salt (32 bytes)][bytecode (rest)]
     */
    fallback() external payable {
        // Check whitelist if enabled
        if (!disableWhitelist && !isWhitelisted(msg.sender))
            revert NotWhitelisted();

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
