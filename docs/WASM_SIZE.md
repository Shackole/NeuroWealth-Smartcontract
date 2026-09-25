# WASM Size Management

## CI Limit

The CI pipeline enforces a **1.2 MB safety budget** and a **1.5 MB repository-configured ceiling** (configurable via `WASM_SIZE_BUDGET_BYTES` and `WASM_SIZE_LIMIT_BYTES` in `.github/workflows/ci.yml`). The budget is 20% below that ceiling. Confirm the live network's `maxContractSizeBytes` independently before deployment; the repository setting is not a substitute for querying the target network.

Stellar's Soroban network enforces a `maxContractSizeBytes` network parameter that caps how large a contract WASM can be when uploaded via `stellar contract upload`. The CI gate sits well below that limit to catch unintentional bloat early and leave room for future feature additions.

## Trend Tracking

The CI workflow records optimised sizes for successful main/develop pushes in `.github/wasm-size-history.json`, keeps the latest ten measurements per branch, and uses the base branch's latest measurement when a PR runs. The PR check reports the size delta in the workflow summary. The history file is seeded by the next successful main/develop build; it is not populated with estimates.

## Why This Matters

| Issue | Consequence |
|-------|-------------|
| WASM > network `maxContractSizeBytes` | Deployment transaction rejected by the Soroban network |
| WASM > 1.2 MB safety budget | PR blocked until size is reduced or the budget is deliberately changed |
| WASM > 1.5 MB repository ceiling | CI fails; deployments must also be checked against the target network parameter |
| Gradual growth | Limits room for future feature additions |

## How to Reduce WASM Size

1. **Audit new dependencies** — `cargo bloat --release --crates` shows which crates contribute most to binary size.
2. **Use `no-default-features`** — disable crate features you don't need.
3. **Prefer `soroban-sdk` primitives** — avoid pulling in heavy `std` types where a simpler alternative exists.
4. **Avoid `format!` / `String` in hot paths** — string formatting pulls in significant code.
5. **Run `wasm-opt` locally** to see the post-optimisation size before pushing:
   ```bash
   RUSTFLAGS="-C target-cpu=mvp" cargo build \
     --target wasm32-unknown-unknown --release
   wasm-opt --strip-target-features --mvp-features \
     target/wasm32-unknown-unknown/release/neurowealth_vault.wasm \
     -o /tmp/vault_opt.wasm
   wc -c /tmp/vault_opt.wasm
   ```

## Size Trend Log

The table below preserves the measured values available in the previous documentation.
For current rolling history, use `.github/wasm-size-history.json`; CI retains ten
successful main/develop measurements. A fresh size must be measured by CI or a local
`wasm-opt` build before adding a new numeric row; do not estimate it.

| Date | Commit | Description | Optimised size (bytes) | Delta |
|------|--------|-------------|------------------------|-------|
| 2026-07-29 | *(baseline — pre-harvest feature)* | Baseline before harvest() code path was added | 487,312 | — |
| 2026-07-29 | *(harvest PR)* | Added `harvest()`, `HarvestEvent`, `TOPIC_HARVEST`, cooldown reuse via `LastRebalanceLedger` | 492,048 | +4,736 |

> **How to update this table:** after a PR materially changes contract size, take the measured
> post-`wasm-opt` size from CI and append a row with the merge commit and change description.

---

## Adjusting the Limit

If a deliberate feature addition requires a larger binary, update `WASM_SIZE_LIMIT_BYTES` in `ci.yml` in the same PR and document the reason in the PR description.
