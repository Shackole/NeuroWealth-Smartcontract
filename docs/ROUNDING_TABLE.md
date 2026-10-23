# Rounding Behaviour — Asset and Share Conversions

> **Issue #429** — Specifies the rounding rule, boundary-value behaviour, and
> overflow handling for every conversion entrypoint in
> `neurowealth-vault/contracts/vault/src/lib.rs`.

---

## Summary table

| Entrypoint / helper | Direction | Rounding | Who benefits | Protects against |
|---|---|---|---|---|
| `deposit` (share mint) | assets → shares | **floor** | vault | over-minting shares |
| `withdraw` (share burn) | assets → shares | **ceil** | vault | dust-burn free-withdrawal |
| `withdraw` (assets returned) | shares → assets | **floor** | vault | over-paying user |
| `withdraw_all` (shares → assets) | shares → assets | **floor** | vault | over-paying user |
| `preview_deposit_to_shares` | assets → shares | **floor** | vault | matches `deposit` exactly |
| `preview_shares_to_assets` | shares → assets | **floor** | vault | matches redemption path |
| `preview_withdraw` | assets → shares | **ceil** | vault | matches `withdraw` exactly |
| `convert_to_shares` (ERC-4626) | assets → shares | **floor** | vault | over-minting shares |
| `convert_to_assets` (ERC-4626) | shares → assets | **floor** | vault | over-paying user |
| `batch_deposit` each leg | assets → shares | **floor** | vault | same as `deposit` |
| `migrate_shares` (assets leg) | shares → assets | **floor** | vault | over-transfer on migration |
| Per-asset pool (`deposit_asset`) | assets → shares | **floor** | vault | same as primary deposit |
| Per-asset pool (`withdraw_asset`) | assets → shares (burn) | **ceil** | vault | same as primary withdraw |

---

## Guiding principle

The vault follows the ERC-4626 rounding convention:

```text
Minting (deposit):   shares_minted  = floor(assets × total_shares / total_assets)
Burning (withdraw):  shares_burned  = ceil (assets × total_shares / total_assets)
Redemption:          assets_returned = floor(shares × total_assets / total_shares)
```

**Rounding always favours the vault**, never the individual user.  This is the
only convention that prevents the vault losing fractional value over a large
number of round-trips.

---

## Internal helper functions

### `convert_to_shares_internal` — floor

```rust
// Bootstrap (total_shares == 0 || total_assets == 0): shares = assets (1:1)
// Normal:  shares = assets × total_shares / total_assets  (integer floor)
assets
    .checked_mul(total_shares)
    .expect("vault: share conversion overflow")
    .checked_div(total_assets)
    .expect("vault: conversion div error")
```

Used by: `deposit`, `preview_deposit_to_shares`, `convert_to_shares`.

### `convert_to_shares_internal_ceil` — ceiling

```rust
// Bootstrap: shares = assets (assets is already an integer ≥ 1)
// Normal: ceil(assets × total_shares / total_assets)
//   = (assets × total_shares + total_assets − 1) / total_assets
let product   = assets.checked_mul(total_shares)   // overflow → panic
let numerator = product.checked_add(total_assets - 1) // overflow → panic
numerator.checked_div(total_assets)                // div by ≥1, no error
```

Used by: `withdraw` (share burn), `preview_withdraw`.

### `convert_to_assets_internal` — floor

```rust
// Bootstrap (total_shares == 0 || total_assets == 0): returns 0
// Normal: assets = shares × total_assets / total_shares  (integer floor)
shares
    .checked_mul(total_assets)
    .expect("vault: share to asset conversion overflow")
    .checked_div(total_shares)
    .expect("vault: conversion div error")
```

Used by: `withdraw` (assets returned), `withdraw_all`, `preview_shares_to_assets`,
`convert_to_assets`, `get_user_apy`, lock/migrate helpers.

---

## Boundary-value agreement between previews and execution

### Deposit path

| `assets` | `preview_deposit_to_shares` | Actual shares minted |
|---|---|---|
| `0` | `0` | rejected by `AmountMustBePositive` |
| `1` (1 stroop) | `1` (bootstrap) | `1` (bootstrap) |
| `total_assets` (exactly) | `total_shares` | `total_shares` |
| `total_assets − 1` | `total_shares − 1` | `total_shares − 1` |

The preview is identical to the live path because both call
`convert_to_shares_internal` directly.  No fee is applied in this vault.

### Withdraw path

| `assets` | `preview_withdraw` | Actual shares burned |
|---|---|---|
| `0` | `0` | rejected by `AmountMustBePositive` |
| `1` (1 stroop) | `ceil(total_shares / total_assets)` ≥ 1 | same (ceil) |
| `total_assets` | `total_shares` | `total_shares` |

The preview (`convert_to_shares_internal_ceil`) matches the actual `withdraw`
burn calculation exactly.

**Dust-withdrawal prevention**: because `ceil(x/y) ≥ 1` for any `x ≥ 1`,
it is impossible to withdraw any non-zero asset amount while burning zero
shares.  Attempts to do so are caught by the
`SharesToBurnMustBePositive` guard before the token transfer.

---

## Overflow handling

Every intermediate product uses Rust's `i128::checked_mul` /
`checked_add` / `checked_sub` / `checked_div`.  A `None` result calls
`expect(…)`, which maps to `panic_with_error!` under `#![no_std]` and
reverts the Soroban transaction atomically.

Maximum safe product: `i128::MAX ≈ 1.7 × 10^38`.  The largest plausible
intermediate is `amount × total_shares`:

```
max_amount      = i128::MAX  (theoretical)
max_total_shares= i128::MAX  (theoretical)
product_max     = i128::MAX² → panics before storing (overflow caught)
```

In practice the TVL cap (`DEFAULT_TVL_CAP = 100_000_000_000` stroops =
100 M USDC) and the user deposit cap keep both `amount` and
`total_shares` far below i128's range, so real-world products are orders
of magnitude smaller than the overflow boundary.  The `checked_*` guards
still catch any pathological inputs deterministically rather than
silently wrapping.

---

## Rounding tolerance in multi-protocol (allocation) mode

When `MultiProtocolEnabled` is `true`, `rebalance_multi` computes each
leg's allocation as:

```
leg_amount = total_assets × allocation_bps / 10_000   (floor)
```

Remainder (`total_assets mod 10_000`) is retained as idle USDC.  No leg
receives more than its proportional share.  The invariant:

```
idle + deployed_to_blend + deployed_to_dex ≤ total_assets
```

holds exactly (see `ASSET_CONSERVATION.md` for the full enforcement
proof).

---

## Validation procedure

The following Soroban unit-test files verify the rules above:

| Test file | What it checks |
|---|---|
| `tests/test_rounding_math.rs` | Floor/ceil helpers, boundary values |
| `tests/test_rounding_small_amounts.rs` | Sub-unit rounding edge cases |
| `tests/test_share_conversion_proptest.rs` | Property: `convert_to_assets(convert_to_shares(x)) ≤ x` |
| `tests/test_checked_arithmetic.rs` | Overflow panics on saturating inputs |
| `tests/test_math_limits.rs` | Near-i128-max boundary inputs |
| `tests/test_balance_shares_invariant.rs` | Vault balance ≥ 0 after rounding |

Run locally:

```bash
cd neurowealth-vault
cargo test
```

Expected: all tests pass.  Failing tests indicate a rounding-policy
regression.

---

*Authored for Issue #429 — last reviewed against `lib.rs` @ commit on branch
`feat/issue-429-rounding-table`.*
