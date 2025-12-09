// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IEVMAccessControl} from "../IEVMAccessControl.sol";

contract MockEVMAccessControl is IEVMAccessControl {
    mapping(address => bool) private _createAllowedList;

    function updateCreateAllowList(address addr, bool isAllow) external {
        _createAllowedList[addr] = isAllow;
    }

    function isAllowedToCreate(
        address addr
    ) external view override returns (bool) {
        return _createAllowedList[addr];
    }
}
