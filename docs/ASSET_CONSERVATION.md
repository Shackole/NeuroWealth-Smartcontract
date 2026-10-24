# Asset Conservation Across Allocation Modes

> **Issue #428** — Defines and enforces the accounting invariant relating idle
> assets, protocol deployments, and total managed assets across all allocation
> transitions in `neurowealth-vault/contracts/vault/src/lib.rs`.

---

## The invariant

At any point after a successful state-changing transaction the following
relationship must hold:

```
idle_balance + deployed_to_blend + deployed_to_dex ≤ total_assets
```

where:

| Term | Storage key | Description |
|---|---|---|
| `idle_balance` | live USDC token balance of the vault address | USDC held by the contract, not deployed anywhere |
| `deployed_to_blend` | `DataKey::DeployedToBlend` | Agent-tracked USDC currently supplied to the Blend pool |
| `deployed_to_dex` | `DataKey::DeployedToDex` | Agent-tracked USDC currently supplied to the DEX pool |
| `total_assets` | `DataKey::TotalAssets` | Authoritative share-pricing oracle, written by `update_total_assets` |

The relationship is `≤` rather than `=` because:

1. **Unreported yield** accumulates between `update_total_assets` calls.  The
   vault's live economic value (`idle + deployed`) grows continuously while
   `total_assets` advances in discrete steps.
2. **Rounding dust** from integer floor/ceil arithmetic can cause the sum of
   deployed legs to fall 1 stroop below the intended target; that remainder
   stays idle.

The invariant is never violated in the *over-deposit* direction
(`idle + deployed > total_assets`) because the vault only writes
`total_assets` upward (yield reporting) or downward by exactly the
USDC that leaves the contract on withdrawal.

---

## Single-protocol mode (`rebalance`)

### Entry conditions

`rebalance(protocol, expected_apy, min_out)` is gated by:

- `require_not_paused` — vault must be active
- `require_is_agent` — only the authorised AI agent may call
- `require_valid_allocation` for `protocol ∈ {"blend", "dex", "none"}`
- Rebalance cooldown (`MinRebalanceInterval`) — prevents rapid churn

### Protocol-exit guard (abort on incomplete exit)

When switching from protocol A to protocol B, the vault:

1. Calls `withdraw_from_protocol(current)` to redeem all deployed assets.
2. **Checks** `get_protocol_balance(current) == 0` after the withdrawal.
3. If any balance remains the rebalance emits `RebalanceFailedEvent` and
   **returns early without touching any further state**.

This is the primary conservation guard for protocol transitions:
**the vault never simultaneously has funds deployed to two exclusive-mode
protocols**.  The partial-accounting scenario (deposited to new protocol
without fully exiting the old one) is structurally impossible because the
supply leg is never reached when the exit leg is incomplete.

### Supply leg

After a clean exit (or when the current protocol already matches the target),
the vault supplies its entire idle USDC balance to the target protocol.
`DeployedToBlend` / `DeployedToDex` is updated by `sync_deployed_split`
immediately after the external call returns, using the on-chain balance delta
as the authoritative figure.

### `protocol = "none"` (idle mode)

Calling `rebalance("none", …)` exits the active protocol entirely and leaves
all USDC idle.  The `DeployedToBlend` / `DeployedToDex` keys are cleared by
`sync_deployed_split` after the successful exit.

### Accounting invariant after single-protocol rebalance

| Scenario | `idle` | `deployed_to_blend` | `deployed_to_dex` |
|---|---|---|---|
| After rebalance("blend") | 0 (all supplied) | `total_assets` (approx.) | 0 |
| After rebalance("dex") | 0 | 0 | `total_assets` (approx.) |
| After rebalance("none") | `total_assets` (approx.) | 0 | 0 |
| Partial supply (slippage) | residual | < `total_assets` | 0 |

"Approx." indicates the 1-stroop rounding tolerance described below.

---

## Multi-protocol mode (`rebalance_multi`)

### Entry conditions

`rebalance_multi(blend_bps, dex_bps, min_out)` is only reachable when
`MultiProtocolEnabled == true` (owner-gated via `enable_multi_protocol`).

Additional guards:

- `require_valid_allocation`: `blend_bps + dex_bps ≤ 10_000`; each in `0..=10_000`
- Per-venue pools must be configured if the corresponding `bps > 0`

### Allocation calculation

```rust
// split_by_bps implementation (floor):
blend_target = deployable × blend_bps / 10_000
dex_target   = deployable × dex_bps   / 10_000
// remainder  = deployable - blend_target - dex_target   (stays idle)
```

The `deployable` amount is `idle + blend_balance + dex_balance` — the
complete economic position visible to the vault at the time of the call.

