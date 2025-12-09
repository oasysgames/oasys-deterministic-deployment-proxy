import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  encodePacked,
  keccak256,
  toBytes,
  toHex,
  slice,
  getAddress,
} from "viem";
import { artifacts } from "hardhat";
import { network } from "hardhat";

describe("OasysDDP", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  let ddp: any;
  let mockEVMAccessControl: any;
  let counterBytecode: `0x${string}`;
  let owner: any;
  let allowedUser: any;
  let notAllowedUser: any;

  // Helper function to calculate CREATE2 address
  function calculateCreate2Address(
    deployer: `0x${string}`,
    salt: `0x${string}`,
    bytecode: `0x${string}`,
  ): `0x${string}` {
    const initCodeHash = keccak256(bytecode);
    const hash = keccak256(
      encodePacked(
        ["bytes1", "address", "bytes32", "bytes32"],
        ["0xff", deployer.toLowerCase() as `0x${string}`, salt, initCodeHash],
      ),
    );
    return slice(hash, 12) as `0x${string}`;
  }

  // Deploy contracts and get Counter bytecode
  beforeEach(async function () {
    // Get test accounts
    const [ownerAccount, allowedUserAccount, notAllowedUserAccount] =
      await viem.getWalletClients();
    owner = ownerAccount;
    allowedUser = allowedUserAccount;
    notAllowedUser = notAllowedUserAccount;

    // Deploy MockEVMAccessControl first
    mockEVMAccessControl = await viem.deployContract("MockEVMAccessControl");

    // Deploy OasysDDP with MockEVMAccessControl address
    ddp = await viem.deployContract("OasysDDP", [mockEVMAccessControl.address]);

    // Verify EVM_ACCESS_CONTROL is set correctly
    const evmAccessControlAddress = await ddp.read.EVM_ACCESS_CONTROL();
    assert.equal(
      evmAccessControlAddress.toLowerCase(),
      mockEVMAccessControl.address.toLowerCase(),
      "EVM_ACCESS_CONTROL should be set to MockEVMAccessControl",
    );

    // Get Counter bytecode from artifacts
    const counterArtifact = await artifacts.readArtifact("Counter");
    counterBytecode = counterArtifact.bytecode as `0x${string}`;
  });

  describe("Access Control", function () {
    it("Should allow user to deploy when allowed in EVMAccessControl", async function () {
      // Allow user in EVMAccessControl
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [allowedUser.account.address, true],
      });

      // Verify user is allowed
      const isAllowed = await mockEVMAccessControl.read.isAllowedToCreate([
        allowedUser.account.address,
      ]);
      assert.equal(isAllowed, true, "User should be allowed");

      // Prepare calldata: salt (32 bytes) + bytecode
      const salt = toHex(toBytes("test-salt"), { size: 32 }) as `0x${string}`;
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [salt, counterBytecode],
      ) as `0x${string}`;

      // Calculate expected address
      const expectedAddress = calculateCreate2Address(
        ddp.address as `0x${string}`,
        salt,
        counterBytecode,
      );

      const tx = allowedUser.sendTransaction({
        to: ddp.address,
        data: calldata,
      });

      // Verify the event is emitted
      await viem.assertions.emitWithArgs(tx, ddp, "Deployed", [
        getAddress(expectedAddress),
      ]);

      // Verify the deployed contract is Counter
      const counter = await viem.getContractAt("Counter", expectedAddress);
      const initialValue = await counter.read.x();
      assert.equal(initialValue, 0n);
    });

    it("Should revert when user is not allowed in EVMAccessControl", async function () {
      // Ensure user is not allowed (default state)
      const isAllowed = await mockEVMAccessControl.read.isAllowedToCreate([
        notAllowedUser.account.address,
      ]);
      assert.equal(isAllowed, false, "User should not be allowed");

      // Prepare calldata: salt (32 bytes) + bytecode
      const salt = toHex(toBytes("test-salt"), { size: 32 }) as `0x${string}`;
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [salt, counterBytecode],
      ) as `0x${string}`;

      await assert.rejects(
        notAllowedUser.sendTransaction({
          to: ddp.address,
          data: calldata,
        }),
        /NotAllowedToCreate/,
      );
    });

    it("Should allow multiple users when they are all allowed", async function () {
      // Get additional test accounts
      const wallets = await viem.getWalletClients();
      const user1Wallet = wallets[3] || allowedUser;
      const user2Wallet = wallets[4] || notAllowedUser;
      const user1 = user1Wallet.account.address;
      const user2 = user2Wallet.account.address;

      // Allow both users
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [user1, true],
      });
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [user2, true],
      });

      // Verify both are allowed
      assert.equal(
        await mockEVMAccessControl.read.isAllowedToCreate([user1]),
        true,
      );
      assert.equal(
        await mockEVMAccessControl.read.isAllowedToCreate([user2]),
        true,
      );

      // Both should be able to deploy
      const salt1 = toHex(toBytes("salt1"), { size: 32 }) as `0x${string}`;
      const salt2 = toHex(toBytes("salt2"), { size: 32 }) as `0x${string}`;

      const calldata1 = encodePacked(
        ["bytes32", "bytes"],
        [salt1, counterBytecode],
      ) as `0x${string}`;
      const calldata2 = encodePacked(
        ["bytes32", "bytes"],
        [salt2, counterBytecode],
      ) as `0x${string}`;

      // Deploy with user1
      const tx1 = await user1Wallet.sendTransaction({
        to: ddp.address,
        data: calldata1,
      });
      const receipt1 = await publicClient.waitForTransactionReceipt({
        hash: tx1,
      });
      assert.equal(receipt1.status, "success");

      // Deploy with user2
      const tx2 = await user2Wallet.sendTransaction({
        to: ddp.address,
        data: calldata2,
      });
      const receipt2 = await publicClient.waitForTransactionReceipt({
        hash: tx2,
      });
      assert.equal(receipt2.status, "success");
    });

    it("Should revoke access when user is removed from EVMAccessControl", async function () {
      // First allow user
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [allowedUser.account.address, true],
      });

      // User should be able to deploy
      const salt1 = toHex(toBytes("salt-before"), {
        size: 32,
      }) as `0x${string}`;
      const calldata1 = encodePacked(
        ["bytes32", "bytes"],
        [salt1, counterBytecode],
      ) as `0x${string}`;

      const tx1 = await allowedUser.sendTransaction({
        to: ddp.address,
        data: calldata1,
      });
      const receipt1 = await publicClient.waitForTransactionReceipt({
        hash: tx1,
      });
      assert.equal(receipt1.status, "success");

      // Revoke access
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [allowedUser.account.address, false],
      });

      // Verify access is revoked
      const isAllowed = await mockEVMAccessControl.read.isAllowedToCreate([
        allowedUser.account.address,
      ]);
      assert.equal(isAllowed, false, "User should not be allowed");

      // User should not be able to deploy anymore
      const salt2 = toHex(toBytes("salt-after"), { size: 32 }) as `0x${string}`;
      const calldata2 = encodePacked(
        ["bytes32", "bytes"],
        [salt2, counterBytecode],
      ) as `0x${string}`;

      await assert.rejects(
        allowedUser.sendTransaction({
          to: ddp.address,
          data: calldata2,
        }),
        /NotAllowedToCreate/,
      );
    });
  });

  describe("Deterministic Deployment (Fallback)", function () {
    const salt = toHex(toBytes("test-salt-12345"), {
      size: 32,
    }) as `0x${string}`;

    it("Should revert when user is not allowed to create", async function () {
      // Ensure user is not allowed
      const isAllowed = await mockEVMAccessControl.read.isAllowedToCreate([
        notAllowedUser.account.address,
      ]);
      assert.equal(isAllowed, false);

      // Prepare calldata: salt (32 bytes) + bytecode
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [salt, counterBytecode],
      ) as `0x${string}`;

      await assert.rejects(
        notAllowedUser.sendTransaction({
          to: ddp.address,
          data: calldata,
        }),
        /NotAllowedToCreate/,
      );
    });

    it("Should allow allowed user to deploy Counter", async function () {
      // Allow user in EVMAccessControl
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [allowedUser.account.address, true],
      });

      // Prepare calldata: salt (32 bytes) + bytecode
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [salt, counterBytecode],
      ) as `0x${string}`;

      // Calculate expected address
      const expectedAddress = calculateCreate2Address(
        ddp.address as `0x${string}`,
        salt as `0x${string}`,
        counterBytecode,
      );

      const tx = allowedUser.sendTransaction({
        to: ddp.address,
        data: calldata,
      });

      // verify the event is emitted
      await viem.assertions.emitWithArgs(tx, ddp, "Deployed", [
        getAddress(expectedAddress),
      ]);

      // Verify the deployed contract is Counter
      const counter = await viem.getContractAt("Counter", expectedAddress);
      const initialValue = await counter.read.x();
      assert.equal(initialValue, 0n);
    });

    it("Should revert when deploying to same address with same salt", async function () {
      // Allow user in EVMAccessControl
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [allowedUser.account.address, true],
      });

      // Deploy 1st contract
      const salt1 = toHex(toBytes("deterministic-salt"), {
        size: 32,
      }) as `0x${string}`;
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [salt1, counterBytecode],
      ) as `0x${string}`;
      const tx1 = await allowedUser.sendTransaction({
        to: ddp.address,
        data: calldata,
      });
      const receipt1 = await publicClient.waitForTransactionReceipt({
        hash: tx1,
      });
      assert.equal(receipt1.status, "success");

      // Second deployment with same salt should fail
      await assert.rejects(
        allowedUser.sendTransaction({
          to: ddp.address,
          data: calldata,
        }),
        /Transaction ran out of gas/,
      );
    });

    it("Should revert when calldata is too short", async function () {
      // Allow user in EVMAccessControl
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [notAllowedUser.account.address, true],
      });

      // Only 32 bytes (salt), no bytecode
      const shortCalldata = salt as `0x${string}`;

      await assert.rejects(
        notAllowedUser.sendTransaction({
          to: ddp.address,
          data: shortCalldata,
        }),
        /InvalidAddress/,
      );
    });

    it("Should forward value to the deployed contract", async function () {
      // Allow user in EVMAccessControl
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [notAllowedUser.account.address, true],
      });

      const uniqueSalt = toHex(toBytes(`refund-test-${Date.now()}`), {
        size: 32,
      }) as `0x${string}`;
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [uniqueSalt, counterBytecode],
      ) as `0x${string}`;

      const sendValue = 1000000000000000n; // 0.001 ETH
      const tx = await notAllowedUser.sendTransaction({
        to: ddp.address,
        data: calldata,
        value: sendValue,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx,
      });
      assert.equal(receipt.status, "success");

      // Verify the ddp contract doesn't have any balance
      const balance = await publicClient.getBalance({
        address: ddp.address,
      });
      assert.equal(balance, 0n);

      // Verify the deployed contract has the balance
      const expectedAddress = calculateCreate2Address(
        ddp.address as `0x${string}`,
        uniqueSalt,
        counterBytecode,
      );
      const deployedContractBalance = await publicClient.getBalance({
        address: getAddress(expectedAddress),
      });
      assert.equal(deployedContractBalance, sendValue);
    });

    it("Should deploy to deterministic addresses", async function () {
      // Allow user in EVMAccessControl
      await mockEVMAccessControl.write.updateCreateAllowList({
        args: [allowedUser.account.address, true],
      });

      const deterministicSalt = toHex(toBytes("deterministic-test"), {
        size: 32,
      }) as `0x${string}`;

      // Calculate expected address
      const expectedAddress = calculateCreate2Address(
        ddp.address as `0x${string}`,
        deterministicSalt,
        counterBytecode,
      );

      // Deploy contract
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [deterministicSalt, counterBytecode],
      ) as `0x${string}`;

      const tx = await allowedUser.sendTransaction({
        to: ddp.address,
        data: calldata,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx,
      });
      assert.equal(receipt.status, "success");

      // Verify deployed address matches expected
      const counter = await viem.getContractAt("Counter", expectedAddress);
      const value = await counter.read.x();
      assert.equal(
        value,
        0n,
        "Contract should be deployed at expected address",
      );
    });
  });

  describe("Constructor", function () {
    it("Should revert when EVMAccessControl address is zero", async function () {
      await assert.rejects(
        viem.deployContract("OasysDDP", [
          "0x0000000000000000000000000000000000000000",
        ]),
        /InvalidAddress/,
      );
    });

    it("Should set EVM_ACCESS_CONTROL correctly", async function () {
      const evmAccessControlAddress = await ddp.read.EVM_ACCESS_CONTROL();
      assert.equal(
        evmAccessControlAddress.toLowerCase(),
        mockEVMAccessControl.address.toLowerCase(),
        "EVM_ACCESS_CONTROL should match deployed MockEVMAccessControl",
      );
    });
  });
});
