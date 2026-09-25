# NeuroWealth Vault — Error Code Reference

Complete reference for every error the vault contract can return. Errors are
identified on-chain as `Error(Contract, #N)` where `N` is the numeric code.

**Source of truth**: `neurowealth-vault/contracts/vault/src/lib.rs` — `VaultError` enum.  
**Naming conventions**: See [`ERROR_STYLE_GUIDE.md`](../ERROR_STYLE_GUIDE.md).  
**Frontend cross-reference**: Issue #13 — each code maps directly to the
`VAULT_ERROR_MAP` constant in the frontend error-message layer.

---

## Quick-Reference Table

| Code | Variant | Category | Caller |
| ---: | ------- | -------- | ------ |
| 4  | `AlreadyInitialized`              | System       | — |
| 5  | `UnauthorizedDeployer`            | System       | — |
| 6  | `SharesToMintMustBePositive`      | System       | — |
| 7  | `InsufficientLiquidity`           | System       | User |
| 8  | `InsufficientShares`              | User         | User |
| 9  | `NoAssetsToWithdraw`              | System       | User |
| 10 | `SharesToBurnMustBePositive`      | System       | — |
| 11 | `InsufficientSharesForAmount`     | User         | User |
| 12 | `NoSharesToWithdraw`              | User         | User |
| 13 | `NoLiquidityAvailable`            | System       | User |
| 14 | `NoAssetsToReturn`                | System       | User |
| 15 | `NoSharesToBurn`                  | System       | — |
| 16 | `MinOutMustBeNonNegative`         | Agent        | Agent |
| 17 | `UnsupportedProtocol`             | Agent        | Agent |
| 18 | `BlendPoolNotConfigured`          | Owner        | Agent |
| 19 | `OnlyOwnerCanPause`               | Owner        | Owner |
| 20 | `OnlyOwnerCanUnpause`             | Owner        | Owner |
| 21 | `NotPaused`                       | Owner        | Owner |
| 22 | `OnlyOwnerCanEmergencyPause`      | Owner        | Owner |
| 23 | `TvlCapCannotBeNegative`          | Owner        | Owner |
| 24 | `UserDepositCapCannotBeNegative`  | Owner        | Owner |
| 25 | `TvlCapBelowUserDepositCap`       | Owner        | Owner |
| 28 | `OnlyOwnerCanConfigurePool`       | Owner        | Owner |
| 29 | `CallerIsNotPendingOwner`         | Owner        | — |
| 30 | `OnlyAgentCanUpdateTotalAssets`   | Agent        | Agent |
| 31 | `TotalAssetsDecreaseNotAllowed`   | Agent        | Agent |
| 32 | `DecreaseExceedsMaximumAllowedBps`| Agent        | Agent |
| 33 | `InsufficientBalanceForAssets`    | Agent        | Agent |
| 34 | `CallerIsNotOwner`                | Owner        | Owner |
| 35 | `Paused`                          | System       | User/Agent |
| 36 | `NotInitialized`                  | System       | — |
| 37 | `AmountMustBePositive`            | User         | User |
| 38 | `BelowMinimumDeposit`             | User         | User |
| 39 | `MaximumDepositExceeded`          | User         | User |
| 40 | `ExceedsUserDepositCap`           | User         | User |
| 41 | `ExceedsTvlCap`                   | User         | User |
| 42 | `MinOutNotMet`                    | Agent        | Agent |
| 43 | `RebalanceCooldownActive`         | Agent        | Agent |
| 44 | `ApprovalTtlTooLow`               | Owner        | Owner |
| 45 | `ApprovalTtlTooHigh`              | Owner        | Owner |
| 46 | `DexPoolNotConfigured`            | Owner        | Agent |
| 47 | `InvalidStrategy`                 | User         | User |
| 48 | `TimelockAlreadyPending`          | Owner        | Owner |
| 49 | `NoTimelockPending`               | Owner        | Owner |
| 50 | `TimelockNotExpired`              | Owner        | Owner |
| 62 | `DeployerCannotBeZeroAddress`     | System       | — |
| 63 | `OwnerCannotBeZeroAddress`        | System       | — |
| 64 | `AgentCannotBeZeroAddress`        | System       | — |
| 65 | `UsdcTokenCannotBeZeroAddress`    | System       | — |
| 66 | `MaximumDepositExceedsCeiling`    | Owner        | Owner |
| 67 | `MigrationPaused`                 | Owner        | User |
| 68 | `InvalidMigrationTarget`          | Owner        | User |
| 69 | `NoSharesToMigrate`               | User         | User |
| 70 | `SharesAlreadyLocked`             | User         | User |
| 71 | `LockPeriodNotEnded`              | User         | User |
| 72 | `InvalidLockDuration`             | User         | User |
| 73 | `InsufficientUnlockedShares`      | User         | User |
| 74 | `EmergencyWithdrawalNotAllowed`   | User         | User |
| 75 | `HoldingPeriodNotElapsed`         | User         | User |
| 76 | `InvalidHoldingPeriod`            | Owner        | Owner |
| 77 | `InvalidAllocation` / `RateLimitExceeded`          | Agent / User | Agent/User |
| 78 | `MultiProtocolNotEnabled` / `InvalidRateLimitCategory` | Agent / Owner | Agent/Owner |
| 79 | `MultiProtocolEnabledError` / `InvalidRateLimitConfig` | Agent / Owner | Agent/Owner |
| 80 | `BatchSizeExceeded`               | User         | User |
| 81 | `ProtocolAdapterNotConfigured`    | Owner        | Agent |
| 82 | `ProtocolNotWhitelisted`          | Owner        | Agent |