Both divisions floor, so `blend_target + dex_target ≤ deployable`.  The
remainder is at most `2` stroops (one per leg) and is held idle in the vault,
satisfying the conservation inequality.

### Two-phase execution

**Phase 1 — exit over-allocated venues** (frees liquidity first):

```
if blend_balance > blend_target:
    withdraw(blend_balance - blend_target) from Blend
if dex_balance > dex_target:
    withdraw(dex_balance - dex_target) from DEX
```

Over-withdrawal is attempted before under-supply so that newly-freed funds
are available for the supply phase.  If an external withdrawal call fails
(e.g. protocol is frozen), the withdrawn amount is 0 and the vault's
`available` for Phase 2 is correspondingly reduced — no phantom assets are
injected into accounting.

**Phase 2 — supply under-allocated venues** (deploys freed liquidity):

```
available = idle_balance (re-queried after Phase 1)
if blend_target > blend_now and available > 0:
    supply min(blend_target - blend_now, available) to Blend
if dex_target > dex_now and available > 0:
    supply min(dex_target - dex_now, available) to DEX
```

The `min(want, available)` guard prevents over-commitment: the vault never
supplies more than it actually holds.

**Phase 3 — persist allocation and sync deployed state**:

```rust
env.storage().set(BlendAllocationBps, blend_bps);
env.storage().set(DexAllocationBps,   dex_bps);
let (deployed_to_blend, deployed_to_dex) = sync_deployed_split(&env);
set_current_protocol(env, derive_protocol_summary(deployed_to_blend, deployed_to_dex));
```

`sync_deployed_split` reads the live on-chain protocol balances
(cross-contract calls) and overwrites `DeployedToBlend` and `DeployedToDex`
with the authoritative figures, replacing any stale estimates.

### Failed external calls — no partial accounting state

If either protocol call in Phase 1 or Phase 2 reverts:

- The transaction reverts atomically (Soroban CEI semantics).
- All storage writes in the current invocation are rolled back.
- `DeployedToBlend`, `DeployedToDex`, `BlendAllocationBps`, and
  `DexAllocationBps` are all restored to their pre-call values.
- The vault returns to the state it was in before `rebalance_multi` was
  invoked: no partial accounting state is possible.

This is guaranteed by Soroban's single-transaction atomicity model — there is
no "commit partial writes" path.

---

## Rounding tolerances

| Operation | Rounding direction | Max deviation |
|---|---|---|
| `split_by_bps` blend leg | floor | ≤ 1 stroop below target |
| `split_by_bps` dex leg | floor | ≤ 1 stroop below target |
| `convert_to_assets_internal` (withdrawal) | floor | ≤ 1 stroop below requested |
| Combined idle after split | remainder | 0 – 2 stroops |

All deviations are in the vault's favour and satisfy the `≤ total_assets`
invariant.  See `docs/ROUNDING_TABLE.md` for the per-entrypoint rounding
policy.

---

## `get_asset_breakdown` — aggregate view

`get_asset_breakdown()` returns `(idle, deployed)` as an atomic snapshot:

```
idle     = USDC token balance of the vault contract address
deployed = get_protocol_balance(current_protocol)
```

In single-protocol mode `deployed` is the live balance of the one active
venue.  In multi-protocol mode `deployed` is the sum of both venues'
balances (read via `get_protocol_balance("multi")`).

Both reads occur in the same invocation so they cannot straddle a rebalance.

---

## Verification procedure

The following Soroban test files exercise the invariant across all allocation
transitions:

| Test file | What it checks |
|---|---|
| `tests/test_asset_breakdown.rs` | `idle + deployed` consistency after each operation |
| `tests/test_asset_split.rs` | `split_by_bps` floor arithmetic and idle remainder |
| `tests/test_multi_protocol.rs` | Multi-protocol allocation transitions end-to-end |
| `tests/test_rebalance_integration.rs` | Single-protocol rebalance lifecycle |
| `tests/test_balance_shares_invariant.rs` | `total_assets` never goes negative |
| `tests/test_transfer_delta_sanity.rs` | Balance-delta accounting after every external call |
| `tests/test_pool_rotation_with_deployed_funds.rs` | Protocol rotation with non-zero deployment |
| `tests/test_update_total_assets_blend.rs` | `update_total_assets` correctness for Blend |
| `tests/test_update_total_assets_dex.rs` | `update_total_assets` correctness for DEX |

Run locally:

```bash
cd neurowealth-vault
cargo test
```

Expected: all tests pass.

---

*Authored for Issue #428 — last reviewed against `lib.rs` @ commit on branch
`feat/issue-428-asset-conservation`.*
