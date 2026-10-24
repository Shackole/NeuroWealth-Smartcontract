# feat(ui): coherent transaction progress vocabulary (#491)

Closes #491

## Summary

This PR establishes a coherent transaction progress vocabulary across design handoffs, design systems, frontend components, and automated test validation for the NeuroWealth Stellar/Soroban platform.

It formally defines status names, icons, copy, explicit parameter rendering (monetary units, network identity, authorization requirements), and clear recovery actions across the five canonical phases:
1. **Review (`review`)**: Parameter verification prior to signing, explicit units (`USDC`, `NV-SHARES`, `XLM` fee), source account identity, network identity. Next action: "Confirm & Sign"; Recovery action: "Cancel / Back to edit".
2. **Signature Request (`signature_request`)**: Active wallet request targeting the Freighter browser extension for account `G...`. Next action: "Awaiting Approval…"; Recovery action: "Cancel Request".
3. **Submission (`submission`)**: Broadcasting signed transaction XDR envelope to Soroban RPC node. Next action: "Broadcasting…"; Recovery action: "Check RPC Connection".
4. **Confirmation (`confirmation` & `delayed`)**:
   - `confirmation`: Active polling of `getTransaction` during expected ledger close interval (~3–5s). Next action: "Awaiting Ledger…"; Recovery action: "View Pending on Explorer".
   - `delayed` (Delayed Confirmation): Distinct amber warning state triggered when ledger close latency exceeds normal duration. Copy explicitly clarifies the transaction has **not** failed and is pending consensus, prohibiting re-submission to protect against duplicate deposits/withdrawals. Next action: "Continue Waiting"; Recovery action: "Check Status on Explorer".
5. **Ledger Confirmed (`confirmed`) — Success**: Strict ledger confirmation requiring verified Soroban RPC status `SUCCESS`, valid 64-character transaction hash, and explicit closed ledger sequence number. Next action: "Done"; Recovery action: "View on Stellar Explorer".
6. **Failure (`failure`)**: Terminal rejection (wallet rejection, simulation error, or contract failure code). Distinct red state. Next action: "Retry Transaction"; Recovery action: "Dismiss / Edit Details".

---

## Affected Files

| File | Scope & Impact |
|---|---|
| `design/dashboard/TRANSACTION_PROGRESS_VOCABULARY.md` | New design specification defining status names, icons, copy, boundaries (Contract / Service / UI), units, and recovery actions. |
| `design/dashboard/README.md` | Design handoff updated to reference Issue #491 and link the transaction progress vocabulary specification. |
| `docs/DESIGN_SYSTEM.md` | Design system documentation updated with `TransactionProgress` component inventory and vocabulary usage guidelines. |
| `frontend/src/lib/design-tokens.ts` | Design tokens extended with `transactionProgress` status colors, background tints, borders, and icons. |
| `frontend/src/lib/transactionProgress.ts` | Core library implementation of `TransactionProgressStatus`, `TRANSACTION_VOCABULARY`, lifecycle helper functions, and step builders. |
| `frontend/src/components/TransactionProgress.tsx` | Reusable stepper component updated with new vocabulary, distinct icons, accessible ARIA live regions, amber delayed confirmation warnings, and ledger confirmation metadata. |
| `frontend/src/components/ActionModal.tsx` | Integrated `TransactionProgress` into deposit/withdrawal modal flows with explicit monetary units (`USDC`, `NV-SHARES`), fees (`< 0.00001 XLM`), network identity (`Stellar Testnet`), and authorized signer account. |
| `test/transactionProgressVocabulary.test.ts` | Automated Mocha/Chai test suite verifying vocabulary completeness, criteria compliance, and boundary assignments. |
| `tsconfig.json` | Updated include path to cover the new test and library definitions. |
| `pr.md` | Documented pull request summary, affected files list, and acceptance criteria verification evidence. |

---

## Acceptance Criteria & Evidence

### 1. Every status has a clear next action
- **Evidence:** Verified by `test/transactionProgressVocabulary.test.ts`:
  - `review` → `Confirm & Sign` (`confirm_review`)
  - `signature_request` → `Awaiting Approval…` (`await_signature`)
  - `submission` → `Broadcasting…` (`await_submission`)
  - `confirmation` → `Awaiting Ledger…` (`await_confirmation`)
  - `delayed` → `Continue Waiting` (`continue_waiting`)
  - `confirmed` → `Done` (`complete`)
  - `failure` → `Retry Transaction` (`retry`)
- Each status also provides an explicit secondary recovery action (`cancel_review`, `cancel_signature`, `check_rpc`, `view_explorer_pending`, `check_explorer_delayed`, `view_explorer_confirmed`, `dismiss_error`).
- Automated test: `"every status provides an explicit primary next action with label and role"` PASSED.

### 2. Success means ledger confirmation
- **Evidence:** 
  - `isLedgerConfirmed()` enforces:
    - Status MUST be `confirmed` (never `submission` or unverified `confirmation`).
    - Valid non-empty 64-character hex transaction hash is required.
    - Positive integer `ledgerSequence` (e.g. `Ledger #52194812`) confirmed on-chain is required.
  - Automated tests:
    - `"isLedgerConfirmed strictly rejects status other than confirmed"` PASSED.
    - `"isLedgerConfirmed requires a valid positive ledger sequence number"` PASSED.
    - `"isLedgerConfirmed requires a non-empty transaction hash"` PASSED.
    - `"isLedgerConfirmed returns true when status is confirmed with ledger sequence and hash"` PASSED.
    - `"confirmed vocabulary explicitly mentions ledger sequence and provides explorer receipt"` PASSED.

### 3. Delayed confirmation is distinguishable from failure
- **Evidence:**
  - **Visual Distinction:** `delayed` is rendered with amber tokens (`warning-400` / `#fbbf24`), amber backgrounds (`bg-amber-500/10`), and `Clock` / `AlertCircle` icons. In contrast, `failure` uses red tokens (`error-400` / `#f87171`), red backgrounds (`bg-red-500/15`), and `XCircle`.
  - **Copy Distinction:** `delayed` copy states: `"Confirmation Delayed — Transaction has NOT failed. Network consensus is pending. Please do not re-submit to prevent duplicate operations."` In contrast, `failure` copy states: `"Transaction Failed: [reason]"`.
  - **Recovery Guard:** In `delayed`, duplicate submission is prevented; user can continue waiting or verify status on Stellar Explorer. In `failure`, retry is safely offered.
  - Automated tests:
    - `"delayed confirmation and failure have distinct status identifiers"` PASSED.
    - `"delayed confirmation uses amber warning tokens, while failure uses red error tokens"` PASSED.
    - `"delayed confirmation copy explicitly warns NOT to re-submit and clarifies it has NOT failed"` PASSED.
    - `"failure copy reports failure and offers retry"` PASSED.

### 4. Pull request identifies affected files and records evidence
- **Evidence:** All affected files are cataloged in the table above, with direct mappings and recorded verification outputs.

---

## Validation & Review Steps

### Automated Test Execution
Run the test suite from the repository root:
```bash
npm test
```
**Expected Result:** All blast radius security tests and transaction progress vocabulary tests pass (49 passing).  
**Observed Result:** 49 passing (722ms).

### Typecheck Verification
Run TypeScript typecheck across root:
```bash
npx tsc --noEmit
```
**Expected Result:** Zero TypeScript errors.  
**Observed Result:** Exited with code 0.
