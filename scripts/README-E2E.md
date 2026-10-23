# NeuroWealth Vault — E2E Devnet Test Guide

A complete, runnable guide for executing the full end-to-end devnet test suite
from a **clean machine**. Follow every step in order the first time; subsequent
runs can skip the one-off setup sections.

> **Estimated duration:** A full E2E run (build + deploy + all scenarios) takes
> approximately **8–15 minutes** on a typical developer machine with a stable
> internet connection. The optional timelock scenarios (agent update, contract
> upgrade) require an additional **~24 hours** of real wall-clock time because
> the `UPGRADE_TIMELOCK_LEDGERS` / `AGENT_TIMELOCK_LEDGERS` constant is not
> shortened for devnet.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Build the Contract](#3-build-the-contract)
4. [Deploy to Devnet](#4-deploy-to-devnet)
5. [Run the Full E2E Suite](#5-run-the-full-e2e-suite)
6. [Run Individual Scenarios](#6-run-individual-scenarios)
7. [Verify Contract State](#7-verify-contract-state)
8. [Tear Down and Clean Up](#8-tear-down-and-clean-up)
9. [Troubleshooting](#9-troubleshooting)
10. [CI Integration](#10-ci-integration)

---

## 1. Prerequisites

Install and verify each tool before continuing. **Version mismatches are the
most common cause of local-vs-CI failures.**

### 1.1 Rust toolchain

```bash
# Install Rust stable (https://rustup.rs/)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Add the WASM compile target
rustup target add wasm32-unknown-unknown

# Verify
rustc --version        # e.g. rustc 1.78.0 (stable)
cargo --version        # e.g. cargo 1.78.0
```

### 1.2 Stellar CLI (pinned version)

The required version is stored in [`.stellar-version`](../.stellar-version) at
the repo root. **Always install this exact version** — a different version is
the leading cause of `stellar contract build` failures.

```bash
STELLAR_VERSION=$(cat .stellar-version | tr -d '[:space:]')
echo "Installing stellar-cli $STELLAR_VERSION …"
cargo install --locked stellar-cli --version "$STELLAR_VERSION" --features opt

# Verify
stellar --version   # must match the pinned version exactly
```

> If you already have a different version installed, `cargo install` will
> overwrite it. To keep multiple versions side-by-side, use
> `cargo install --root ~/.cargo-alt/stellar-$STELLAR_VERSION`.

### 1.3 jq (JSON processor)

```bash
# macOS
brew install jq

# Debian / Ubuntu
sudo apt-get install -y jq

# Fedora / RHEL
sudo dnf install -y jq

# Verify
jq --version   # e.g. jq-1.7.1
```

### 1.4 curl

```bash
# Usually pre-installed; verify with:
curl --version   # e.g. curl 8.4.0 …

# If missing on Debian/Ubuntu:
sudo apt-get install -y curl
```

### 1.5 Python 3 (used by spec-validation scripts)

```bash
python3 --version   # e.g. Python 3.11.9
```

### 1.6 A funded devnet / testnet account

The E2E script auto-generates and funds identities via Friendbot. If you want
to supply your own pre-funded key (e.g., for a CI secret), see §2.2.

To manually create and fund an account before running the suite:

1. Visit <https://laboratory.stellar.org/#account-creator?network=testnet>
2. Click **Generate Keypair** and copy both the *Public Key (G…)* and the
   *Secret Key (S…)*.
3. Click **Fund account on Testnet** (calls Friendbot automatically) or run:

```bash
curl "https://friendbot.stellar.org?addr=<YOUR_G_ADDRESS>"
# Expected response: {"hash":"…","ledger":…,"envelope_xdr":"…",…}
```

> **Devnet vs. testnet note:** NeuroWealth's E2E scripts target the public
> Stellar **testnet** (not a private devnet). Both terms are used interchangeably
> in this project. The default RPC endpoint is
> `https://soroban-testnet.stellar.org`.

---

## 2. Environment Setup

### 2.1 Clone and enter the repository

```bash
git clone https://github.com/Shackole/NeuroWealth-Smartcontract.git
cd NeuroWealth-Smartcontract
```

### 2.2 Configure environment variables

Copy the template and fill in your secret key:

```bash
cp .env.devnet.template .env.devnet
```

Open `.env.devnet` in your editor. The only **required** change is
`SOROBAN_SECRET_KEY`; everything else has working defaults:

```bash
# .env.devnet — required fields
SOROBAN_SECRET_KEY=S...   # secret key of your funded testnet account

# Optional overrides (defaults shown)
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
SOROBAN_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
E2E_TIMEOUT_SECS=300
```

If you leave `SOROBAN_SECRET_KEY` unset, the script generates a fresh
identity and funds it via Friendbot automatically (requires internet access).

| Variable | Default | Description |
|---|---|---|
| `SOROBAN_SECRET_KEY` | *(auto-generated)* | Funded testnet deployer key |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `SOROBAN_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Network passphrase |
| `E2E_TIMEOUT_SECS` | `300` | Per-command timeout (seconds) |
| `E2E_TEST_TIMELOCK` | *(unset)* | Set to `true` to enable timelock scenarios |

---

## 3. Build the Contract

From the repository root:

```bash
cd neurowealth-vault
stellar contract build
```

The compiled WASM is written to:

```
neurowealth-vault/target/wasm32-unknown-unknown/release/neurowealth_vault.wasm
```

**Sample output:**

```
   Compiling neurowealth-vault v0.1.0 (…/neurowealth-vault/contracts/vault)
    Finished release [optimized] target(s) in 42.3s
```

**Verify the WASM was produced:**

```bash
ls -lh neurowealth-vault/target/wasm32-unknown-unknown/release/neurowealth_vault.wasm
# Expected: file exists, size roughly 100–300 KB
```

Return to the repo root before continuing:

```bash
cd ..
```

---

## 4. Deploy to Devnet

Run the deployment script from the repo root. It deploys the USDC token
contract and the vault contract, initialises the vault, mints test USDC, and
writes all contract addresses to `scripts/devnet-contracts.env`.

```bash
./scripts/deploy-devnet.sh
```

**Sample output:**

```
[2024-06-15T10:23:01Z] =========================================================
[2024-06-15T10:23:01Z]   NeuroWealth Vault — Devnet Deploy
[2024-06-15T10:23:01Z] =========================================================
[2024-06-15T10:23:03Z] Deploying USDC token contract …
[2024-06-15T10:23:09Z] USDC Token deployed: CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4
[2024-06-15T10:23:11Z] Deploying vault contract …
[2024-06-15T10:23:17Z] Vault deployed: CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4
[2024-06-15T10:23:19Z] Initializing vault …
[2024-06-15T10:23:22Z] Vault initialized.
[2024-06-15T10:23:22Z] Minting 10,000 test USDC …
[2024-06-15T10:23:25Z] Done. Addresses written to scripts/devnet-contracts.env
```

**Load the deployed addresses into your shell:**

```bash
source scripts/devnet-contracts.env

echo "Vault:      $VAULT_CONTRACT_ID"
echo "USDC token: $USDC_TOKEN_ADDRESS"
echo "Owner:      $OWNER_ADDRESS"
echo "Agent:      $AGENT_ADDRESS"
```

---

## 5. Run the Full E2E Suite

```bash
./scripts/e2e-devnet.sh
```

The script runs all scenarios automatically. Final output looks like:

```
[2024-06-15T10:25:44Z] =========================================================
[2024-06-15T10:25:44Z]   FINAL RESULTS
[2024-06-15T10:25:44Z] =========================================================
[2024-06-15T10:25:44Z] Contract ID:  CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4
[2024-06-15T10:25:44Z] USDC Token:   CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4
[2024-06-15T10:25:44Z] Deployer:     GDEPLOY…
[2024-06-15T10:25:44Z] User:         GUSER…
[2024-06-15T10:25:44Z]
[2024-06-15T10:25:44Z] Scenarios passed: 12
[2024-06-15T10:25:44Z] Scenarios failed: 0
[2024-06-15T10:25:44Z]
[2024-06-15T10:25:44Z] E2E VALIDATION PASSED — All scenarios succeeded.
```

### Scenarios covered

| # | Scenario | What it verifies |
|---|----------|-----------------|
| 1 | Contract deployment | WASM deploys to testnet; transaction succeeds |
| 2 | USDC token deployment | SAC / test token contract available |
| 3 | Initialize | Vault init with separate deployer, owner, agent + USDC token; double-init rejected |
| 4 | Deposit | Basic deposit flow — token transfer recorded, shares minted, `DepositEvent` emitted |
| 5 | Withdraw | Partial withdrawal — shares burned proportionally, USDC returned |
| 6 | Pause / Unpause | `pause` blocks deposits & withdrawals; `unpause` restores normal operation |
| 7 | Rebalance | Agent-initiated rebalance to `"none"` protocol; `RebalanceEvent` emitted |
| 8 | Withdraw all | Full balance withdrawal — `withdraw_all` burns all shares |
| 9 | Event verification | Expected event topics present in contract event feed |
| 10 | Read-only getter sweep | All public view functions return valid, non-error values |
| 11† | Agent update timelock | Propose → wait 24 h → confirm agent rotation (optional) |
| 12† | Upgrade timelock | Schedule → wait 24 h → execute or cancel upgrade (optional) |

† Scenarios 11 and 12 require `E2E_TEST_TIMELOCK=true` and a ~24-hour wait.

### Artifacts

All outputs are saved to `scripts/e2e-artifacts/`:

| File | Contents |
|------|----------|
| `contract_id.txt` | Deployed vault contract ID |
| `usdc_token_id.txt` | Test USDC token contract ID |
| `deployer_address.txt` | Deployer / agent address |
| `user_address.txt` | Test user address |
| `tx_initialize.txt` | Raw output from initialize transaction |
| `tx_deposit.txt` | Raw output from deposit transaction |
| `tx_withdraw.txt` | Raw output from partial withdraw |
| `tx_pause.txt` | Raw output from pause |
| `tx_unpause.txt` | Raw output from unpause |
| `tx_rebalance.txt` | Raw output from rebalance |
| `tx_withdraw_all.txt` | Raw output from withdraw_all |
| `events.txt` | Contract events fetched after all scenarios |
| `summary.txt` | Pass/fail summary for each scenario |
| `post_upgrade_smoke.txt` | Read-only getter sweep results |
| `full_output.log` | Complete stdout (CI only) |

---

## 6. Run Individual Scenarios

You can re-run any specific flow manually using `stellar contract invoke`.
Source the contract addresses first:

```bash
source scripts/devnet-contracts.env
```

### Deposit only

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  -- \
  deposit \
  --user "$AGENT_ADDRESS" \
  --amount 10000000      # 10 USDC (7 decimal places)
```

**Expected output:** `null` (success) — the contract emits a `DepositEvent`
but returns no value. A non-zero exit code or `Error(Contract, #N)` indicates
failure.

### Withdrawal only

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  -- \
  withdraw \
  --user "$AGENT_ADDRESS" \
  --amount 5000000       # 5 USDC
```

**Expected output:** `null` (success).

### Withdraw all

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  -- \
  withdraw_all \
  --user "$AGENT_ADDRESS"
```

**Expected output:** `null` (success). After this call `get_balance` returns
`"0"`.

### Full rebalance flow (to "none" protocol)

Rebalance moves idle funds to a yield protocol. Using `"none"` is safe for
E2E testing because it simply keeps funds in the vault.

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  -- \
  rebalance \
  --protocol "none" \
  --expected_apy 0 \
  --min_out 0
```

**Expected output:** `null` (success). A `RebalanceEvent` is emitted on-chain.

### Pause / Unpause

```bash
# Pause (owner key required)
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  -- \
  pause \
  --owner "$OWNER_ADDRESS"

# Unpause (owner key required)
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  -- \
  unpause \
  --owner "$OWNER_ADDRESS"
```

---

## 7. Verify Contract State

Use read-only getter invocations (no auth required, no XLM fees) to inspect
the on-chain state at any time.

### Check user balance

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  --send=no \
  -- \
  get_balance \
  --user "$AGENT_ADDRESS"
# Expected: "10000000" (after a 10 USDC deposit, 7 decimals)
```

### Check total TVL

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  --send=no \
  -- \
  get_total_deposits
# Expected: integer representing total principal deposited in stroops
```

### Check idle vs. deployed assets

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  --send=no \
  -- \
  get_asset_breakdown
# Expected: "(idle_amount, deployed_amount)" tuple
```

### Check exchange rate

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  --send=no \
  -- \
  get_exchange_rate
# Expected: "10000000" initially (1:1 ratio × 10^7 scale factor)
```

### Check owner and agent addresses

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  --send=no \
  -- \
  get_owner

stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  --send=no \
  -- \
  get_agent
```

### Check pause state

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  --send=no \
  -- \
  is_paused
# Expected: "false" when vault is operational
```

### Run the full post-deploy verification script

This script performs all the above checks in one pass and asserts they match
expected values:

```bash
VAULT_CONTRACT_ID="$VAULT_CONTRACT_ID" \
NETWORK=testnet \
OWNER_ADDRESS="$OWNER_ADDRESS" \
AGENT_ADDRESS="$AGENT_ADDRESS" \
AGENT_SECRET_KEY="$AGENT_SECRET_KEY" \
USDC_TOKEN_ADDRESS="$USDC_TOKEN_ADDRESS" \
./scripts/verify-deployment.sh
```

**Expected output (all checks passing):**

```
[…] PASS: get_agent matches AGENT_ADDRESS
[…] PASS: get_owner matches OWNER_ADDRESS
[…] PASS: owner != agent (key separation confirmed)
[…] PASS: get_usdc_token matches USDC_TOKEN_ADDRESS
[…] PASS: is_paused is false (vault operational)
[…] PASS: get_version returned 1 (initialized)
…
==================== VERIFICATION REPORT ====================
  VAULT_CONTRACT_ID : CBBB…
  NETWORK           : testnet
  Checks run        : 14
  Checks passed     : 14
  Checks failed     : 0
=============================================================
[…] All deployment checks passed.
```

---

## 8. Tear Down and Clean Up

Remove local CLI identities and artifacts generated by the E2E run:

```bash
./scripts/e2e-restore.sh
```

**Expected output:**

```
=== NeuroWealth E2E Cleanup ===

Removed identity: e2e-deployer
Removed identity: e2e-user
Identity not found (already clean): e2e-new-agent

Removed artifacts directory: scripts/e2e-artifacts

Cleanup complete.

NOTE: On-chain testnet state (deployed contracts, transactions) cannot
be deleted. Stellar testnet is periodically reset by the SDF.
```

To remove identities but keep artifacts for post-run inspection:

```bash
./scripts/e2e-restore.sh --keep-artifacts
```

> On-chain testnet state (deployed contracts, transactions) **cannot** be
> deleted. The Stellar testnet is periodically reset by the SDF, which will
> clean up all stale contracts automatically.

---

## 9. Troubleshooting

### Expired devnet / testnet funding (Friendbot limit)

**Symptom:** Deposit or transfer transactions fail with:
```
Error: insufficient funds
```
or:
```
op_underfunded
```

**Fix:** Re-fund the testnet account:

```bash
curl "https://friendbot.stellar.org?addr=$(stellar keys address e2e-deployer)"
curl "https://friendbot.stellar.org?addr=$(stellar keys address e2e-user)"
```

Or regenerate identities from scratch:

```bash
./scripts/e2e-restore.sh
./scripts/e2e-devnet.sh
```

---

### RPC timeouts / connection errors

**Symptom:**
```
Error: request timeout after 300s
```
or:
```
Failed to connect to soroban-testnet.stellar.org
```

**Fixes:**
1. Check Stellar testnet status at <https://status.stellar.org>.
2. Increase the timeout: `export E2E_TIMEOUT_SECS=600` before re-running.
3. Switch to a community RPC endpoint (e.g., a local quickstart node):
   ```bash
   export SOROBAN_RPC_URL=http://localhost:8000/soroban/rpc
   export SOROBAN_NETWORK_PASSPHRASE="Standalone Network ; February 2017"
   ```

---

### Stellar CLI / soroban CLI version mismatch

**Symptom:** Contract invocation fails with unexpected XDR parse errors, or
`cargo build` produces a WASM that fails to deploy.

**Fix:** Reinstall the pinned version:

```bash
STELLAR_VERSION=$(cat .stellar-version | tr -d '[:space:]')
cargo install --locked stellar-cli --version "$STELLAR_VERSION" --features opt --force
```

---

### `WASM not found` build error

**Symptom:**
```
ERROR: WASM build failed — neurowealth-vault/target/…/neurowealth_vault.wasm not found.
```

**Fix:**

```bash
# Ensure the wasm32 target is installed
rustup target add wasm32-unknown-unknown

# Build manually
cd neurowealth-vault
RUSTFLAGS="-C target-cpu=mvp" cargo build \
  --target wasm32-unknown-unknown \
  --release
cd ..
```

---

### Double-init error on re-run

**Symptom:** Scenario 3 fails with:
```
Error(Contract, #AlreadyInitialized)
```

**Cause:** A previous run already deployed and initialized a vault. The E2E
script deploys a fresh contract each time, but if the deploy step was skipped
and the old contract ID is still in `devnet-contracts.env`, the init will
reject the second call.

**Fix:** Delete the old env file and re-run from deploy:

```bash
rm -f scripts/devnet-contracts.env scripts/e2e-artifacts/*
./scripts/deploy-devnet.sh
./scripts/e2e-devnet.sh
```

---

### Event verification skipped

**Symptom:** Scenario 9 reports:
```
PASS: event_verification (skipped — RPC limitation)
```

**Cause:** Some RPC endpoints do not support `stellar contract events`. This
is expected on certain public nodes and does not indicate a contract failure.

**Fix:** Use an RPC endpoint that supports event queries, or verify events
directly on [StellarExpert](https://stellar.expert/explorer/testnet) using
the contract ID from `scripts/e2e-artifacts/contract_id.txt`.

---

### Rebalance cooldown active

**Symptom:** The rebalance scenario fails with:
```
Error(Contract, #RebalanceCooldownActive)
```

**Cause:** A previous rebalance ran within the cooldown window.

**Fix:** Wait for the cooldown to expire (number of ledgers set via
`get_rebalance_cooldown`), or disable it temporarily in a test environment:

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$AGENT_SECRET_KEY" \
  --network testnet \
  -- \
  set_rebalance_cooldown \
  --owner "$OWNER_ADDRESS" \
  --interval 0
```

---

### Identity already exists warning

**Symptom:**
```
Identity 'e2e-deployer' already exists
```

**Cause:** A previous run created the identity and it was not cleaned up.

**Fix:** Either continue (the script handles this gracefully), or run:

```bash
stellar keys rm e2e-deployer
stellar keys rm e2e-user
```

---

## 10. CI Integration

The E2E test suite runs via `.github/workflows/e2e-devnet.yml`:

| Trigger | Details |
|---------|---------|
| **Manual** | "Run workflow" button in GitHub Actions UI |
| **Nightly schedule** | Runs automatically at 03:00 UTC |
| **Artifacts** | Uploaded on both success and failure (14-day retention) |
| **Job summary** | Pass/fail counts and StellarExpert explorer links |

To view artifacts from a CI run:

1. Open the Actions tab in GitHub.
2. Click the relevant workflow run.
3. Scroll to **Artifacts** at the bottom of the summary page.
4. Download `e2e-artifacts.zip` and inspect `summary.txt` first.

For a full explanation of every artifact file, which outputs are safe to
delete between runs, and how to restore from CI artifact bundles, see
[`docs/E2E_ARTIFACT_LIFECYCLE.md`](../docs/E2E_ARTIFACT_LIFECYCLE.md).
