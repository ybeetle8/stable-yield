const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HelloWorld", function () {
  let helloWorld;
  let owner;
  let addr1;

  beforeEach(async function () {
    console.log("🚀 Starting test setup...");
    [owner, addr1] = await ethers.getSigners();
    console.log(`👤 Owner address: ${owner.address}`);
    console.log(`👤 Addr1 address: ${addr1.address}`);
    
    const HelloWorld = await ethers.getContractFactory("HelloWorld");
    console.log("📄 Contract factory created");
    helloWorld = await HelloWorld.deploy("Hello, World!");
    console.log("📦 Contract deployed, waiting for confirmation...");
    await helloWorld.waitForDeployment();
    console.log(`✅ Contract deployed at: ${await helloWorld.getAddress()}`);
  });

  describe("Deployment", function () {
    it("Should set the initial message", async function () {
      console.log("📝 Testing initial message...");
      const message = await helloWorld.getMessage();
      console.log(`Current message: "${message}"`);
      expect(message).to.equal("Hello, World!");
      console.log("✅ Initial message test passed");
    });

    it("Should set the owner", async function () {
      console.log("👤 Testing owner address...");
      const contractOwner = await helloWorld.getOwner();
      console.log(`Contract owner: ${contractOwner}`);
      console.log(`Expected owner: ${owner.address}`);
      expect(contractOwner).to.equal(owner.address);
      console.log("✅ Owner test passed");
    });
  });

  describe("Message updates", function () {
    it("Should update the message", async function () {
      console.log("🔄 Testing message update...");
      const newMessage = "Hello, BSC!";
      console.log(`Setting new message: "${newMessage}"`);
      await helloWorld.setMessage(newMessage);
      const updatedMessage = await helloWorld.getMessage();
      console.log(`Updated message: "${updatedMessage}"`);
      expect(updatedMessage).to.equal(newMessage);
      console.log("✅ Message update test passed");
    });

    it("Should emit MessageChanged event", async function () {
      console.log("📡 Testing event emission...");
      const newMessage = "Hello, chy Hardhat!";
      console.log(`Setting message to trigger event: "${newMessage}"`);
      console.log(`Expected event args: message="${newMessage}", sender="${owner.address}"`);
      await expect(helloWorld.setMessage(newMessage))
        .to.emit(helloWorld, "MessageChanged")
        .withArgs(newMessage, owner.address);
      console.log("✅ Event emission test passed");
    });

    it("Should allow anyone to change the message", async function () {
      console.log("👥 Testing message change by different address...");
      const newMessage = "Changed by addr1";
      console.log(`Addr1 (${addr1.address}) setting message: "${newMessage}"`);
      await helloWorld.connect(addr1).setMessage(newMessage);
      const finalMessage = await helloWorld.getMessage();
      console.log(`Final message: "${finalMessage}"`);
      expect(finalMessage).to.equal(newMessage);
      console.log("✅ Multi-user message change test passed");
    });
  });
});