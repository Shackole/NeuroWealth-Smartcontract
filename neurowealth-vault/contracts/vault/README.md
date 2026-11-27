# Canonical Contract Source

This is the only checked-in Soroban vault crate. The historical root path
`contracts/` is a Git symlink to `neurowealth-vault/contracts/`, so paths such
as `contracts/vault/src/lib.rs` resolve to this exact source tree and cannot
drift independently.

All workspace builds, contract specification generation, CI checks, and
deployment scripts use `neurowealth-vault/` as the canonical workspace. Make
contract changes here and build/deploy from that workspace. The contract-spec
workflow runs `scripts/check-contract-mirror.sh` to ensure the root alias still
resolves to this tree.

## Batch deposit WASM budget

Run from the repository root. The ignored integration test prints CPU
instructions and metered memory bytes at one entry, half the configured
maximum rounded up, and the maximum (currently 1, 25, and 50 entries).

```sh
cd neurowealth-vault
rustup target add wasm32v1-none
cargo build --locked -p neurowealth-vault \
  --target wasm32v1-none --release
VAULT_BUDGET_WASM="${CARGO_TARGET_DIR:-$PWD/target}/wasm32v1-none/release/neurowealth_vault.wasm" \
  cargo test --locked -p neurowealth-vault --test batch_deposit_wasm_budget -- --ignored --nocapture
```

Each sample runs the release WASM against a fresh vault and Stellar Asset Contract,
with distinct first-time depositors and funded deposits. Setup and verification
are outside the measured interval. Unlimited metering captures costs even when
they exceed a transaction's budget. The **Vault WASM Budget** workflow publishes
the three measurements in its job summary.
