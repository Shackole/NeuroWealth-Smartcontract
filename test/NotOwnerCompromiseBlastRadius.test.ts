import { expect, assert } from "chai";
import { MockNeuroWealthVault, Signer } from "./mockchain";

describe("NotOwner Compromise - Blast Radius Security Tests", function () {
  let vault: MockNeuroWealthVault;
  let owner: Signer;
  let agent: Signer;
  let attacker: Signer;
  let user1: Signer;
  let user2: Signer;

  beforeEach(() => {
    owner = { address: "GB_OWNER_73JSLQWEXAMPLENEUVALTKEY0000000000000000000001" };
    agent = { address: "GA_AGENT_99KLPOQWEXAMPLENEUVALTKEY0000000000000000000002" };
    attacker = { address: "GC_ATTACKER_BADKEYEXAMPLENEUVALTKEY00000000000000000003" };
    user1 = { address: "GD_USER1_VICTIM1EXAMPLENEUVALTKEY00000000000000000004" };
    user2 = { address: "GE_USER2_VICTIM2EXAMPLENEUVALTKEY00000000000000000005" };

    vault = new MockNeuroWealthVault(owner, agent);
  });

  describe("Threat Model: Non-Owner / Attacker tries to call Owner-only functions", function () {
    it("verify non-owner cannot call set_caps", async () => {
      try {
        await vault.connect(attacker).set_caps(100n, 1000n);
        assert.fail("set_caps should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("verify non-owner cannot call set_blend_pool", async () => {
      try {
        await vault.connect(attacker).set_blend_pool("CA_FAKE_BLEND_POOL_ADDRESS");
        assert.fail("set_blend_pool should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("verify non-owner cannot call set_dex_pool", async () => {
      try {
        await vault.connect(attacker).set_dex_pool("CB_FAKE_DEX_POOL_ADDRESS");
        assert.fail("set_dex_pool should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("verify non-owner cannot call schedule_upgrade", async () => {
      const fakeWasm = "0x" + "a".repeat(64);
      try {
        await vault.connect(attacker).schedule_upgrade(fakeWasm);
        assert.fail("schedule_upgrade should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("verify non-owner cannot call execute_upgrade", async () => {
      // First schedule upgrade legitimately as owner
      const fakeWasm = "0x" + "b".repeat(64);
      await vault.connect(owner).schedule_upgrade(fakeWasm);

      // Non-owner attempts to execute
      try {
        await vault.connect(attacker).execute_upgrade();
        assert.fail("execute_upgrade should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("verify non-owner cannot call cancel_upgrade", async () => {
      const fakeWasm = "0x" + "c".repeat(64);
      await vault.connect(owner).schedule_upgrade(fakeWasm);

      // Non-owner attempts to cancel
      try {
        await vault.connect(attacker).cancel_upgrade();
        assert.fail("cancel_upgrade should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("verify non-owner cannot call update_agent", async () => {
      const rogueAgent = "GC_ROGUE_AGENT_KEY";
      try {
        await vault.connect(attacker).update_agent(rogueAgent);
        assert.fail("update_agent should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
      expect(vault.getAgent()).to.equal(agent.address);
    });

    it("verify non-owner cannot call set_rate_limit", async () => {
      try {
        await vault.connect(attacker).set_rate_limit("deposit", 1000, 10);
        assert.fail("set_rate_limit should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
      expect(vault.getRateLimit("deposit")).to.be.undefined;
    });

    it("verify non-owner cannot call set_guardian", async () => {
      const rogueGuardian = "GC_ROGUE_GUARDIAN";
      try {
        await vault.connect(attacker).set_guardian(rogueGuardian);
        assert.fail("set_guardian should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
      expect(vault.getGuardian()).to.be.null;
    });

    it("verify non-owner cannot pause or unpause vault", async () => {
      try {
        await vault.connect(attacker).pause();
        assert.fail("pause should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
      expect(vault.isPaused()).to.be.false;

      await vault.connect(owner).pause();
      try {
        await vault.connect(attacker).unpause();
        assert.fail("unpause should have been rejected for non-owner");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
      expect(vault.isPaused()).to.be.true;
    });
  });

  describe("User Blast Radius: User isolation & unauthorized fund access", function () {
    beforeEach(async () => {
      // User1 deposits 100 tokens, User2 deposits 50 tokens
      await vault.connect(user1).deposit(100n);
      await vault.connect(user2).deposit(50n);
    });

    it("verify user cannot withdraw another user's funds (partial withdraw)", async () => {
      try {
        // Attacker attempts to withdraw user1's funds
        await vault.connect(attacker).withdraw(user1.address, 50n);
        assert.fail("Attacker should not be able to withdraw user1's funds");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }

      // User1 balance must remain intact
      expect(await vault.getBalance(user1.address)).to.equal(100n);
      expect(await vault.getBalance(attacker.address)).to.equal(0n);
    });

    it("verify user cannot withdraw another user's funds (withdraw_all)", async () => {
      try {
        // User2 attempts to withdraw all user1's funds
        await vault.connect(user2).withdraw_all(user1.address);
        assert.fail("User2 should not be able to withdraw_all user1's funds");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }

      expect(await vault.getBalance(user1.address)).to.equal(100n);
      expect(await vault.getBalance(user2.address)).to.equal(50n);
    });

    it("verify user cannot emergency-withdraw another user's funds", async () => {
      try {
        await vault.connect(attacker).emergency_withdraw(user1.address, 100n);
        assert.fail("Attacker should not be able to emergency_withdraw user1's funds");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }

      expect(await vault.getBalance(user1.address)).to.equal(100n);
    });

    it("verify direct balance manipulation attempts are rejected", async () => {
      try {
        await vault.connect(attacker).forceSetBalance(user1.address, 0n);
        assert.fail("forceSetBalance should always fail");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }

      expect(await vault.getBalance(user1.address)).to.equal(100n);
    });
  });

  describe("Negative Testing Integrity: failure to unauthorize MUST fail the test", function () {
    it("reverts on all unauthorized attempts and leaves contract state frozen", async () => {
      const capsBefore = vault.getCaps();
      const agentBefore = vault.getAgent();
      const blendBefore = vault.getBlendPool();
      const dexBefore = vault.getDexPool();

      // Batch attempt unauthorized calls
      const calls = [
        () => vault.connect(attacker).set_caps(1n, 2n),
        () => vault.connect(attacker).set_blend_pool("0x1"),
        () => vault.connect(attacker).set_dex_pool("0x2"),
        () => vault.connect(attacker).schedule_upgrade("0x3"),
        () => vault.connect(attacker).update_agent("0x4"),
        () => vault.connect(attacker).set_guardian("0x5"),
        () => vault.connect(attacker).set_rate_limit("pool", 5, 5),
      ];

      for (const call of calls) {
        let threw = false;
        try {
          await call();
        } catch (err: any) {
          threw = true;
          expect(err.message).to.include("Unauthorized");
        }
        expect(threw, "Unauthorized call unexpectedly succeeded").to.be.true;
      }

      // Assert state didn't change
      expect(vault.getCaps()).to.deep.equal(capsBefore);
      expect(vault.getAgent()).to.equal(agentBefore);
      expect(vault.getBlendPool()).to.equal(blendBefore);
      expect(vault.getDexPool()).to.equal(dexBefore);
    });
  });
});
