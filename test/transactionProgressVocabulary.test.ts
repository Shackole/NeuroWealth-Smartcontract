import { expect } from "chai";
import {
  TransactionProgressStatus,
  TRANSACTION_VOCABULARY,
  TRANSACTION_LIFECYCLE_STEPS,
  getVocabulary,
  buildStandardSteps,
  isLedgerConfirmed,
  isDelayedConfirmation,
  isTerminalFailure,
  formatStellarFee,
  formatAddressOrHash,
  getExplorerUrl,
  TransactionContext,
} from "../frontend/src/lib/transactionProgress";

describe("Transaction Progress Vocabulary & Lifecycle Tests (#491)", function () {
  const mockContext: TransactionContext = {
    operation: "deposit" as const,
    assetSymbol: "USDC",
    amount: 500,
    sharesEstimate: 480.7692,
    sharesSymbol: "NV-SHARES",
    networkFee: "< 0.00001 XLM",
    networkName: "Stellar Testnet",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcEndpoint: "https://soroban-testnet.stellar.org",
    contractId: "CDLZFC3SYJYD7M6LJEFAPCHRLHAFKP6WYTHRF3EGO5CYD3EP4GZGM37T",
    userPublicKey: "GB_USER1_VICTIM1EXAMPLENEUVALTKEY00000000000000000004",
    txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    ledgerSequence: 52194812,
    errorMessage: undefined,
  };

  describe("Status Vocabulary Definitions", function () {
    const allStatuses = [
      "review",
      "signature_request",
      "submission",
      "confirmation",
      "delayed",
      "confirmed",
      "failure",
    ] as const;

    it("should define complete vocabulary items for all 7 standard statuses", function () {
      for (const status of allStatuses) {
        const vocab = getVocabulary(status, mockContext);
        expect(vocab).to.be.an("object");
        expect(vocab.status).to.equal(status);
        expect(vocab.name).to.be.a("string").that.is.not.empty;
        expect(vocab.label).to.be.a("string").that.is.not.empty;
        expect(vocab.iconName).to.be.a("string").that.is.not.empty;
        expect(vocab.colorClass).to.be.a("string").that.is.not.empty;
        expect(vocab.bgClass).to.be.a("string").that.is.not.empty;
        expect(vocab.borderClass).to.be.a("string").that.is.not.empty;
        expect(vocab.title).to.be.a("string").that.is.not.empty;
        expect(vocab.subText).to.be.a("string").that.is.not.empty;
        expect(vocab.ariaLive).to.be.oneOf(["polite", "assertive"]);
        expect(vocab.ariaLabel).to.be.a("string").that.is.not.empty;
        expect(vocab.boundary).to.be.oneOf(["ui", "service", "contract"]);
      }
    });

    it("should assign correct boundary ownership to each lifecycle stage", function () {
      expect(getVocabulary("review").boundary).to.equal("ui");
      expect(getVocabulary("signature_request").boundary).to.equal("service");
      expect(getVocabulary("submission").boundary).to.equal("service");
      expect(getVocabulary("confirmation").boundary).to.equal("contract");
      expect(getVocabulary("delayed").boundary).to.equal("service");
      expect(getVocabulary("confirmed").boundary).to.equal("contract");
      expect(getVocabulary("failure").boundary).to.equal("service");
    });
  });

  describe("Acceptance Criterion 1: Every status has a clear next action", function () {
    const statuses = [
      "review",
      "signature_request",
      "submission",
      "confirmation",
      "delayed",
      "confirmed",
      "failure",
    ] as const;

    it("every status provides an explicit primary next action with label and role", function () {
      for (const status of statuses) {
        const vocab = getVocabulary(status, mockContext);
        expect(vocab.nextAction, `Status "${status}" missing nextAction`).to.be.an("object");
        expect(vocab.nextAction.label, `Status "${status}" missing nextAction.label`).to.be.a("string").that.is.not.empty;
        expect(vocab.nextAction.actionKey, `Status "${status}" missing nextAction.actionKey`).to.be.a("string").that.is.not.empty;
        expect(vocab.nextAction.ariaLabel, `Status "${status}" missing nextAction.ariaLabel`).to.be.a("string").that.is.not.empty;
      }
    });

    it("every status provides a definitive recovery action for abortion, retry, or review", function () {
      for (const status of statuses) {
        const vocab = getVocabulary(status, mockContext);
        expect(vocab.recoveryAction, `Status "${status}" missing recoveryAction`).to.be.an("object");
        expect(vocab.recoveryAction.label, `Status "${status}" missing recoveryAction.label`).to.be.a("string").that.is.not.empty;
        expect(vocab.recoveryAction.actionKey, `Status "${status}" missing recoveryAction.actionKey`).to.be.a("string").that.is.not.empty;
      }
    });

    it("review next action initiates signing while recovery action allows cancellation", function () {
      const vocab = getVocabulary("review", mockContext);
      expect(vocab.nextAction.label).to.equal("Confirm & Sign");
      expect(vocab.nextAction.actionKey).to.equal("confirm_review");
      expect(vocab.recoveryAction.label).to.equal("Cancel");
      expect(vocab.recoveryAction.actionKey).to.equal("cancel_review");
    });

    it("failure next action provides retry while recovery allows dismissal", function () {
      const vocab = getVocabulary("failure", { ...mockContext, errorMessage: "Insufficient balance" });
      expect(vocab.nextAction.label).to.equal("Retry Transaction");
      expect(vocab.nextAction.actionKey).to.equal("retry");
      expect(vocab.recoveryAction.label).to.equal("Dismiss");
      expect(vocab.recoveryAction.actionKey).to.equal("dismiss_error");
    });
  });

  describe("Acceptance Criterion 2: Success means ledger confirmation", function () {
    it("isLedgerConfirmed strictly rejects status other than confirmed", function () {
      expect(isLedgerConfirmed("submission", 52194812, mockContext.txHash)).to.be.false;
      expect(isLedgerConfirmed("confirmation", 52194812, mockContext.txHash)).to.be.false;
      expect(isLedgerConfirmed("delayed", 52194812, mockContext.txHash)).to.be.false;
      expect(isLedgerConfirmed("failure", 52194812, mockContext.txHash)).to.be.false;
      expect(isLedgerConfirmed("review", 52194812, mockContext.txHash)).to.be.false;
    });

    it("isLedgerConfirmed requires a valid positive ledger sequence number", function () {
      expect(isLedgerConfirmed("confirmed", undefined, mockContext.txHash)).to.be.false;
      expect(isLedgerConfirmed("confirmed", 0, mockContext.txHash)).to.be.false;
      expect(isLedgerConfirmed("confirmed", -1, mockContext.txHash)).to.be.false;
    });

    it("isLedgerConfirmed requires a non-empty transaction hash", function () {
      expect(isLedgerConfirmed("confirmed", 52194812, undefined)).to.be.false;
      expect(isLedgerConfirmed("confirmed", 52194812, "")).to.be.false;
      expect(isLedgerConfirmed("confirmed", 52194812, "   ")).to.be.false;
    });

    it("isLedgerConfirmed returns true when status is confirmed with ledger sequence and hash", function () {
      expect(isLedgerConfirmed("confirmed", 52194812, mockContext.txHash)).to.be.true;
    });

    it("confirmed vocabulary explicitly mentions ledger sequence and provides explorer receipt", function () {
      const vocab = getVocabulary("confirmed", mockContext);
      expect(vocab.subText).to.include("Ledger #52194812");
      expect(vocab.nextAction.label).to.equal("Done");
      expect(vocab.recoveryAction.label).to.equal("View on Stellar Explorer");
      expect(vocab.recoveryAction.href).to.include(mockContext.txHash!);
    });
  });

  describe("Acceptance Criterion 3: Delayed confirmation is distinguishable from failure", function () {
    it("delayed confirmation and failure have distinct status identifiers", function () {
      expect(isDelayedConfirmation("delayed")).to.be.true;
      expect(isDelayedConfirmation("failure")).to.be.false;
      expect(isTerminalFailure("failure")).to.be.true;
      expect(isTerminalFailure("delayed")).to.be.false;
    });

    it("delayed confirmation uses amber warning tokens, while failure uses red error tokens", function () {
      const delayedVocab = getVocabulary("delayed", mockContext);
      const failureVocab = getVocabulary("failure", { ...mockContext, errorMessage: "Contract error #106" });

      expect(delayedVocab.colorClass).to.include("amber");
      expect(delayedVocab.iconName).to.equal("Clock");
      expect(failureVocab.colorClass).to.include("red");
      expect(failureVocab.iconName).to.equal("XCircle");
    });

    it("delayed confirmation copy explicitly warns NOT to re-submit and clarifies it has NOT failed", function () {
      const delayedVocab = getVocabulary("delayed", { ...mockContext, elapsedSeconds: 15 });
      expect(delayedVocab.subText).to.include("has NOT failed");
      expect(delayedVocab.subText).to.include("do not re-submit");
      expect(delayedVocab.title).to.include("Taking Longer");
      expect(delayedVocab.nextAction.label).to.equal("Continue Waiting");
      expect(delayedVocab.recoveryAction.label).to.equal("Check Status on Explorer");
    });

    it("failure copy reports failure and offers retry", function () {
      const failureVocab = getVocabulary("failure", { ...mockContext, errorMessage: "Deposit cap exceeded" });
      expect(failureVocab.title).to.equal("Transaction Failed");
      expect(failureVocab.subText).to.include("Deposit cap exceeded");
      expect(failureVocab.nextAction.label).to.equal("Retry Transaction");
    });
  });

  describe("Explicit Monetary Units, Network Identity, and Authorization", function () {
    it("formats explicit Stellar fee in XLM currency units", function () {
      expect(formatStellarFee(100)).to.equal("< 0.00001 XLM");
      expect(formatStellarFee(500)).to.equal("< 0.00001 XLM");
      expect(formatStellarFee(100000)).to.equal("0.01000 XLM");
    });

    it("formats address and tx hash with readable ellipsis", function () {
      const address = "GB_USER1_VICTIM1EXAMPLENEUVALTKEY00000000000000000004";
      const formatted = formatAddressOrHash(address, 4, 4);
      expect(formatted).to.equal("GB_U…0004");
    });

    it("generates correct Stellar Expert explorer URLs for testnet vs public", function () {
      const hash = "0xabcdef123456";
      expect(getExplorerUrl(hash, "Stellar Testnet")).to.equal(
        "https://stellar.expert/explorer/testnet/tx/0xabcdef123456"
      );
      expect(getExplorerUrl(hash, "Stellar Mainnet")).to.equal(
        "https://stellar.expert/explorer/public/tx/0xabcdef123456"
      );
    });

    it("buildStandardSteps builds cohesive stepper representation", function () {
      const steps = buildStandardSteps("confirmation", mockContext);
      expect(steps).to.have.lengthOf(5);
      expect(steps[0].id).to.equal("review");
      expect(steps[0].status).to.equal("done");
      expect(steps[1].id).to.equal("signature_request");
      expect(steps[1].status).to.equal("done");
      expect(steps[2].id).to.equal("submission");
      expect(steps[2].status).to.equal("done");
      expect(steps[3].id).to.equal("confirmation");
      expect(steps[3].status).to.equal("confirmation");
      expect(steps[4].id).to.equal("confirmed");
      expect(steps[4].status).to.equal("pending");
    });

    it("buildStandardSteps preserves delayed confirmation distinction without failing the stepper", function () {
      const steps = buildStandardSteps("delayed", mockContext);
      const confirmStep = steps.find((s) => s.id === "confirmation");
      expect(confirmStep?.status).to.equal("delayed");
    });
  });
});
