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
