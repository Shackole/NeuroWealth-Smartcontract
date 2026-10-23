# Withdrawal lifecycle and low-liquidity behavior

This describes the contract entrypoints in
`neurowealth-vault/contracts/vault/src/lib.rs`. The contract has no user
withdrawal request queue: `withdraw`, `withdraw_all`, and
`emergency_withdraw` execute synchronously in the submitted Soroban transaction.
The Bull transaction queue in `agent/src/transactionQueue.ts` is separate
infrastructure and does not reserve shares or promise a queued withdrawal.

## Normal withdrawals

`withdraw(user, amount)` and `withdraw_all(user)` require the user's
authorization and are unavailable while the vault is paused. They use idle
USDC first. If idle funds do not cover the request, the contract requests the
shortfall from the deployed protocol. In multi-protocol mode, it asks Blend and
DEX proportionally to their live positions; in single-protocol mode it calls
the active venue.

The contract then checks its actual USDC balance. If a venue returns less than
requested, a positive amount can still be paid successfully: shares are burned
only for the amount actually returned, and the remaining shares stay with the
user. `withdraw_all` similarly returns the amount paid and retains shares for
the unpaid portion. The user may submit another withdrawal later when
liquidity is available. This is a partial fill, not an asynchronous request or
a guarantee that the remainder will be paid automatically.

If no positive amount can be assembled, the call reverts (`InsufficientLiquidity`
for `withdraw`; `NoLiquidityAvailable` for a zero-liquidity `withdraw_all`). A
revert rolls back that transaction; it does not create a pending request. Other
authorization, pause, rate-limit, share, holding-period, venue, or contract
errors can also reject the call. A provider call that itself fails may revert
the transaction rather than produce a partial payment.

## Emergency withdrawal

`emergency_withdraw(user, amount)` is available only while the vault is paused
and still requires the user's authorization and sufficient shares. It tries
idle USDC first and may recall the shortfall from the active protocol, including
proportionally from both venues in multi-protocol mode. A positive available
amount is paid as a partial withdrawal with proportional share burn. If no
liquidity is available, it reverts; it does not queue or bypass the user's
share balance. The function does not unpause the vault.

## User and operator expectations

- Before signing, show that the paid amount can be lower than requested when
  protocol liquidity is constrained. Contract preview functions assume full
  liquidity and cannot guarantee the final fill.
- Treat a successful partial fill as final for that transaction. The user
  keeps the remaining shares and must request another withdrawal after
  liquidity recovers.
- A failed transaction has no queued remainder. Inspect its error and current
  vault/protocol balances before submitting again; do not blindly resubmit a
  financial transaction whose network outcome is uncertain.
- Emergency withdrawal is a paused-vault recovery path, not a faster normal
  withdrawal mode. Follow the incident response and pause procedures.

## Source of truth

The behavior is implemented by `withdraw`, `withdraw_all`,
`emergency_withdraw`, `withdraw_amount_from_protocol`, and
`withdraw_proportionally` in the vault contract. `CurrentProtocol = "multi"`
dispatches withdrawals proportionally against the live Blend and DEX balances.
The older [`PARTIAL_WITHDRAWAL_BEHAVIOR.md`](PARTIAL_WITHDRAWAL_BEHAVIOR.md)
describes the original single-protocol paths; this document covers the current
multi-protocol and emergency paths as well.
