# NeuroWealth Mainnet Deployment Checklist

This document outlines the mandatory formal verification steps, configuration
parameters, and emergency readiness checks that must be successfully executed
before and during the deployment of the `NeuroWealthVault` smart contract to
the Stellar Mainnet.

> **Sign-off policy:** Every checkbox in this document must be ticked and
> countersigned by a named team member before any
> `./scripts/deploy.sh --network mainnet` invocation is permitted. Items marked
> **CRITICAL** are hard blockers — the deployment must not proceed without them.

---

## 📋 Table of Contents

1. [Key Management Setup (Separate Owner & Agent Keys)](#1-key-management-setup-separate-owner--agent-keys)
2. [Initialization Parameters & Deployment Verification](#2-initialization-parameters--deployment-verification)
3. [Administrative Caps & Deposit Limits Configuration](#3-administrative-caps--deposit-limits-configuration)
4. [Blend Pool Integration & Address Verification](#4-blend-pool-integration--address-verification)
5. [DEX Pool Integration & Address Verification](#5-dex-pool-integration--address-verification)
6. [Emergency Procedures & Pause Drill Runbook](#6-emergency-procedures--pause-drill-runbook)
7. [Upgrade & Governance Multisig Plan](#7-upgrade--governance-multisig-plan)
8. [Third-Party Security Audit & Formal Sign-off](#8-third-party-security-audit--formal-sign-off)
9. [Harvest Cooldown & Circuit-Breaker Configuration](#9-harvest-cooldown--circuit-breaker-configuration)
10. [Secret Scanning & Secrets Hygiene](#10-secret-scanning--secrets-hygiene)
11. [Emergency Contact List & On-Call Roster](#11-emergency-contact-list--on-call-roster)

---

## 1. Key Management Setup (Separate Owner & Agent Keys)

**CRITICAL — hard blocker.** The Owner and Agent keys must be completely
separate and generated independently.

### 🔍 Security Context

- **Owner (Cold / Multisig):** Holds administrative capabilities —
  pausing, unpausing, TVL/cap changes, contract upgrades. Must be kept
  securely offline (hardware wallet or Stellar multisig account).
- **AI Agent (Hot):** Used by the automated backend for frequent
  `rebalance` and `update_total_assets` calls. Lives in a hot environment
  (server memory) and faces a higher compromise risk.
- **Risk of key reuse:** A compromised AI agent backend would immediately
  compromise ownership and allow an attacker to upgrade the contract or
  block withdrawals.

### 📝 Actionable Checklist

- [ ] **Generate independent keypairs:** Owner address ($G_{owner}$) and
  Agent address ($G_{agent}$) must be completely separate with no shared
  key material.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Establish key storage environments:**
  - Owner private key: offline HSM, hardware wallet (e.g. Ledger), or
    Stellar Multisig account.
  - Agent private key: secrets vault (e.g., AWS Secrets Manager, HashiCorp
    Vault, Supabase Vault) with restricted read access.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Pre-launch address verification — confirm owner ≠ agent:**

  ```bash
  owner_addr=$(stellar contract invoke \
    --id $VAULT_CONTRACT_ID --network mainnet -- get_owner)
  agent_addr=$(stellar contract invoke \
    --id $VAULT_CONTRACT_ID --network mainnet -- get_agent)
  echo "Owner: $owner_addr"
  echo "Agent: $agent_addr"
  # Must print different addresses
  ```

  - **Signed off by:** _____________________________ Date: ___________

> **Automated check** — `scripts/verify-deployment.sh` asserts owner
> address, agent address, and owner ≠ agent separation in one command:
>
> ```bash
> VAULT_CONTRACT_ID=C... NETWORK=mainnet \
>   OWNER_ADDRESS=G... AGENT_ADDRESS=G... AGENT_SECRET_KEY=S... \
>   USDC_TOKEN_ADDRESS=G... \
>   ./scripts/verify-deployment.sh
> ```

---

## 2. Initialization Parameters & Deployment Verification

**CRITICAL — hard blocker.** Use the anti-front-running deployment flow.

### 🔍 Security Context

The contract verifies that the `deployer` address combined with the chosen
`salt` cryptographically reproduces the contract address, and requires the
deployer's live authorization signature (`deployer.require_auth()`). After
successful initialization the temporary deployer key has no further
privileged role.

### 📝 Actionable Checklist

- [ ] **Deployer key separation:** Generate a clean, single-use `deployer`
  keypair. Fund it with enough XLM to cover deployment fees.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Verify initialization parameters before submitting:**
  - `--deployer`: Address of the temporary deployer key
  - `--owner`: Verified cold/multisig owner address
  - `--agent`: Verified AI agent address
  - `--usdc_token`: Official Stellar Mainnet USDC contract address
    (verify on [StellarExpert](https://stellar.expert))
  - `--salt`: Securely generated 32-byte hex salt
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Execute deployment and `initialize()` in sequence:**

  ```bash
  # Step 1: Deploy
  stellar contract deploy \
    --wasm target/wasm32-unknown-unknown/release/neurowealth_vault.wasm \
    --source deployer \
    --network mainnet \
    --salt $SALT
  # Save the output as VAULT_CONTRACT_ID

  # Step 2: Initialize immediately (same deployer key, same salt)
  stellar contract invoke \
    --id $VAULT_CONTRACT_ID \
    --source deployer \
    --network mainnet \
    -- \
    initialize \
    --deployer $DEPLOYER_ADDRESS \
    --owner  $OWNER_ADDRESS \
    --agent  $AGENT_ADDRESS \
    --usdc_token $USDC_TOKEN_ADDRESS \
    --salt   $SALT
  ```

  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Post-init read verification:**
  - `get_owner` returns `$OWNER_ADDRESS` ✓
  - `get_agent` returns `$AGENT_ADDRESS` ✓
  - `get_usdc_token` returns `$USDC_TOKEN_ADDRESS` ✓
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Deployer key erased / discarded** (no further role after init).
  - **Signed off by:** _____________________________ Date: ___________

---

## 3. Administrative Caps & Deposit Limits Configuration

**CRITICAL — hard blocker.** Conservative initial caps must be set before
any user deposits are accepted.

### 🔍 Security Context

- **TVL Cap:** Limits aggregate capital at risk during the launch phase.
- **User Deposit Cap:** Limits whale exposure and first-depositor inflation
  attacks.
- **Deposit Limits (Min/Max):** The 1 USDC floor protects against dust
  attacks.

### 📝 Actionable Checklist

- [ ] **Initial TVL cap:** Conservative launch-phase value.
  Recommended: **50,000 USDC** (`50000000000` in 7-decimal raw units).

  ```bash
  stellar contract invoke \
    --id $VAULT_CONTRACT_ID \
    --source owner \
    --network mainnet \
    -- \
    set_caps \
    --user_deposit_cap 5000000000 \
    --tvl_cap 50000000000
  ```

  - Chosen TVL cap value: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Transaction deposit limits** (1 USDC min, 5,000 USDC max):

  ```bash
  stellar contract invoke \
    --id $VAULT_CONTRACT_ID \
    --source owner \
    --network mainnet \
    -- \
    set_deposit_limits \
    --min 1000000 \
    --max 5000000000
  ```

  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Verify all four caps on-chain:**

  ```bash
  stellar contract invoke --id $VAULT_CONTRACT_ID --network mainnet \
    --send=no -- get_tvl_cap
  stellar contract invoke --id $VAULT_CONTRACT_ID --network mainnet \
    --send=no -- get_user_deposit_cap
  stellar contract invoke --id $VAULT_CONTRACT_ID --network mainnet \
    --send=no -- get_min_deposit
  stellar contract invoke --id $VAULT_CONTRACT_ID --network mainnet \
    --send=no -- get_max_deposit
  ```

  - All four values confirmed correct: ✓
  - **Signed off by:** _____________________________ Date: ___________

> **Automated check** — pass expected values to `verify-deployment.sh`:
>
> ```bash
> VAULT_CONTRACT_ID=C... NETWORK=mainnet \
>   OWNER_ADDRESS=G... AGENT_ADDRESS=G... AGENT_SECRET_KEY=S... \
>   USDC_TOKEN_ADDRESS=G... \
>   EXPECTED_TVL_CAP=50000000000 \
>   EXPECTED_USER_DEPOSIT_CAP=5000000000 \
>   EXPECTED_MIN_DEPOSIT=1000000 \
>   EXPECTED_MAX_DEPOSIT=5000000000 \
>   ./scripts/verify-deployment.sh
> ```

---

## 4. Blend Pool Integration & Address Verification

**CRITICAL — hard blocker.** Deploying to an incorrect pool can cause
instant loss of principal.

### 🔍 Security Context

`set_blend_pool` performs interface probing via `balance()` but this does
not confirm the address belongs to the genuine Blend protocol. Manual
cross-referencing against official registries is mandatory.

### 📝 Actionable Checklist

- [ ] **Retrieve the official Blend mainnet pool address from:**
  - Official Blend Protocol documentation
  - Verified Blend GitHub repository
  - On-chain deployment logs on [StellarExpert](https://stellar.expert)
  - Verified Blend pool address: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Interface / state verification:** Call the pool's read methods
  directly on mainnet RPC to confirm pool parameters are sane.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Register verified Blend pool:**

  ```bash
  stellar contract invoke \
    --id $VAULT_CONTRACT_ID \
    --source owner \
    --network mainnet \
    -- \
    set_blend_pool \
    --owner $OWNER_ADDRESS \
    --pool_address $VERIFIED_BLEND_POOL_ADDRESS
  ```

  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Read verification:** `get_blend_pool` returns the exact verified
  address (not null).
  - **Signed off by:** _____________________________ Date: ___________

> **Automated check** — set `BLEND_POOL_ADDRESS` in `verify-deployment.sh`.

---

## 5. DEX Pool Integration & Address Verification

**CRITICAL — hard blocker.** Same risks as Blend pool; address
verification against trusted registries is mandatory.

### 📝 Actionable Checklist

- [ ] **Retrieve official DEX pool address** from protocol documentation
  and verified on-chain deployment logs.
  - Verified DEX pool address: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Interface / state verification:** Verify DEX pool parameters and
  liquidity depth are within expected ranges.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Register verified DEX pool:**

  ```bash
  stellar contract invoke \
    --id $VAULT_CONTRACT_ID \
    --source owner \
    --network mainnet \
    -- \
    set_dex_pool \
    --owner $OWNER_ADDRESS \
    --pool_address $VERIFIED_DEX_POOL_ADDRESS
  ```

  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Read verification:** `get_dex_pool` returns the exact verified
  address (not null).
  - **Signed off by:** _____________________________ Date: ___________

---

## 6. Emergency Procedures & Pause Drill Runbook

**CRITICAL — hard blocker.** A pause drill on testnet must pass before
mainnet deployment is permitted.

### 🔍 Security Context

The `pause` function blocks all deposits, withdrawals, and rebalances
during an active hack or market emergency. Operators must be trained in
using it under time pressure.

For incident response details, see:
- [Owner-Compromise Response Runbook](../SECURITY.md#owner-compromise-response-runbook)
- [`AGENT_KEY_COMPROMISE_RUNBOOK.md`](AGENT_KEY_COMPROMISE_RUNBOOK.md)

### 📝 Basic Pause Drill (Testnet)

1. **Pause the vault (owner key):**
   ```bash
   stellar contract invoke --id $TESTNET_VAULT_CONTRACT_ID \
     --source owner --network testnet -- pause --owner $OWNER_ADDRESS
   ```
2. **Verify `is_paused()` returns `true`.**
3. **Attempt a test deposit** — must fail with `VaultError::Paused` (code 35).
4. **Attempt a test withdrawal** — must fail with `VaultError::Paused` (code 35).
5. **Attempt a test rebalance** — must fail with `VaultError::Paused` (code 35).
6. **Unpause:**
   ```bash
   stellar contract invoke --id $TESTNET_VAULT_CONTRACT_ID \
     --source owner --network testnet -- unpause --owner $OWNER_ADDRESS
   ```
7. **Verify normal operation resumes:** `is_paused()` returns `false`, deposit succeeds.

- [ ] **Basic testnet drill completed successfully.**
  - **Signed off by:** _____________________________ Date: ___________

### 📝 Game-Day Alert-to-Pause RTO Drill (Devnet)

This drill measures how fast the organisation can use the pause mechanism.
It exercises the full detection → response chain and records the elapsed
time as the incident Recovery Time Objective (RTO) baseline for mainnet.

**Cadence:** Run once before mainnet launch, then quarterly. Rotate which
operator is on-call so every keyholder has executed a pause under time
pressure at least once.

**Roles:**
- **Drill conductor** — injects the signal, keeps timestamps, does not
  assist the responder.
- **On-call responder** — receives the page and follows the runbook
  exactly as in a real incident (no pre-warming of CLI sessions or keys).

**Procedure (timestamps in UTC, captured by conductor):**

1. **T0 — Inject simulated exploit signal.** Conductor triggers a
   monitoring alert from [`docs/monitoring.md`](monitoring.md) against the
   devnet deployment (e.g. trip the `withdrawal_spike` rule, or fire the
   alert with a `[DRILL]` prefix).
2. **T1 — Alert fired.** Timestamp when the monitoring system emits the
   page/notification.
3. **T2 — Responder acknowledged.** Timestamp when the on-call operator
   acks the page.
4. **T3 — `emergency_pause` submitted.** Responder runs:
   ```bash
   stellar contract invoke --id $DEVNET_VAULT_CONTRACT_ID \
     --source owner --network testnet -- emergency_pause \
     --owner $OWNER_ADDRESS
   ```
5. **T4 — Pause confirmed on-chain.** Ledger timestamp; verify
   `is_paused()` returns `true` and `EmergencyPausedEvent` was emitted.
6. **Debrief.** Compute `RTO = T4 − T0`. Record every blocker and file
   an issue for each. Unpause the devnet vault.

**RTO target: `T4 − T0 ≤ 15 minutes`, with `T3 − T2 ≤ 5 minutes`.**
A drill exceeding the target must be re-run after identified blockers are
fixed. Do not sign off mainnet readiness on a failed drill.

**Drill log** (append one row per drill):

| Date (UTC) | Responder | T0 signal | T1 alert | T2 ack | T3 submitted | T4 confirmed | RTO (T4−T0) | Target met | Blockers / follow-ups |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

- [ ] **Game-day drill executed in devnet** with all five timestamps
  captured in the log above.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Measured RTO ≤ 15-minute target.** (Re-run after fixes if not.)
  - Measured RTO: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **All blockers filed as issues** and assigned owners.
  - **Signed off by:** _____________________________ Date: ___________

---

## 7. Upgrade & Governance Multisig Plan

**CRITICAL — hard blocker.** The owner account must be configured with
multi-signature security before mainnet deployment.

### 🔍 Security Context

The instant `upgrade()` entrypoint has been replaced by a two-step,
timelocked flow (Issue #316): `schedule_upgrade` → wait ~24 h
(`UPGRADE_TIMELOCK_LEDGERS = 17,280`) → `execute_upgrade`, with
`cancel_upgrade` as the escape hatch. The timelock converts an instant
code swap into a 24-hour, publicly observable event.

### 📝 WASM Hash Verification Gate

Before calling `schedule_upgrade` on mainnet, the WASM hash **must
match** a CI-published hash from a signed git tag release build.

- [ ] **Verify CI workflow** ran on the intended release tag (e.g. `v2.1.0`).
  - CI run URL: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Confirm the CI-published WASM hash** is recorded in `CHANGELOG.md`
  under that version.
  - WASM hash: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Install on mainnet and verify byte-for-byte:**
  ```bash
  stellar contract install \
    --wasm target/wasm32-unknown-unknown/release/neurowealth_vault.wasm \
    --source owner \
    --network mainnet
  # Hash returned must match the CI-published hash exactly
  ```
  - Installed hash matches CI hash: ✓
  - **Signed off by:** _____________________________ Date: ___________

### 📝 Owner Multisig Configuration

- [ ] **Configure owner multisig account** (e.g. 2-of-3 or 3-of-5 setup):
  - Low threshold (e.g. 1): `pause()` and `cancel_upgrade()` (fast
    emergency path — must not require unavailable co-signers).
  - Medium threshold (e.g. 2): cap changes, Blend/DEX pool updates,
    `unpause()`.
  - High threshold (e.g. 3): `schedule_upgrade()` and `execute_upgrade()`.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Document signer distribution:** Keys distributed across parties
  using hardware wallets (e.g. Ledger). No single party holds a majority.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Single-sig interim plan documented** (if multisig is not ready
  for initial launch): documented rationale and timeline for migration to
  multisig.
  - **Signed off by:** _____________________________ Date: ___________

### 📝 Timelocked Upgrade Verification Drill (Testnet)

The timelock must be exercised end-to-end on testnet. Unit tests advance a
simulated ledger and cannot verify the WASM swap or the `Version` bump.
Only a real network run proves the full cycle.

**Part A — `get_pending_upgrade` returns the correct hash and expiry**

- [ ] **A1.** `get_pending_upgrade` returns `null` before scheduling.
- [ ] **A2.** Record current ledger sequence `L`.
- [ ] **A3.** `schedule_upgrade` succeeds; `UpgradeScheduledEvent` emitted.
- [ ] **A4.** `get_pending_upgrade` returns `(hash, L + 17280)`.
- [ ] **A5.** Second `schedule_upgrade` fails with `TimelockAlreadyPending` (code 48).
- [ ] **A6.** `execute_upgrade` before expiry fails with `TimelockNotExpired` (code 50).

**Part B — `cancel_upgrade` clears pending state**

- [ ] **B1.** `cancel_upgrade` succeeds; `UpgradeCancelledEvent` emitted.
- [ ] **B2.** `get_pending_upgrade` returns `null` after cancel.
- [ ] **B3.** Second `cancel_upgrade` fails with `NoTimelockPending` (code 49).
- [ ] **B4.** `execute_upgrade` after cancel fails with `NoTimelockPending` (code 49).
- [ ] **B5.** `cancel_upgrade` succeeds even while paused (escape hatch intact).

**Part C — Full cycle: schedule → wait → execute → verify version bump**

- [ ] **C1.** Record `get_version()` = V.
- [ ] **C2.** Install new WASM on testnet; capture hash.
- [ ] **C3.** `schedule_upgrade` with that hash; note `effective_ledger`.
- [ ] **C4.** Wait 17,280 ledgers (~24 h). Do not shorten the constant.
- [ ] **C5.** `execute_upgrade` once `current_ledger >= effective_ledger`; `UpgradedEvent` emitted.
- [ ] **C6.** `get_version()` returns V + 1.
- [ ] **C7.** `get_pending_upgrade` returns `null` after execution.
- [ ] **C8.** Storage survived: `get_total_assets()`, `get_total_shares()`, `get_owner()`, `get_agent()`, sample `get_shares(user)` match pre-upgrade values.
- [ ] **C9.** Migration entrypoint run if shipped (current contract has none).
- [ ] **C10.** Ledger numbers, WASM hashes, and TX hashes recorded in release ticket.

- [ ] **Full upgrade timelock drill completed on testnet.**
  - **Signed off by:** _____________________________ Date: ___________

---

## 8. Third-Party Security Audit & Formal Sign-off

**CRITICAL — hard blocker.** No mainnet deployment without an independent
professional audit.

### 📝 Actionable Checklist

- [ ] **Pre-audit scans completed:**
  - `cargo test` passes with 100% success across all comprehensive tests.
  - `cargo clippy --all-targets --all-features -- -D warnings` passes.
  - `cargo deny check` passes with no unresolved advisories.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Third-party professional audit engaged:**
  - Auditing firm: _____________________________
  - Audit report URL: _____________________________
  - All High and Critical findings resolved.
  - All Medium findings resolved or formally accepted with documented rationale.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Audit findings verified in codebase:**
  - Critical fixes (e.g. `withdraw_all()` balance protection,
    `update_total_assets` balance checks) confirmed compile-ready and active.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Final sign-off obtained from:**
  - Lead developer: _____________________________ Date: ___________
  - Security auditor: _____________________________ Date: ___________
  - Product lead: _____________________________ Date: ___________

---

## 9. Harvest Cooldown & Circuit-Breaker Configuration

### 🔍 Security Context

- **Harvest cooldown** — `harvest()` checks `LastRebalanceLedger`. If
  fewer ledgers have elapsed than `MinRebalanceInterval`, the call reverts
  with `VaultError::RebalanceCooldownActive` (code 43). A zero interval
  disables the guard.
- **Circuit-breaker** — after `MaxConsecutiveFailures` successive protocol
  errors the agent is suspended. Setting threshold to `0` disables the
  breaker (not recommended in production).

### 📝 Actionable Checklist

- [ ] **Set harvest cooldown** (recommended: 720 ledgers ≈ 1 hour):

  ```bash
  stellar contract invoke \
    --id $VAULT_CONTRACT_ID \
    --source owner \
    --network mainnet \
    -- \
    set_rebalance_cooldown \
    --interval 720
  ```

  - Chosen cooldown: _____________________________ ledgers
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Verify cooldown is stored correctly:**
  ```bash
  stellar contract invoke --id $VAULT_CONTRACT_ID \
    --network mainnet --send=no -- get_rebalance_cooldown
  # Expected: 720 (or your configured value)
  ```
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Verify `harvest()` respects the cooldown:** Immediately after a
  harvest, second call must fail with `VaultError::RebalanceCooldownActive` (code 43).
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Set circuit-breaker threshold** (recommended: 3–5):

  ```bash
  stellar contract invoke \
    --id $VAULT_CONTRACT_ID \
    --source owner \
    --network mainnet \
    -- \
    set_max_consecutive_failures \
    --threshold 5
  ```

  - Chosen threshold: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Verify circuit-breaker on testnet:** Simulate consecutive harvest
  failures; confirm agent suspension after `threshold` failures.
  - **Signed off by:** _____________________________ Date: ___________

---

## 10. Secret Scanning & Secrets Hygiene

**CRITICAL — hard blocker.** No secrets committed to the repository.
See [`docs/SECRETS_HYGIENE.md`](SECRETS_HYGIENE.md) for the full policy,
pre-commit hook setup, and CI enforcement details.

### 📝 Actionable Checklist

- [ ] **Full-history secret scan completed** using `gitleaks` or `truffleHog`:
  ```bash
  gitleaks detect --source . --report-path gitleaks-report.json
  # Zero secrets detected in report
  ```
  - Scan tool: _____________________________
  - Scan report location: _____________________________
  - Zero secrets found in history: ✓
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Pre-commit hook installed** to prevent future secret commits:
  ```bash
  # See docs/SECRETS_HYGIENE.md for installation instructions
  pre-commit install
  ```
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **CI secret-scanning workflow verified** to run on every push and PR.
  - CI workflow name / URL: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **All `.env*` files** verified to be in `.gitignore` and absent from
  the repository history.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Rotation plan confirmed:** Any secrets accidentally committed in the
  past have been rotated and the old values invalidated.
  - **Signed off by:** _____________________________ Date: ___________

---

## 11. Emergency Contact List & On-Call Roster

**CRITICAL — hard blocker.** The team must be reachable 24/7 during and
after mainnet launch. Response times must be defined and tested.

### 📝 Actionable Checklist

- [ ] **Emergency contact list compiled** and accessible to all keyholders
  (not just in this document — also in the team's incident-response channel).

  | Role | Name | Contact (encrypted/secure) | Response time target |
  |---|---|---|---|
  | Lead developer / on-call | _____ | _____ | 15 min (business hours), 30 min (off-hours) |
  | Security lead | _____ | _____ | 30 min |
  | Product lead | _____ | _____ | 1 hour |
  | Owner keyholder #1 | _____ | _____ | 15 min |
  | Owner keyholder #2 | _____ | _____ | 30 min |
  | Owner keyholder #3 (backup) | _____ | _____ | 1 hour |

  - **Signed off by:** _____________________________ Date: ___________
- [ ] **On-call rotation schedule established** covering 24/7 for at least
  the first 30 days post-mainnet.
  - Schedule URL / document: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Incident communication channel set up** (e.g. Signal group, dedicated
  Slack channel with all keyholders added).
  - Channel name: _____________________________
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Escalation path documented:** Who is paged first, when to escalate,
  and who has authority to declare a major incident and initiate pause.
  - **Signed off by:** _____________________________ Date: ___________
- [ ] **Contact list tested:** Each person on the list has confirmed receipt
  of a test page within their stated response time.
  - **Signed off by:** _____________________________ Date: ___________

---

## Final Pre-Launch Gate

All items in this checklist must be signed off before any mainnet deployment
command is run. Retain a copy of the signed checklist in the release ticket.

| Section | Completed | Signed off by | Date |
|---|---|---|---|
| 1. Key management (separate owner & agent keys) | ☐ | | |
| 2. Initialization parameters & deployment | ☐ | | |
| 3. Administrative caps (TVL ≤ 50,000 USDC initial) | ☐ | | |
| 4. Blend pool address verified | ☐ | | |
| 5. DEX pool address verified | ☐ | | |
| 6. Pause drill on testnet + game-day RTO drill | ☐ | | |
| 7. Upgrade timelock drill on testnet + multisig plan | ☐ | | |
| 8. Third-party security audit signed off | ☐ | | |
| 9. Harvest cooldown & circuit-breaker configured | ☐ | | |
| 10. Secret scanning completed (zero findings) | ☐ | | |
| 11. Emergency contact list & on-call roster confirmed | ☐ | | |

**Deployment approved by:**

- _____________________________ (Lead developer) — Date: ___________
- _____________________________ (Security auditor) — Date: ___________
- _____________________________ (Product lead) — Date: ___________
