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
  let counterBytecode: `0x${string}`;
  let owner: any;
  let whitelistedUser: any;
  let nonWhitelistedUser: any;

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

  // Deploy OasysDDP and get Counter bytecode
  beforeEach(async function () {
    // Get test accounts
    const [ownerAccount, whitelistedUserAccount, nonWhitelistedUserAccount] =
      await viem.getWalletClients();
    owner = ownerAccount;
    whitelistedUser = whitelistedUserAccount;
    nonWhitelistedUser = nonWhitelistedUserAccount;

    // Explicitly deploy from owner account to ensure owner is set correctly
    ddp = await viem.deployContract("OasysDDP");

    // Verify owner is set correctly
    const contractOwner = await ddp.read.owner();
    assert.equal(
      contractOwner.toLowerCase(),
      owner.account.address.toLowerCase(),
      "Owner should be set to deployer",
    );

    // Get Counter bytecode from artifacts
    const counterArtifact = await artifacts.readArtifact("Counter");
    counterBytecode = counterArtifact.bytecode as `0x${string}`;
  });

  describe("Whitelist Management", function () {
    it("Should allow owner to whitelist addresses", async function () {
      await ddp.write.bulkWhitelist({
        args: [[whitelistedUser.account.address]],
      });

      const isWhitelisted = await ddp.read.isWhitelisted([
        whitelistedUser.account.address,
      ]);
      assert.equal(isWhitelisted, true);
    });

    it("Should emit BulkWhitelisted event", async function () {
      const tx = await ddp.write.bulkWhitelist({
        args: [[nonWhitelistedUser.account.address]],
      });

      await viem.assertions.emitWithArgs(tx, ddp, "BulkWhitelisted", [
        [getAddress(nonWhitelistedUser.account.address)],
      ]);
    });

    it("Should revert when whitelisting empty array", async function () {
      await assert.rejects(
        ddp.write.bulkWhitelist({ args: [[]] }),
        /EmptyArray/,
      );
    });

    it("Should revert when whitelisting zero address", async function () {
      await assert.rejects(
        ddp.write.bulkWhitelist({
          args: [["0x0000000000000000000000000000000000000000"]],
        }),
        /InvalidAddress/,
      );
    });

    it("Should revert when whitelisting already whitelisted address", async function () {
      await ddp.write.bulkWhitelist({
        args: [[whitelistedUser.account.address]],
      });
      await assert.rejects(
        ddp.write.bulkWhitelist({
          args: [[whitelistedUser.account.address]],
        }),
        /AlreadyWhitelisted/,
      );
    });

    it("Should allow owner to unwhitelist addresses", async function () {
      await ddp.write.bulkWhitelist({
        args: [[whitelistedUser.account.address]],
      });
      await ddp.write.bulkUnwhitelist({
        args: [[whitelistedUser.account.address]],
      });

      const isWhitelisted = await ddp.read.isWhitelisted([
        whitelistedUser.account.address,
      ]);
      assert.equal(isWhitelisted, false);
    });

    it("Should emit BulkUnwhitelisted event", async function () {
      // First whitelist an address
      await ddp.write.bulkWhitelist({
        args: [[nonWhitelistedUser.account.address]],
      });

      const tx = await ddp.write.bulkUnwhitelist({
        args: [[nonWhitelistedUser.account.address]],
      });

      await viem.assertions.emitWithArgs(tx, ddp, "BulkUnwhitelisted", [
        [getAddress(nonWhitelistedUser.account.address)],
      ]);
    });

    it("Should revert when unwhitelisting non-whitelisted address", async function () {
      const randomAddress = "0x1234567890123456789012345678901234567890";
      await assert.rejects(
        ddp.write.bulkUnwhitelist({ args: [[randomAddress]] }),
        /NotWhitelisted/,
      );
    });

    it("Sould revert when non-owner tries to whitelist", async function () {
      await assert.rejects(
        ddp.write.bulkWhitelist({
          args: [[nonWhitelistedUser.account.address]],
          account: nonWhitelistedUser.account,
        }),
        /OwnableUnauthorizedAccount/,
      );
    });

    it("Should return all whitelisted addresses", async function () {
      await ddp.write.bulkWhitelist({
        args: [[nonWhitelistedUser.account.address]],
      });
      const addresses = await ddp.read.getWhitelistedAddresses();
      assert.ok(Array.isArray(addresses));
      assert.ok(addresses.length > 0);
    });

    it("Should whitelist multiple addresses in a single call", async function () {
      // Get additional test accounts
      const wallets = await viem.getWalletClients();
      const addr1 = wallets[3]?.account.address || "0x1111111111111111111111111111111111111111";
      const addr2 = wallets[4]?.account.address || "0x2222222222222222222222222222222222222222";
      const addr3 = wallets[5]?.account.address || "0x3333333333333333333333333333333333333333";

      // Whitelist multiple addresses at once
      await ddp.write.bulkWhitelist({
        args: [[addr1, addr2, addr3]],
      });

      // Verify all addresses are whitelisted
      const isAddr1Whitelisted = await ddp.read.isWhitelisted([addr1]);
      const isAddr2Whitelisted = await ddp.read.isWhitelisted([addr2]);
      const isAddr3Whitelisted = await ddp.read.isWhitelisted([addr3]);
      
      assert.equal(isAddr1Whitelisted, true, "Address 1 should be whitelisted");
      assert.equal(isAddr2Whitelisted, true, "Address 2 should be whitelisted");
      assert.equal(isAddr3Whitelisted, true, "Address 3 should be whitelisted");

      // Verify all addresses are in the array
      const addresses = await ddp.read.getWhitelistedAddresses();
      assert.ok(addresses.includes(getAddress(addr1)), "Address 1 should be in the array");
      assert.ok(addresses.includes(getAddress(addr2)), "Address 2 should be in the array");
      assert.ok(addresses.includes(getAddress(addr3)), "Address 3 should be in the array");
    });

    it("Should unwhitelist multiple addresses in a single call", async function () {
      // Get additional test accounts
      const wallets = await viem.getWalletClients();
      const addr1 = wallets[3]?.account.address || "0x1111111111111111111111111111111111111111";
      const addr2 = wallets[4]?.account.address || "0x2222222222222222222222222222222222222222";
      const addr3 = wallets[5]?.account.address || "0x3333333333333333333333333333333333333333";

      // First whitelist multiple addresses
      await ddp.write.bulkWhitelist({
        args: [[addr1, addr2, addr3]],
      });

      // Verify they are whitelisted
      assert.equal(await ddp.read.isWhitelisted([addr1]), true);
      assert.equal(await ddp.read.isWhitelisted([addr2]), true);
      assert.equal(await ddp.read.isWhitelisted([addr3]), true);

      // Unwhitelist multiple addresses at once
      await ddp.write.bulkUnwhitelist({
        args: [[addr1, addr2, addr3]],
      });

      // Verify all addresses are no longer whitelisted
      const isAddr1Whitelisted = await ddp.read.isWhitelisted([addr1]);
      const isAddr2Whitelisted = await ddp.read.isWhitelisted([addr2]);
      const isAddr3Whitelisted = await ddp.read.isWhitelisted([addr3]);
      
      assert.equal(isAddr1Whitelisted, false, "Address 1 should not be whitelisted");
      assert.equal(isAddr2Whitelisted, false, "Address 2 should not be whitelisted");
      assert.equal(isAddr3Whitelisted, false, "Address 3 should not be whitelisted");

      // Verify the whitelist array is empty
      const addresses = await ddp.read.getWhitelistedAddresses();
      assert.equal(addresses.length, 0, "Whitelist should be empty");
    });

    it("Should correctly handle swap-and-pop when unwhitelisting non-last address", async function () {
      // Get additional test accounts
      const wallets = await viem.getWalletClients();
      const addr1 = wallets[3]?.account.address || "0x1111111111111111111111111111111111111111";
      const addr2 = wallets[4]?.account.address || "0x2222222222222222222222222222222222222222";
      const addr3 = wallets[5]?.account.address || "0x3333333333333333333333333333333333333333";
      const addr4 = wallets[6]?.account.address || "0x4444444444444444444444444444444444444444";

      // Whitelist addresses in order
      await ddp.write.bulkWhitelist({
        args: [[addr1, addr2, addr3, addr4]],
      });

      // Verify initial state
      let addresses = await ddp.read.getWhitelistedAddresses();
      assert.equal(addresses.length, 4, "Should have 4 whitelisted addresses");
      assert.equal(addresses[0], getAddress(addr1), "First address should be addr1");
      assert.equal(addresses[1], getAddress(addr2), "Second address should be addr2");
      assert.equal(addresses[2], getAddress(addr3), "Third address should be addr3");
      assert.equal(addresses[3], getAddress(addr4), "Fourth address should be addr4");

      // Unwhitelist the second address (not the last one)
      await ddp.write.bulkUnwhitelist({
        args: [[addr2]],
      });

      // Verify swap-and-pop logic: addr2 should be removed and addr4 should take its place
      addresses = await ddp.read.getWhitelistedAddresses();
      assert.equal(addresses.length, 3, "Should have 3 whitelisted addresses after removal");
      assert.equal(addresses[0], getAddress(addr1), "First address should still be addr1");
      assert.equal(addresses[1], getAddress(addr4), "Second address should now be addr4 (swapped from last position)");
      assert.equal(addresses[2], getAddress(addr3), "Third address should still be addr3");

      // Verify addr2 is no longer whitelisted
      const isAddr2Whitelisted = await ddp.read.isWhitelisted([addr2]);
      assert.equal(isAddr2Whitelisted, false, "addr2 should not be whitelisted");

      // Verify other addresses are still whitelisted
      assert.equal(await ddp.read.isWhitelisted([addr1]), true, "addr1 should still be whitelisted");
      assert.equal(await ddp.read.isWhitelisted([addr3]), true, "addr3 should still be whitelisted");
      assert.equal(await ddp.read.isWhitelisted([addr4]), true, "addr4 should still be whitelisted");

      // Test unwhitelisting the first address to further verify swap-and-pop
      await ddp.write.bulkUnwhitelist({
        args: [[addr1]],
      });

      addresses = await ddp.read.getWhitelistedAddresses();
      assert.equal(addresses.length, 2, "Should have 2 whitelisted addresses");
      assert.equal(addresses[0], getAddress(addr3), "First address should now be addr3 (swapped from last position)");
      assert.equal(addresses[1], getAddress(addr4), "Second address should still be addr4");
    });
  });

  describe("Whitelist Bypass", function () {
    it("Should allow owner to disable whitelist", async function () {
      await ddp.write.setDisableWhitelist({ args: [true] });
      const disabled = await ddp.read.disableWhitelist();
      assert.equal(disabled, true);
    });

    it("Should allow owner to enable whitelist", async function () {
      await ddp.write.setDisableWhitelist({ args: [false] });
      const disabled = await ddp.read.disableWhitelist();
      assert.equal(disabled, false);
    });

    it("Should revert when non-owner tries to disable whitelist", async function () {
      await assert.rejects(
        ddp.write.setDisableWhitelist({
          args: [true],
          account: whitelistedUser.account,
        }),
        /OwnableUnauthorizedAccount/,
      );
    });
  });

  describe("Deterministic Deployment (Fallback)", function () {
    const salt = toHex(toBytes("test-salt-12345"), {
      size: 32,
    }) as `0x${string}`;

    it("Should revert when non-whitelisted user tries to deploy (whitelist enabled)", async function () {
      // Prepare calldata: salt (32 bytes) + bytecode
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [salt, counterBytecode],
      ) as `0x${string}`;

      await assert.rejects(
        nonWhitelistedUser.sendTransaction({
          to: ddp.address,
          data: calldata,
        }),
        /NotWhitelisted/,
      );
    });

    it("Should allow whitelisted user to deploy Counter", async function () {
      await ddp.write.bulkWhitelist({
        args: [[whitelistedUser.account.address]],
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

      const tx = whitelistedUser.sendTransaction({
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
      await ddp.write.bulkWhitelist({
        args: [[whitelistedUser.account.address]],
      });

      // Deploy 1st contract
      const salt1 = toHex(toBytes("deterministic-salt"), {
        size: 32,
      }) as `0x${string}`;
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [salt1, counterBytecode],
      ) as `0x${string}`;
      const tx1 = await whitelistedUser.sendTransaction({
        to: ddp.address,
        data: calldata,
      });
      const receipt1 = await publicClient.waitForTransactionReceipt({
        hash: tx1,
      });
      assert.equal(receipt1.status, "success");

      // Second deployment with same salt should fail
      await assert.rejects(
        whitelistedUser.sendTransaction({
          to: ddp.address,
          data: calldata,
        }),
        /Transaction ran out of gas/,
      );
    });

    it("Should allow anyone to deploy when whitelist is disabled", async function () {
      // Disable whitelist
      await ddp.write.setDisableWhitelist({ args: [true] });

      const uniqueSalt = toHex(toBytes(`salt-${Date.now()}`), {
        size: 32,
      }) as `0x${string}`;
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [uniqueSalt, counterBytecode],
      ) as `0x${string}`;

      // Calculate expected address
      const expectedAddress = calculateCreate2Address(
        ddp.address as `0x${string}`,
        uniqueSalt,
        counterBytecode,
      );

      const tx = await nonWhitelistedUser.sendTransaction({
        to: ddp.address,
        data: calldata,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      assert.equal(receipt.status, "success");

      // Verify deployment
      const counter = await viem.getContractAt("Counter", expectedAddress);
      const value = await counter.read.x();
      assert.equal(value, 0n);
    });

    it("Should revert when calldata is too short", async function () {
      await ddp.write.setDisableWhitelist({ args: [true] });

      // Only 32 bytes (salt), no bytecode
      const shortCalldata = salt as `0x${string}`;

      await assert.rejects(
        nonWhitelistedUser.sendTransaction({
          to: ddp.address,
          data: shortCalldata,
        }),
        /InvalidAddress/,
      );
    });

    it("Should fund the deployed contract", async function () {
      await ddp.write.setDisableWhitelist({ args: [true] });

      const uniqueSalt = toHex(toBytes(`refund-test-${Date.now()}`), {
        size: 32,
      }) as `0x${string}`;
      const calldata = encodePacked(
        ["bytes32", "bytes"],
        [uniqueSalt, counterBytecode],
      ) as `0x${string}`;

      const sendValue = 1000000000000000n; // 0.001 ETH
      const tx = await nonWhitelistedUser.sendTransaction({
        to: ddp.address,
        data: calldata,
        value: sendValue,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx,
      });
      assert.equal(receipt.status, "success");

      // Verify the ddp contract don't have any balance
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
  });

  describe("Ownership", function () {
    it("Should have correct owner", async function () {
      const contractOwner = await ddp.read.owner();
      assert.equal(
        contractOwner.toLowerCase(),
        owner.account.address.toLowerCase(),
      );
    });

    it("Should transfer ownership", async function () {
      await ddp.write.transferOwnership({
        args: [whitelistedUser.account.address],
      });
      const newOwner = await ddp.read.owner();
      assert.equal(
        newOwner.toLowerCase(),
        whitelistedUser.account.address.toLowerCase(),
      );
    });

    it("Should revert when non-owner tries to transfer ownership", async function () {
      await assert.rejects(
        ddp.write.transferOwnership({
          args: [whitelistedUser.account.address],
          account: nonWhitelistedUser.account,
        }),
        /OwnableUnauthorizedAccount/,
      );
    });
  });
});
