# Wallet and RPC recovery copy matrix (Issue #495)

`getVaultErrorPresentation()` in `vaultErrors.ts` provides the primary message,
the next action, whether a retry is safe, and optional technical reference
details. Show the primary message and action first. Technical details belong in
a collapsed “Error details” section or support reference; raw SDK text must not
replace the user-facing copy.

| Failure | Primary message | Next action | Retry guidance |
|---|---|---|---|
| Wallet signing rejected | “Signing was canceled. Your wallet did not approve this transaction. No retry was submitted.” | Review amount and network, then start a new transaction only if still intended. | No automatic retry. The user must explicitly begin a new signing request. |
| Wrong network | “Your wallet is connected to a different Stellar network than this vault.” | Switch to the selected network, reconnect, and review the transaction again. | Do not retry against the old network. |
| Insufficient USDC/XLM | “Your available USDC or XLM does not cover this action and its network fee.” | Check both balances and correct the amount. | No retry until the amount/balance changes. |
| Expired simulation | “Network state changed after this transaction was simulated.” | Refresh balance and create a new preview before signing. | A new simulation/preview is safe; never resubmit the stale XDR. |
| Soroban RPC outage | “The app could not get a reliable response from the selected Stellar network.” | Refresh balance and preview. If a wallet signed or the request may have been submitted, check transaction status first. | Read/simulation retry only when nothing was signed or submitted. An uncertain submission is not safe to repeat. |
| Unknown contract/SDK failure | “The app could not safely complete this action.” | Check transaction status and contact support with the reference details. | No retry is offered until the result is known. |

Deposit bounds should name the actual current minimum or maximum and whether
the per-transaction, personal, or vault cap applies. A withdrawal amount error
must not be described as a deposit limit. A rejected signature is not a failed
on-chain transaction, while a network timeout after submission may have an
indeterminate result; keep these states separate.

The technical reference may contain the raw message truncated to 500
characters. Do not expose secret material or include transaction payloads in
the primary message.