---

## Frontend Error Message Map

Frontend code (Issue #13) should map numeric codes to user-facing strings.
Copy the snippet below into `VAULT_ERROR_MAP` in your frontend utilities.

```typescript
export const VAULT_ERROR_MAP: Record<number, string> = {
  4:  "This vault has already been set up.",
  5:  "Initialization rejected: deployer address mismatch.",
  6:  "Deposit too small to receive any shares. Try a larger amount.",
  7:  "The vault doesn't have enough liquidity right now. Try again shortly.",
  8:  "You don't have enough shares for this withdrawal.",
  9:  "No assets available to withdraw.",
  10: "Withdrawal amount too small to burn any shares.",
  11: "You don't have enough shares for the requested withdrawal amount.",
  12: "You have no shares to withdraw.",
  13: "No liquidity is available in the vault right now.",
  14: "No assets are available to return for your shares.",
  15: "No shares available to burn.",
  16: "Slippage parameter (min_out) cannot be negative.",
  17: "That protocol is not supported.",
  18: "The Blend lending pool has not been configured yet.",
  19: "Only the vault owner can pause.",
  20: "Only the vault owner can unpause.",
  21: "The vault is not currently paused.",
  22: "Only the vault owner can emergency-pause.",
  23: "TVL cap cannot be a negative number.",
  24: "Per-user deposit cap cannot be a negative number.",
  25: "TVL cap must be greater than or equal to the per-user deposit cap.",
  28: "Only the vault owner can configure protocol pools.",
  29: "You are not the pending owner. Accept ownership from the correct wallet.",
  30: "Only the authorized AI agent can update total assets.",
  31: "A decrease in total assets requires explicit authorization.",
  32: "Reported asset decrease exceeds the configured maximum basis-point cap.",
  33: "Vault's on-chain balance is less than the reported total assets.",
  34: "Only the vault owner can perform this action.",
  35: "The vault is currently paused. Please try again later.",
  36: "The vault has not been initialized yet.",
  37: "Amount must be greater than zero.",
  38: "Your deposit is below the minimum allowed amount.",
  39: "Your deposit exceeds the maximum allowed per transaction.",
  40: "This deposit would exceed your personal deposit cap.",
  41: "This deposit would exceed the vault's total TVL cap.",
  42: "The rebalance received less than the required minimum output (slippage).",
  43: "The rebalance cooldown has not elapsed yet. Try again later.",
  44: "Approval TTL is below the minimum allowed value (1,000 ledgers).",
  45: "Approval TTL exceeds the maximum allowed value (500,000 ledgers).",
  46: "The DEX liquidity pool has not been configured yet.",
  47: "Invalid investment strategy. Choose conservative, balanced, or growth.",
  48: "A timelock proposal is already pending. Cancel it before creating a new one.",
  49: "No timelock proposal is pending.",
  50: "The timelock delay has not yet elapsed.",
  62: "Deployer address cannot be the zero address.",
  63: "Owner address cannot be the zero address.",
  64: "Agent address cannot be the zero address.",
  65: "USDC token address cannot be the zero address.",
  66: "Maximum deposit limit exceeds the absolute ceiling configured for this vault.",
  67: "Share migration is currently paused by the vault owner.",
  68: "No migration target has been set by the vault owner.",
  69: "You have no shares to migrate.",
  70: "You already have shares locked. Unlock them before locking again.",
  71: "Your lock period has not ended yet.",
  72: "Invalid lock duration. Choose 30, 90, or 180 days.",
  73: "You don't have enough unlocked shares.",
  74: "Emergency withdrawal is only available when the vault is paused.",
  75: "Your deposit must be held for the minimum period before withdrawing.",
  76: "Invalid holding period configuration.",
  77: "Invalid allocation: legs out of range or sum exceeds 10,000 bps. (Also: rate limit exceeded.)",
  78: "Multi-protocol mode is not enabled. (Also: unsupported rate-limit category.)",
  79: "Cannot use single-protocol function while multi-protocol mode is active. (Also: invalid rate-limit config.)",
  80: "Batch deposit exceeds the maximum allowed number of entries.",
  81: "No adapter contract is configured for that protocol.",
  82: "That protocol is not on the owner's whitelist.",
};

/** Returns a human-readable message for a vault contract error code. */
export function vaultErrorMessage(code: number): string {
  return VAULT_ERROR_MAP[code] ?? `Vault error #${code}. Check docs/ERROR_CODES.md for details.`;
}
```

---

## Category: User Errors

Errors triggered by invalid inputs or state from a regular user calling
`deposit`, `withdraw`, `withdraw_all`, `lock_shares`, `unlock_shares`,
`emergency_withdraw`, `migrate_shares`, or `set_user_strategy`.

---

### `Error(Contract, #37)` — `AmountMustBePositive`

**Description**: The `amount` parameter is zero or negative.

**Conditions**:
- `deposit(user, amount)` called with `amount ≤ 0`
- `withdraw(user, amount)` called with `amount ≤ 0`
- `emergency_withdraw(user, amount)` called with `amount ≤ 0`

**Resolution**: Supply an amount greater than zero. The minimum accepted
deposit is 1 USDC (1,000,000 stroops).

---

### `Error(Contract, #38)` — `BelowMinimumDeposit`

**Description**: The deposit amount is below the configured minimum
per-transaction floor.

**Conditions**:
- `deposit` amount < `MinDeposit` (default: 1 USDC = 1,000,000 stroops)
- `batch_deposit` aggregate < `MinDeposit`

**Resolution**: Increase the deposit amount to at least the minimum. Call
`get_min_deposit()` to read the current floor.

---

### `Error(Contract, #39)` — `MaximumDepositExceeded`

**Description**: The deposit amount exceeds the configured maximum per
single transaction.

**Conditions**:
- `deposit` amount > `MaxDeposit` (default: 10,000 USDC)
- `batch_deposit` aggregate > `MaxDeposit`

**Resolution**: Reduce the deposit amount to at most the maximum. Call
`get_max_deposit()` to read the current ceiling.

---

### `Error(Contract, #40)` — `ExceedsUserDepositCap`

**Description**: This deposit would push the caller's cumulative total above
the per-user deposit cap.

**Conditions**:
- `current_user_balance + amount > UserDepositCap` (default: 10,000 USDC)

**Resolution**: The user's deposits are already near or at the cap. Reduce
the amount or contact the vault operator to raise the cap via `set_user_deposit_cap`.

---

### `Error(Contract, #41)` — `ExceedsTvlCap`

**Description**: This deposit would push the vault's total assets above the
configured TVL cap.

**Conditions**:
- `TotalAssets + amount > TvlCap` (default: 100,000,000 USDC)

**Resolution**: The vault is at or near capacity. Either wait for
withdrawals to create room, or contact the vault operator to raise the cap
via `set_tvl_cap`.

---

### `Error(Contract, #8)` — `InsufficientShares`

**Description**: The user's current share balance is insufficient for the
requested withdrawal or is zero.

**Conditions**:
- `withdraw` or `withdraw_all` called when the user holds zero shares
- `withdraw` called but all of the user's shares are locked
- `emergency_withdraw` called when user has zero shares

**Resolution**: Verify your balance with `get_balance(user)`. If you have
locked shares, wait for the lock period to expire and call `unlock_shares`
first.

---

### `Error(Contract, #11)` — `InsufficientSharesForAmount`

**Description**: The amount to withdraw requires burning more shares than the
user currently holds (unlocked).

**Conditions**:
- The asset amount requested in `withdraw` maps to more shares than the user
  has unlocked

**Resolution**: Request a smaller withdrawal amount, or unlock locked shares
before withdrawing the full balance.

---

### `Error(Contract, #12)` — `NoSharesToWithdraw`

**Description**: The user has no shares at all.

**Conditions**:
- `withdraw_all` called with zero total shares
- `unlock_shares` called when there are no locked shares

**Resolution**: You have no position in the vault. Make a deposit first.

---

### `Error(Contract, #47)` — `InvalidStrategy`

**Description**: The strategy name is not one of the three accepted values.

**Conditions**:
- `set_user_strategy` called with anything other than `"conservative"`,
  `"balanced"`, or `"growth"`

**Resolution**: Use exactly one of: `"conservative"`, `"balanced"`, or
`"growth"`.

---

### `Error(Contract, #69)` — `NoSharesToMigrate`

**Description**: The user has no shares to migrate to the new vault.

**Conditions**:
- `migrate_shares` called when the user holds zero shares

**Resolution**: Only users with an existing position can migrate. Ensure you
have deposited and hold non-zero shares before migrating.

---

### `Error(Contract, #70)` — `SharesAlreadyLocked`

**Description**: The user already has shares locked under a boost period.

**Conditions**:
- `lock_shares` called when the user already has a non-zero `LockedShares`
  entry

**Resolution**: You can only hold one lock at a time. Wait for the current
lock to expire, then call `unlock_shares` before creating a new lock.

---

### `Error(Contract, #71)` — `LockPeriodNotEnded`

**Description**: The lock period has not yet elapsed.

**Conditions**:
- `unlock_shares` called before `current_ledger >= LockExpiry`

**Resolution**: Call `get_locked_shares(user)` to see the unlock ledger.
Wait until that ledger is reached before calling `unlock_shares`.

---

### `Error(Contract, #72)` — `InvalidLockDuration`

**Description**: The requested lock duration is not a supported tier.

**Conditions**:
- `lock_shares` called with `lock_duration_days` not equal to 30, 90, or 180

**Resolution**: Choose one of the supported durations: 30, 90, or 180 days.

---

### `Error(Contract, #73)` — `InsufficientUnlockedShares`

**Description**: The user doesn't have enough unlocked shares to satisfy the
lock request.

**Conditions**:
- `lock_shares(user, shares, duration)` where `shares > (total_shares - locked_shares)`

**Resolution**: Request a smaller lock amount, or unlock existing locked
shares first.

---

### `Error(Contract, #74)` — `EmergencyWithdrawalNotAllowed`

**Description**: Emergency withdrawal is only possible when the vault is
paused.

**Conditions**:
- `emergency_withdraw` called while `Paused == false`

**Resolution**: Emergency withdrawal is a safety mechanism for paused vaults
only. Use the normal `withdraw` function when the vault is operating.

---

### `Error(Contract, #75)` — `HoldingPeriodNotElapsed`

**Description**: The minimum holding period since the last deposit has not
yet elapsed (flash-loan protection, Issue #659).

**Conditions**:
- `withdraw` called before `current_ledger - LastDepositLedger(user) >= MinHoldingPeriod`
- Only fires when the owner has configured `MinHoldingPeriod > 0`

**Resolution**: Wait the required number of ledgers after your most recent
deposit before withdrawing. Call `get_min_holding_period()` to see the
configured delay (~5 s per ledger on Stellar mainnet).

---

### `Error(Contract, #80)` — `BatchSizeExceeded`

**Description**: The `batch_deposit` call contains more entries than the
configured maximum.

**Conditions**:
- `batch_deposit` entries count > `MaxBatchSize` (default: 50)

**Resolution**: Split the batch into smaller calls. Call
`get_max_batch_size()` to read the current limit.

---

## Category: Agent Errors

Errors triggered when the authorized AI agent calls `rebalance`,
`rebalance_multi`, `harvest`, `emergency_harvest`, `update_total_assets`,
`set_protocol_apy`, or other agent-gated functions with invalid parameters or
in an invalid state.

---

### `Error(Contract, #16)` — `MinOutMustBeNonNegative`

**Description**: The `min_out` slippage parameter is negative.

**Conditions**:
- `rebalance`, `rebalance_multi`, or `harvest` called with `min_out < 0`

**Resolution**: Pass `min_out = 0` to disable slippage protection, or a
positive value to set a floor on the minimum assets the protocol leg must
return.

---

### `Error(Contract, #17)` — `UnsupportedProtocol`

**Description**: The requested protocol symbol is not in the supported set.

**Conditions**:
- `rebalance` called with `protocol` not in `{"blend", "dex", "none"}`
- `harvest` called when `CurrentProtocol == "none"`
- `set_protocol_apy` called with a protocol other than `"blend"` or `"dex"`

**Resolution**: Use one of the supported protocol identifiers: `"blend"`,
`"dex"`, or `"none"`.

---

### `Error(Contract, #42)` — `MinOutNotMet`

**Description**: A protocol leg returned fewer assets than the configured
`min_out` floor (slippage protection triggered).

**Conditions**:
- `rebalance` or `harvest` with `min_out > 0` where the actual amount
  returned by Blend or the DEX is less than `min_out`

**Resolution**: Lower `min_out` to accept more slippage, or retry when
market conditions improve.

---

### `Error(Contract, #43)` — `RebalanceCooldownActive`

**Description**: The minimum rebalance interval has not yet elapsed since
the last successful `rebalance` or `harvest` call.

**Conditions**:
- `rebalance`, `rebalance_multi`, or `harvest` called before
  `current_ledger - LastRebalanceLedger >= MinRebalanceInterval`
- Only fires when the owner has configured `MinRebalanceInterval > 0`

**Resolution**: Wait until the cooldown has elapsed. Call
`get_last_rebalance_ledger()` and `get_rebalance_cooldown()` to compute the
next eligible ledger.

---

### `Error(Contract, #30)` — `OnlyAgentCanUpdateTotalAssets`

**Description**: The caller is not the authorized AI agent.

**Conditions**:
- `update_total_assets` called by an address that is neither the primary
  agent (`Agent` key) nor the standby agent (`StandbyAgent` key)

**Resolution**: Only the designated agent keypair may report yield. Rotate
the agent via `update_agent` / `confirm_agent_update` if the current key is
compromised.

---

### `Error(Contract, #31)` — `TotalAssetsDecreaseNotAllowed`

**Description**: The new total-assets value is lower than the current value,
but the `allow_decrease` flag was not set.

**Conditions**:
- `update_total_assets(new_total, false)` where `new_total < TotalAssets`

**Resolution**: Pass `allow_decrease = true` to explicitly authorize a
reduction. Ensure the reported loss is accurate before doing so.

---

### `Error(Contract, #32)` — `DecreaseExceedsMaximumAllowedBps`

**Description**: The reported decrease in total assets exceeds the
owner-configured maximum basis-point cap per update.

**Conditions**:
- `update_total_assets` with `allow_decrease = true`, but
  `(TotalAssets - new_total) / TotalAssets > MaxDecreaseBps / 10_000`
- Default floor is 100 bps (1%)

**Resolution**: The decrease is larger than the single-event cap allows.
Submit multiple smaller updates, or the owner can increase the cap.

---

### `Error(Contract, #33)` — `InsufficientBalanceForAssets`

**Description**: The vault's actual on-chain USDC balance is less than the
total assets value being reported.

**Conditions**:
- `update_total_assets` would set `TotalAssets` to a value higher than the
  vault's verified on-chain balance (idle + deployed)

**Resolution**: The reported value is inconsistent with verifiable on-chain
state. Audit deployed protocol balances before calling `update_total_assets`.

---

### `Error(Contract, #77)` — `InvalidAllocation` / `RateLimitExceeded`

This code has **two uses** — see note below.

**As `InvalidAllocation`** (multi-protocol mode):
- `rebalance_multi` called with a leg outside the `0..=10_000` bps range, or
  where `blend_bps + dex_bps > 10_000`
- `enable_multi_protocol(false)` called while both Blend and DEX hold funds

**As `RateLimitExceeded`** (rate limiting):
- A user or global rate-limit bucket is exhausted for the current window

**Resolution**:
- For allocation: ensure each leg is `0–10,000` bps and their sum does not
  exceed 10,000.
- For rate limiting: wait for the current window to reset. Call
  `get_user_rate_limit_state` or `get_global_rate_limit_state` to see bucket
  state.

> **Note — dual use**: Code 77 is shared by `InvalidAllocation` (multi-protocol
> allocation errors) and `RateLimitExceeded` (rate-limit exhaustion). Both
> names exist as enum variants in the contract source; they map to the same
> numeric code at runtime.

---

### `Error(Contract, #78)` — `MultiProtocolNotEnabled` / `InvalidRateLimitCategory`

This code has **two uses** — see note below.

**As `MultiProtocolNotEnabled`**:
- `rebalance_multi` called while `MultiProtocolEnabled == false`

**As `InvalidRateLimitCategory`**:
- `set_rate_limit` called with a category symbol not in the supported set

**Resolution**:
- For multi-protocol: the owner must call `enable_multi_protocol(true)` first.
- For rate limit: use one of the valid categories: `"deposit"`, `"withdraw"`,
  `"rebalance"`, `"touch_ttl"`, `"preview"`, `"batch_dep"`.

> **Note — dual use**: Code 78 is shared by `MultiProtocolNotEnabled` and
> `InvalidRateLimitCategory`.

---

### `Error(Contract, #79)` — `MultiProtocolEnabledError` / `InvalidRateLimitConfig`

This code has **two uses** — see note below.

**As `MultiProtocolEnabledError`**:
- A single-protocol function (e.g., `rebalance`) was called while
  `MultiProtocolEnabled == true`

**As `InvalidRateLimitConfig`**:
- `set_rate_limit` called with `max_calls > 0` but `window_ledgers == 0`

**Resolution**:
- For multi-protocol: use `rebalance_multi` when multi-protocol mode is
  active.
- For rate limit: provide a non-zero `window_ledgers` whenever `max_calls > 0`.

> **Note — dual use**: Code 79 is shared by `MultiProtocolEnabledError` and
> `InvalidRateLimitConfig`.

---

## Category: Owner Errors

Errors triggered when the vault owner calls administrative functions with
invalid parameters, in the wrong order, or without proper authorization.

---

### `Error(Contract, #19)` — `OnlyOwnerCanPause`

**Description**: The caller is not the stored owner address.

**Conditions**:
- `pause(owner)` called with an `owner` argument that does not match the
  stored `Owner` key

**Resolution**: Only the current vault owner may pause. Confirm you are
signing with the correct keypair.

---

### `Error(Contract, #20)` — `OnlyOwnerCanUnpause`

**Description**: The caller is not the stored owner address.

**Conditions**:
- `unpause(owner)` called with an `owner` argument that does not match the
  stored `Owner` key
- Also returned by `reset_circuit_breaker` with a non-owner caller

**Resolution**: Only the current vault owner may unpause.

---

### `Error(Contract, #21)` — `NotPaused`

**Description**: `unpause` was called but the vault is not currently paused.

**Conditions**:
- `unpause` called while `Paused == false`

**Resolution**: There is nothing to unpause. The vault is already operating
normally.

---

### `Error(Contract, #22)` — `OnlyOwnerCanEmergencyPause`

**Description**: The caller is not the stored owner address.

**Conditions**:
- `emergency_pause(owner)` called with a non-owner `owner` argument

**Resolution**: Only the current vault owner may trigger an emergency pause.

---

### `Error(Contract, #23)` — `TvlCapCannotBeNegative`

**Description**: A negative TVL cap was supplied.

**Conditions**:
- `set_tvl_cap(cap)` with `cap < 0`
- `set_caps(user_cap, tvl_cap)` with `tvl_cap < 0`

**Resolution**: Pass a non-negative value. Use `0` to remove the cap
entirely.

---

### `Error(Contract, #24)` — `UserDepositCapCannotBeNegative`

**Description**: A negative per-user deposit cap was supplied.

**Conditions**:
- `set_user_deposit_cap(cap)` with `cap < 0`
- `set_caps(user_cap, tvl_cap)` with `user_cap < 0`

**Resolution**: Pass a non-negative value. Use `0` to remove the cap.

---

### `Error(Contract, #25)` — `TvlCapBelowUserDepositCap`

**Description**: The TVL cap is lower than the per-user deposit cap, which
would make the user cap meaningless.

**Conditions**:
- `set_caps(user_cap, tvl_cap)` where both are non-zero and
  `tvl_cap < user_cap`

**Resolution**: Ensure the TVL cap is at least as large as the per-user cap,
or set one of them to `0`.

---

### `Error(Contract, #28)` — `OnlyOwnerCanConfigurePool`

**Description**: The caller is not the stored owner.

**Conditions**:
- `set_blend_pool` or `set_dex_pool` called by a non-owner

**Resolution**: Only the vault owner may configure protocol pool addresses.

---

### `Error(Contract, #34)` — `CallerIsNotOwner`

**Description**: The caller is not the stored owner.

**Conditions**:
- Any owner-only function called by a non-owner address (generic fallback
  for functions not covered by more specific variants above)
- `emergency_harvest` called by a non-owner

**Resolution**: Sign the transaction with the current vault owner's keypair.
Call `get_owner()` to verify the active owner address.

---

### `Error(Contract, #44)` — `ApprovalTtlTooLow`

**Description**: The requested approval TTL is below the minimum of 1,000
ledgers (~83 minutes).

**Conditions**:
- `set_approval_ttl(ttl)` with `ttl < 1_000`

**Resolution**: Pass a TTL of at least 1,000 ledgers. Typical values are
100,000 (default, ~5.7 days) to 17,280 (~24 hours).

---

### `Error(Contract, #45)` — `ApprovalTtlTooHigh`

**Description**: The requested approval TTL exceeds the maximum of 500,000
ledgers (~29 days).

**Conditions**:
- `set_approval_ttl(ttl)` with `ttl > 500_000`

**Resolution**: Pass a TTL of at most 500,000 ledgers.

---

### `Error(Contract, #46)` — `DexPoolNotConfigured`

**Description**: A rebalance to the DEX was requested but no DEX pool address
has been set.

**Conditions**:
- `rebalance("dex", ...)` called before the owner has called `set_dex_pool`
- `rebalance_multi(0, dex_bps > 0, ...)` before `set_dex_pool`

**Resolution**: The owner must call `set_dex_pool(pool_address)` before the
agent can deploy funds to the DEX.

---

### `Error(Contract, #18)` — `BlendPoolNotConfigured`

**Description**: A rebalance to Blend was requested but no Blend pool address
has been set.

**Conditions**:
- `rebalance("blend", ...)` called before the owner has called `set_blend_pool`
- `rebalance_multi(blend_bps > 0, 0, ...)` before `set_blend_pool`

**Resolution**: The owner must call `set_blend_pool(pool_address)` before
the agent can deploy funds to Blend.

---

### `Error(Contract, #29)` — `CallerIsNotPendingOwner`

**Description**: `accept_ownership` was called by an address that is not the
pending owner.

**Conditions**:
- `accept_ownership` called by the wrong address, or before any ownership
  transfer was initiated

**Resolution**: The address that was nominated via `transfer_ownership` must
call `accept_ownership`. Verify the pending owner via `get_pending_ownership`.

---

### `Error(Contract, #48)` — `TimelockAlreadyPending`

**Description**: A timelocked proposal (agent update or upgrade) is already
pending.

**Conditions**:
- `update_agent(new_agent)` called while `PendingAgent` key already exists
- `schedule_upgrade(wasm_hash)` called while `PendingUpgradeHash` already exists

**Resolution**: Cancel the existing proposal with `cancel_agent_update()` or
`cancel_upgrade()` before scheduling a new one.

---

### `Error(Contract, #49)` — `NoTimelockPending`

**Description**: No timelocked proposal exists to confirm or cancel.

**Conditions**:
- `confirm_agent_update()` or `cancel_agent_update()` called when no
  `PendingAgent` exists
- `execute_upgrade()` or `cancel_upgrade()` called when no
  `PendingUpgradeHash` exists

**Resolution**: A proposal must first be submitted via `update_agent` or
`schedule_upgrade`.

---

### `Error(Contract, #50)` — `TimelockNotExpired`

**Description**: The 24-hour timelock window has not yet elapsed.

**Conditions**:
- `confirm_agent_update()` called before `current_ledger >= AgentTimelockExpiry`
- `execute_upgrade()` called before `current_ledger >= UpgradeTimelockExpiry`

**Resolution**: Wait approximately 24 hours (17,280 ledgers) after the
proposal was submitted. Call `get_pending_agent_update()` or
`get_pending_upgrade()` to read the effective ledger.

---

### `Error(Contract, #66)` — `MaximumDepositExceedsCeiling`

**Description**: The configured `MaxDeposit` limit exceeds the absolute
ceiling of 100,000 USDC.

**Conditions**:
- `set_deposit_limits(min, max)` with `max > MAX_DEPOSIT_CEILING`
  (100,000,000,000 stroops = 100,000 USDC)

**Resolution**: Keep the per-transaction maximum at or below 100,000 USDC.

---

### `Error(Contract, #67)` — `MigrationPaused`

**Description**: The vault owner has paused share migration.

**Conditions**:
- `migrate_shares(user)` called while `MigrationPaused == true`

**Resolution**: Contact the vault operator. Migration can be re-enabled via
`set_migration_paused(false)`.

---

### `Error(Contract, #68)` — `InvalidMigrationTarget`

**Description**: No migration target vault has been configured by the owner.

**Conditions**:
- `migrate_shares(user)` called when no `MigrationTarget` key exists in
  storage

**Resolution**: The vault operator must call `set_migration_target(address)`
before users can migrate their shares.

---

### `Error(Contract, #76)` — `InvalidHoldingPeriod`

**Description**: An invalid holding-period configuration was provided.

**Conditions**:
- `set_min_holding_period` called with a value that fails internal validation

**Resolution**: Pass a non-negative ledger count. Pass `0` to disable the
holding period entirely.

---

### `Error(Contract, #81)` — `ProtocolAdapterNotConfigured`

**Description**: No adapter contract is registered for the requested protocol.

**Conditions**:
- Agent attempts to rebalance to a protocol that has no entry under
  `ProtocolAdapter(symbol)` in storage

**Resolution**: The owner must call `set_protocol_adapter(protocol, address)`
before the agent can deploy to that protocol.

---

### `Error(Contract, #82)` — `ProtocolNotWhitelisted`

**Description**: The requested protocol is not on the owner's whitelist.

**Conditions**:
- Agent attempts to rebalance to a protocol where
  `ProtocolWhitelist(symbol) == false` or the key is absent

**Resolution**: The owner must call `set_protocol_whitelisted(protocol, true)`
before the agent can use that protocol.

---

## Category: System Errors

Errors that indicate invariant violations, unexpected contract state, or
initialization problems. These are generally not user-recoverable without
operator intervention.

---

### `Error(Contract, #4)` — `AlreadyInitialized`

**Description**: `initialize` was called on a vault that has already been
set up.

**Conditions**:
- `initialize` called when the `Agent` key already exists in instance storage

**Resolution**: This is expected contract behavior — `initialize` is
idempotent in the sense that it rejects a second call. No action is needed.

---

### `Error(Contract, #5)` — `UnauthorizedDeployer`

**Description**: The `deployer` argument does not reproduce the vault's
contract address when combined with `salt`, or the deployer authorization
check failed.

**Conditions**:
- The `deployer + salt` pair does not hash to the current contract address
- The deployer's authorization signature is missing or invalid

**Resolution**: Re-deploy following the secure deployment sequence in
`README.md`. The deployer keypair and salt must be identical to those used
during `stellar contract deploy`.

---

### `Error(Contract, #6)` — `SharesToMintMustBePositive`

**Description**: The deposit amount rounds down to zero shares under the
current exchange rate.

**Conditions**:
- `deposit` amount is so small relative to the current share price that
  `floor(amount * TotalShares / TotalAssets) == 0`
- `batch_deposit` aggregate too small

**Resolution**: Deposit a larger amount. This guard prevents inflation-attack
dust deposits.

---

### `Error(Contract, #7)` — `InsufficientLiquidity`

**Description**: The vault does not have enough USDC available — either idle
or recoverable from protocols — to fulfill the withdrawal.

**Conditions**:
- `withdraw`: after attempting to retrieve funds from the active protocol,
  `actual_to_return == 0`
- `emergency_withdraw`: vault balance and protocol withdrawal both returned 0

**Resolution**: The vault may have liquidity deployed to a protocol that
cannot be immediately retrieved (e.g., Blend liquidity gap). Try again later
or contact the vault operator.

---

### `Error(Contract, #9)` — `NoAssetsToWithdraw`

**Description**: `TotalShares` or `TotalAssets` is zero, making withdrawal
impossible.

**Conditions**:
- `withdraw` or `emergency_withdraw` called when `TotalShares == 0` or
  `TotalAssets == 0`

**Resolution**: This should not occur under normal operation. If triggered,
it indicates the vault has no deposits. Contact the operator if unexpected.

---

### `Error(Contract, #10)` — `SharesToBurnMustBePositive`

**Description**: The share count needed to cover the requested withdrawal
rounded down to zero.

**Conditions**:
- `withdraw` computes `shares_to_burn == 0` for the given `actual_to_return`

**Resolution**: This is a guard against dust rounding. Withdraw a slightly
larger amount.

---

### `Error(Contract, #13)` — `NoLiquidityAvailable`

**Description**: After attempting to retrieve funds from the active protocol,
no USDC is available.

**Conditions**:
- `withdraw_all`: vault balance and protocol withdrawal both returned 0 for
  the partial-fill path

**Resolution**: The active protocol may be experiencing a liquidity shortage.
Try again later.

---

### `Error(Contract, #14)` — `NoAssetsToReturn`

**Description**: The vault has no assets to return after the share
calculation.

**Conditions**:
- `withdraw_all`: `usdc_to_return == 0` after protocol reconciliation

**Resolution**: This guard prevents zero-value transfers. Contact the vault
operator if triggered unexpectedly.

---

### `Error(Contract, #15)` — `NoSharesToBurn`

**Description**: The share count to burn is zero.

**Conditions**:
- `withdraw_all`: `shares_to_burn == 0` after partial-fill reconciliation

**Resolution**: Retry with the vault in a state where it has retrievable
liquidity.

---

### `Error(Contract, #35)` — `Paused`

**Description**: The vault is paused and the requested operation is not
allowed in a paused state.

**Conditions**:
- `deposit`, `withdraw`, `withdraw_all`, `rebalance`, `harvest`, or any other
  user/agent-facing function called while `Paused == true`

**Resolution**: Wait for the vault operator to unpause via `unpause()` or
`reset_circuit_breaker()`. If the pause is from the circuit breaker (3+
consecutive failed rebalances), the owner must investigate and reset.
Use `emergency_withdraw` if you need to exit while paused.

---

### `Error(Contract, #36)` — `NotInitialized`

**Description**: The vault has not been initialized.

**Conditions**:
- Any function called before `initialize` has been run (the `Agent` key does
  not exist in instance storage)

**Resolution**: Deploy and initialize the vault following the secure
deployment sequence in `README.md`.

---

### `Error(Contract, #62)` — `DeployerCannotBeZeroAddress`

**Description**: The `deployer` argument to `initialize` is the Stellar
zero address.

**Conditions**:
- `initialize(deployer, ...)` with
  `deployer == GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`

**Resolution**: Supply a real, funded deployer keypair. The zero address has
no private key and cannot sign transactions.

---

### `Error(Contract, #63)` — `OwnerCannotBeZeroAddress`

**Description**: The `owner` argument to `initialize` is the Stellar zero
address.

**Conditions**:
- `initialize(..., owner, ...)` with `owner == zero_address`

**Resolution**: Supply a real owner address with a known private key.

---

### `Error(Contract, #64)` — `AgentCannotBeZeroAddress`

**Description**: The `agent` argument to `initialize` is the Stellar zero
address.

**Conditions**:
- `initialize(..., agent, ...)` with `agent == zero_address`

**Resolution**: Supply a real agent address that corresponds to the AI
agent's keypair.

---

### `Error(Contract, #65)` — `UsdcTokenCannotBeZeroAddress`

**Description**: The `usdc_token` argument to `initialize` is the Stellar
zero address.

**Conditions**:
- `initialize(..., usdc_token, ...)` with `usdc_token == zero_address`

**Resolution**: Supply the USDC token contract address for the target network
(testnet or mainnet).

---

## Gap in Error Codes

Codes 26, 27 are reserved in the `ERROR_STYLE_GUIDE.md` legacy table
(`MinimumDepositTooLow` and `MaximumDepositBelowMinimum`) but are not
currently active enum variants in the contract. They are implemented as
associated constants aliased to `InvalidStrategy` (code 47) and do not
appear as distinct on-chain error codes.

Codes 51–61 are unassigned and reserved for future use.

---

## On-Chain Error Format

Soroban returns contract errors in the format `Error(Contract, #N)`.

```
Error(Contract, #35)  →  Paused
Error(Contract, #41)  →  ExceedsTvlCap
```

In test code, assert these as:

```rust
#[should_panic(expected = "Error(Contract, #35)")]
fn test_deposit_while_paused() { /* … */ }
```

In the TypeScript client, catch them as:

```typescript
import { Contract } from "@stellar/stellar-sdk";

try {
  await vaultClient.deposit({ user, amount });
} catch (err) {
  const code = parseVaultError(err); // extract the #N number
  const message = vaultErrorMessage(code);
  console.error(message);
}
```

---

## See Also

- [`ERROR_STYLE_GUIDE.md`](../ERROR_STYLE_GUIDE.md) — naming conventions and
  legacy message wording
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — share accounting math and storage
  layout that drives several error conditions
- [`SECURITY.md`](../SECURITY.md) — threat model and the pause/circuit-breaker
  semantics behind `Paused` (#35) and related errors
- [`docs/monitoring.md`](monitoring.md) — Prometheus alert rules referencing
  these error codes (e.g., `Error(Contract, #41)` cap-saturation alert)
