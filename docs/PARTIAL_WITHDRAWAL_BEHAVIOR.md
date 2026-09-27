# Partial Withdrawal Behaviour (Issue #55)

This document describes the exact, tested behaviour of `withdraw()` and
`withdraw_all()` when the vault must assemble funds from multiple sources to
satisfy a withdrawal request.  All claims here are backed by integration tests
in `neurowealth-vault/contracts/vault/src/tests/test_partial_withdrawal.rs`.

---

## Summary

The withdrawal state-machine follows a strict priority order:

1. **Idle funds first** — USDC sitting in the vault contract is consumed before
   any protocol is called.
2. **Protocol recall second** — if the idle balance is insufficient, the vault
   recalls exactly the shortfall from the active protocol (`blend` or `dex`).
3. **Partial fill** — if the protocol returns less than requested (e.g. due to
   liquidity constraints), the vault transfers whatever it can actually
   assemble and burns only the proportional number of shares.  The user keeps
   the remainder as shares for a future withdrawal attempt.

There is no withdrawal queue, no reservation mechanism, and no automatic
follow-up.  The user's `Shares` balance is the sole record of any unfulfilled
portion.

---

## The Three Withdrawal Paths

### Path 1 — All Idle (`CurrentProtocol = "none"` or vault has enough idle USDC)

- Vault balance ≥ requested amount.
- **No protocol call is made.**
- User receives exactly the requested amount.
- `WithdrawEvent` emitted with `amount = requested`.

Tested by:
- `test_withdraw_all_idle_no_protocol_recall`
- `test_withdraw_all_idle_emits_withdraw_event`
- `test_withdraw_exactly_idle_balance_no_recall`

### Path 2 — All Protocol (vault idle = 0, all funds deployed)

- Vault holds zero idle USDC.
- `withdraw_amount_from_protocol(needed = full_amount)` is called.
- Protocol returns the recalled amount; vault transfers it to the user.
- `WithdrawEvent` emitted with the recalled amount.
- Shares burned are proportional to `actual_returned` (not the original
  request), so a partial protocol return leaves the user with remaining shares.

Tested by:
- `test_withdraw_all_from_protocol_recalls_correctly`
- `test_withdraw_all_from_protocol_emits_event`
- `test_withdraw_from_protocol_burns_proportional_shares`

### Path 3 — Mixed (partial idle + partial protocol recall)

- Vault has some idle USDC but less than the requested amount.
- Idle balance is consumed **in full** first.
- `withdraw_amount_from_protocol(needed = request − idle)` is called for the
  shortfall only.
- Final transfer = idle consumed + amount recalled from protocol.
- `WithdrawEvent` emitted with the combined total.

Tested by:
- `test_withdraw_mixed_uses_idle_first_then_recalls_shortfall`
- `test_withdraw_mixed_emits_single_withdraw_event`
- `test_withdraw_mixed_dex_uses_idle_first`
- `test_partial_withdrawal_split_calculation`

---

## Code Walkthrough

```
withdraw(user, amount):

  1. vault_balance = token.balance(vault)

  2. if vault_balance < amount:
       needed = amount − vault_balance
       withdraw_amount_from_protocol(current_protocol, needed, min_out=0)
       available = token.balance(vault)          // re-read after recall
       actual_to_return = min(amount, available) // cap to what we have

  3. require(actual_to_return > 0, InsufficientLiquidity)

  4. shares_to_burn = convert_to_shares_ceil(actual_to_return)  // rounds up
  5. usdc_to_return = convert_to_assets(shares_to_burn)          // rounds down

  6. deduct shares, update TotalShares, TotalAssets, TotalDeposits
  7. token.transfer(vault → user, usdc_to_return)
  8. emit WithdrawEvent { user, amount: usdc_to_return, shares: shares_to_burn }
```

Key points:

- **Step 2 is only entered when `vault_balance < amount`.**  When idle funds
  fully cover the request no protocol call is made.
- **`min_out = 0` on the recall leg.** The `min_out` slippage parameter
  passed to `rebalance` / `harvest` does not apply to the withdrawal recall.
  The vault transfers whatever the protocol actually returns; if that is less
  than `amount` the user gets a partial fill.
- **Share arithmetic uses ceiling division** (step 4) to prevent dust attacks:
  even a 1-unit withdrawal burns at least 1 share.

---

## Events

Both paths (idle-only and recall-required) emit the **same** `WithdrawEvent`:

```rust
struct WithdrawEvent {
    user:   Address,  // withdrawing user
    amount: i128,     // USDC actually transferred (7-decimal units)
    shares: i128,     // shares burned
}
```

Topic: `TOPIC_WITHDRAW` (`"withdraw"`).

There is **no separate event** for the protocol-recall leg.  The
`BlendWithdrawEvent` / `DexWithdrawEvent` are emitted by the internal
`withdraw_from_protocol` call if the protocol fires one, but the user-facing
withdrawal is always reported by `WithdrawEvent`.

---

## Liquidity-Crunch Behaviour

When the protocol cannot return the full requested amount:

- The vault transfers `min(request, vault_balance_after_recall)`.
- Shares are burned only for the portion actually returned.
- The user retains the unburned shares — no automatic follow-up, no queue.
- A subsequent `withdraw` / `withdraw_all` can claim the remainder whenever
  liquidity recovers.

If `actual_to_return == 0` after a recall attempt, the call reverts with
`VaultError::InsufficientLiquidity` (error `#7`).

This is **first-come-first-served** by transaction inclusion order — two
users requesting withdrawals simultaneously are not guaranteed equal treatment.
See the "Fairness and DoS" section below.

---

## Fairness and DoS Vectors

| # | Vector | Status |
|---|--------|--------|
| 1 | Front-running a large withdrawal | Not mitigated at vault level — inherent to on-chain ordering |
| 2 | Withdrawal-announcement griefing | Not applicable — no request/intent mechanism exists |
| 3 | Repeated small partial-fill draining | Not mitigated; bounded by attacker's own share balance |
| 4 | Revert-based DoS via `InsufficientLiquidity` | Not an attacker advantage beyond vector #1 |
| 5 | Circuit-breaker interaction | Not applicable — circuit breaker counts rebalance failures, not withdrawal reverts |

---

## Related Documentation

- `SECURITY.md` — "Withdrawal Guarantees" section (trust-model perspective).
- `docs/monitoring.md` — whale-exit concentration risk (Issue #599).
- `ARCHITECTURE.md` — "Idle vs Deployed Asset Tracking" and rebalance flow.
- `neurowealth-vault/contracts/vault/src/tests/test_partial_withdrawal.rs` —
  integration tests that directly verify the behaviour described here.
