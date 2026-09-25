# Checks-Effects-Interactions Audit

This checklist records the contract paths reviewed for issue #53. Soroban
prevents recursive invocation of the same contract, and a failed cross-contract
call rolls back the complete invocation. CEI remains the preferred ordering;
where a protocol's realized balance is needed to calculate a partial withdrawal
or rebalance result, the interaction-before-final-effects exception is recorded
below rather than described as strict CEI.

| Entry point | Checks and effects | External interactions and ordering |
|---|---|---|
| `deposit` | Validates limits, computes shares, updates user/total accounting and deposit ledger. | USDC transfer runs after accounting effects; transfer failure rolls all state back. |
| `batch_deposit` | Validates every token/amount and aggregate caps before updating aggregate accounting. | USDC transfers run after accounting effects; any failed entry reverts the whole batch. |
| `withdraw` | Validates authorization/limits; if protocol liquidity is needed, derives actual amount, then burns shares and updates accounting. | A protocol withdrawal may precede final share effects because actual available USDC determines the partial amount. The final USDC transfer occurs after accounting effects. Soroban recursion prevention and transaction rollback are relied on for the liquidity-pull step. |
| `withdraw_all` | Reads the share position; when liquidity is short, derives the realizable amount before burning corresponding shares and updating accounting. | Protocol withdrawal/balance reads precede final share effects for partial-fill reconciliation. Final USDC transfer follows effects; Soroban recursion prevention and rollback protect the pull step. |
| `rebalance` | Validates agent, protocol, cooldown, and slippage inputs. Failed exits return before a destination transition; successful completion persists protocol tracking and the rebalance ledger. | Pool calls and balance reads precede final protocol tracking because actual movement determines the resulting state. Soroban recursion prevention and transaction rollback are relied on. |
| `harvest` | Validates agent, pause, cooldown, protocol, and rate limits. | Withdraws and resupplies through the active protocol before writing the final cooldown ledger; Soroban recursion prevention and transaction rollback are relied on. |

## Evidence and Coverage

- `test_deposit.rs`, `test_withdraw.rs`, `test_rebalance.rs`,
  `test_rebalance_integration.rs`, and `test_harvest.rs` cover the corresponding
  public lifecycle behavior and failure paths.
- `test_reentrancy_defense.rs` contains mock-token reentry scenarios, but its
  module is currently disabled in `tests/mod.rs` due to pre-existing compile
  failures. It must not be treated as active test coverage until repaired and
  enabled.
- This audit does not claim strict CEI for protocol exits. The ordering and
  platform-level mitigation are explicit above so future changes can revisit
  the tradeoff without assuming no external calls occur.