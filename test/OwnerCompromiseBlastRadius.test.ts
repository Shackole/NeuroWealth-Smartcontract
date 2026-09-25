import { expect, assert } from "chai";
import { MockNeuroWealthVault, Signer } from "./mockchain";

describe("Owner Compromise - Blast Radius Security Tests", function () {
  let vault: MockNeuroWealthVault;
  let owner: Signer;
  let agent: Signer;
  let attacker: Signer;
  let user1: Signer;
  let user2: Signer;

  beforeEach(() => {
    owner = { address: "GB_OWNER_COMPROMISED_KEY00000000000000000000000000000001" };
    agent = { address: "GA_AGENT_SAFE_ISOLATED_KEY00000000000000000000000000000002" };
    attacker = { address: "GC_ATTACKER_KEY0000000000000000000000000000000000000003" };
    user1 = { address: "GD_USER1_KEY0000000000000000000000000000000000000000000004" };
    user2 = { address: "GE_USER2_KEY0000000000000000000000000000000000000000000005" };

    vault = new MockNeuroWealthVault(owner, agent);
  });

  describe("Threat Model: Owner has been compromised", function () {
    // Owner CAN do - intended behaviors
    describe("Owner CAN perform authorized governance actions", function () {
      it("should allow owner to pause contract", async () => {
        await vault.connect(owner).pause();
        expect(vault.isPaused()).to.be.true;

        const events = vault.getEvents().filter(e => e.topic === "Paused");
        expect(events.length).to.equal(1);
        expect(events[0].args[0]).to.equal(owner.address);
      });

      it("should allow owner to update caps configuration", async () => {
        const newCap = 75_000_000_000n;
        await vault.connect(owner).set_caps(newCap, newCap * 2n);
        expect(vault.getCaps().userDepositCap).to.equal(newCap);
      });

      it("should allow owner to set rate limits", async () => {
        await vault.connect(owner).set_rate_limit("rebalance", 5, 100);
        const limit = vault.getRateLimit("rebalance");
        expect(limit).to.deep.equal({ maxCalls: 5, windowLedgers: 100 });
      });

      it("should allow owner to appoint guardian", async () => {
        const guardian = "GG_GUARDIAN_ADDRESS";
        await vault.connect(owner).set_guardian(guardian);
        expect(vault.getGuardian()).to.equal(guardian);
      });
    });

    // Owner CANNOT do - blast radius is limited
    describe("Owner CANNOT breach trust model (blast radius limited)", function () {
      it("verify owner CANNOT call rebalance (agent-only)", async () => {
        try {
          await vault.connect(owner).rebalance("blend", 800n, 1000n);
          assert.fail("Owner should NOT be able to call rebalance");
        } catch (err: any) {
          expect(err.message).to.include("Unauthorized");
          expect(err.message).to.include("agent");
        }
        expect(vault.getCurrentProtocol()).to.equal("none");
      });

      it("verify owner CANNOT call harvest (agent-only)", async () => {
        try {
          await vault.connect(owner).harvest(100n);
          assert.fail("Owner should NOT be able to call harvest");
        } catch (err: any) {
          expect(err.message).to.include("Unauthorized");
          expect(err.message).to.include("agent");
        }
      });

      it("verify owner CANNOT steal user funds or withdraw on behalf of users", async () => {
        await vault.connect(user1).deposit(100n);

        try {
          // Compromised owner attempts to withdraw user1's funds
          await vault.connect(owner).withdraw(user1.address, 100n);
          assert.fail("Owner should NOT be able to withdraw user1 funds");
        } catch (err: any) {
          expect(err.message).to.include("Unauthorized");
        }

        expect(await vault.getBalance(user1.address)).to.equal(100n);
        expect(await vault.getBalance(owner.address)).to.equal(0n);
      });

      it("verify owner CANNOT withdraw_all on behalf of users", async () => {
        await vault.connect(user1).deposit(100n);

        try {
          await vault.connect(owner).withdraw_all(user1.address);
          assert.fail("Owner should NOT be able to withdraw_all user1 funds");
        } catch (err: any) {
          expect(err.message).to.include("Unauthorized");
        }

        expect(await vault.getBalance(user1.address)).to.equal(100n);
      });

      it("verify owner CANNOT modify user balances directly", async () => {
        await vault.connect(user1).deposit(100n);

        try {
          await vault.connect(owner).forceSetBalance(user1.address, 0n);
          assert.fail("Owner should NOT be able to force set balance");
        } catch (err: any) {
          expect(err.message).to.include("Unauthorized");
        }

        expect(await vault.getBalance(user1.address)).to.equal(100n);
      });

      it("verify owner CANNOT bypass withdrawal limits", async () => {
        await vault.connect(user1).deposit(1000n);

        try {
          await vault.connect(owner).overrideWithdrawalLimit(10000n);
          assert.fail("Owner should NOT be able to override withdrawal limits");
        } catch (err: any) {
          expect(err.message).to.include("Unauthorized");
        }
      });
    });

    describe("Privileged abuse scenarios and user protection", function () {
      it("owner compromise should NOT affect other users' funds", async () => {
        await vault.connect(user1).deposit(500n);
        await vault.connect(user2).deposit(300n);

        const user2BalanceBefore = await vault.getBalance(user2.address);

        // Compromised owner executes pause
        await vault.connect(owner).pause();

        // User balance must remain unchanged
        expect(await vault.getBalance(user2.address)).to.equal(user2BalanceBefore);
      });

      it("emergency pause should not lock user withdrawals permanently", async () => {
        await vault.connect(user1).deposit(100n);

        // Compromised owner pauses contract
        await vault.connect(owner).pause();
        expect(vault.isPaused()).to.be.true;

        // Normal withdraw blocked during pause
        try {
          await vault.connect(user1).withdraw(user1.address, 100n);
          assert.fail("Withdraw should be blocked during pause");
        } catch (err: any) {
          expect(err.message).to.include("paused");
        }

        // Emergency withdrawal mechanism remains available for the user
        await vault.connect(user1).emergency_withdraw(user1.address, 50n);
        expect(await vault.getBalance(user1.address)).to.equal(50n);

        // Once unpaused (e.g. by recovered owner or guardian), user can withdraw freely
        await vault.connect(owner).unpause();
        await vault.connect(user1).withdraw(user1.address, 50n);
        expect(await vault.getBalance(user1.address)).to.equal(0n);
      });
    });

    describe("Blast Radius - Attack Surface Limits & Auditing", function () {
      it("owner actions should be time-delayed if critical", async () => {
        expect(vault.CRITICAL_DELAY).to.be.greaterThan(0);
      });

      it("sensitive functions should emit audit events", async () => {
        await vault.connect(owner).pause();
        const pauseEvents = vault.getEvents().filter(e => e.topic === "Paused");
        expect(pauseEvents.length).to.be.at.least(1);
        expect(pauseEvents[0].args[0]).to.equal(owner.address);

        await vault.connect(owner).set_caps(100n, 200n);
        const capsEvents = vault.getEvents().filter(e => e.topic === "CapsUpdated");
        expect(capsEvents.length).to.be.at.least(1);
      });
    });
  });
});
