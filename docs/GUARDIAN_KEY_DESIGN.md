# Guardian-Key Design: Second Signature for `execute_upgrade`

> **Issue:** #81 (Implementation: #44, Design: #607)  
> **Category:** Security / Architecture / Governance  
> **Status:** Finalised & Implemented  
> **Author:** NeuroWealth Security Team  
> **Date:** 2026-09-25  

---

## 1. Executive Summary & Problem Statement

A stolen owner private key combined with an upgrade proposal represents the **highest blast-radius threat** to the NeuroWealth protocol. Under the standard single-owner pattern:

1. `schedule_upgrade(owner, new_wasm_hash)`: The owner proposes replacement contract code.
2. An upgrade timelock of `17,280` ledgers (~24 hours at 5-second ledger latency) elapses.
3. `execute_upgrade(owner)`: The owner applies the pending WASM bytecode to the live contract.

While the 24-hour timelock window enables off-chain telemetry and alerting, if the owner key is compromised, an attacker can both schedule and execute the malicious upgrade without any independent cryptographic check. If team members are unavailable or response is delayed, funds can be compromised.

To eliminate this single point of failure, NeuroWealth introduces the **Guardian Pattern**: an independent cryptographic keypair that is strictly required to co-sign `execute_upgrade`. Without the guardian's explicit authorization, no upgrade can execute, regardless of whether the owner key has scheduled it or the timelock has elapsed.

```
                  ┌──────────────────────────────────────────────┐
                  │          Upgrade Authorization Flow          │
                  └──────────────────────────────────────────────┘

     Owner Key ───────────────────► schedule_upgrade(new_wasm_hash)
                                              │
                                              ▼
                                   [24-Hour Timelock Window]
                                   (17,280 Ledgers Verification)
                                              │
                                              ▼
     Owner Key    ─────┐
                       ├──────────► execute_upgrade()  ──────►  WASM Upgraded
     Guardian Key ─────┘             (Both Signatures
                                         Required)
```

---

## 2. Guardian Key Role and Permission Boundaries

### 2.1 Role Definition
The **Guardian Key** is a designated Stellar keypair (`Address`) stored within the contract instance storage (`DataKey::Guardian`). Its sole on-chain privilege is to provide a mandatory second authorization on the `execute_upgrade` invocation.

### 2.2 Permissions Matrix

| Function | Allowed for Guardian? | Authorization Enforcement | Notes |
|:---|:---:|:---|:---|
| `execute_upgrade` | **YES (Co-sign)** | `guardian.require_auth()` | Gated alongside `owner.require_auth()` |
| `schedule_upgrade` | **NO** | `Self::require_is_owner(&env)` | Guardian cannot propose upgrades |
| `cancel_upgrade` | **NO** | `Self::require_is_owner(&env)` | Owner can cancel upgrades unilaterally |
| `pause` / `unpause` | **NO** | `Self::require_is_owner(&env)` | Guardian cannot trigger emergency halts |
| `set_guardian` / `remove_guardian` | **NO** | `Self::require_is_owner(&env)` | Managed exclusively by vault owner |
| `set_tvl_cap`, `set_rate_limit`, etc. | **NO** | `Self::require_is_owner(&env)` | Owner parameters remain insulated |
| `rebalance` / `harvest` | **NO** | `Self::require_is_agent(&env)` | AI Agent exclusive domain |
| `deposit` / `withdraw` | **NO** | User-authenticated only | Guardian holds zero custody of vault assets |

### 2.3 On-Chain Smart Contract Implementation

The Soroban contract implementation (see `contracts/vault/src/lib.rs` and `contracts/vault/src/tests/test_guardian.rs`) governs this pattern as follows:

```rust
// Storage Key
DataKey::Guardian // Stores Option<Address> in Instance Storage

// 1. Setting the Guardian (Owner-only, immediate effect)
pub fn set_guardian(env: Env, new_guardian: Address) {
    Self::require_initialized(&env);
    Self::require_is_owner(&env);
    env.storage().instance().set(&DataKey::Guardian, &new_guardian);
    env.events().publish((TOPIC_GUARDIAN_SET,), GuardianSetEvent { guardian: Some(new_guardian) });
}

// 2. Removing the Guardian (Owner-only emergency fallback)
pub fn remove_guardian(env: Env) {
    Self::require_initialized(&env);
    Self::require_is_owner(&env);
    env.storage().instance().remove(&DataKey::Guardian);
    env.events().publish((TOPIC_GUARDIAN_SET,), GuardianSetEvent { guardian: None });
}

// 3. Execution Guard (Co-signature enforced if Guardian is configured)
pub fn execute_upgrade(env: Env, owner: Address) {
    Self::require_initialized(&env);
    owner.require_auth();
    Self::require_not_paused(&env);
    Self::require_is_owner_address(&env, &owner);

    // Enforce Guardian co-signature when configured
    if let Some(guardian) = env.storage().instance().get::<DataKey, Address>(&DataKey::Guardian) {
        guardian.require_auth();
    }

    // Timelock verification and code replacement...
}
```

### 2.4 Backward Compatibility
If `DataKey::Guardian` is absent (i.e. legacy installations or during bootstrap before the key ceremony), `execute_upgrade` falls back to owner-only authorization. Once `set_guardian` is invoked, two signatures become strictly required.

---

## 3. Key Generation Ceremony Procedure

To ensure the guardian private key is never exposed to internet-connected devices, malware, or single individuals, key generation MUST be conducted according to this formal air-gapped ceremony.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Air-Gapped Ceremony Architecture                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌─────────────────────┐                  ┌───────────────────────┐   │
│   │   Air-Gapped OS     │                  │  Hardware Security    │   │
│   │  (Tails / Read-Only)│                  │     Key / HSM         │   │
│   │                     ├─────────────────►│   (Ledger Nano S+)    │   │
│   │ CSPRNG Entropy Gen  │  Isolated USB    │  Mnemonic Derivation  │   │
│   └──────────┬──────────┘                  └───────────┬───────────┘   │
│              │                                         │               │
│              ▼                                         ▼               │
│   ┌─────────────────────┐                  ┌───────────────────────┐   │
│   │ Visual Public Key   │                  │   Titanium Seed Plate │   │
│   │  Verification       │                  │   (Tamper-Evident Bag)│   │
│   │   "G..." Address    │                  │   Dual-Custody Safe   │   │
│   └─────────────────────┘                  └───────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Ceremony Roles and Responsibilities
- **Ceremony Master:** Orchestrates execution of the runbook steps, records hashes, and maintains visual log.
- **Key Custodian (Primary Signer):** Directly interacts with the hardware device; inputs PIN and confirms seed phrase generation.
- **Independent Security Auditor / Witness:** Observes all screen displays, verifies environmental isolation, and validates that zero recording devices or network connections exist.

### 3.2 Environmental Pre-Requisites
1. **Physical Isolation:** Private, windowless room or Faraday enclosure.
2. **Device Blackout:** All cellular phones, smartwatches, cameras, and external wireless peripherals are deposited outside the ceremony chamber.
3. **Dedicated Air-Gapped Machine:** Standard laptop with physical Wi-Fi/Bluetooth cards removed or disabled in BIOS; battery powered; booted strictly via read-only live Linux media (e.g. Tails OS or verified minimal Ubuntu Live USB).

### 3.3 Step-by-Step Generation Protocol
1. **Live Environment Boot:** Boot air-gapped laptop from cryptographically verified live USB. Verify network interfaces are down (`ip link`, `rfkill list all`).
2. **Entropy Gathering:** Generate system entropy using hardware RNG (`/dev/random`) combined with physical dice rolls or hardware security token entropy.
3. **Hardware Wallet Initialization:**
   - Unbox brand-new, factory-sealed Hardware Security Key / Ledger device.
   - Power on via air-gapped USB cable connected to the isolated workstation.
   - Configure a secure 8-digit device PIN known only to the Key Custodian.
   - Generate a 24-word BIP-39 mnemonic seed using the device's onboard certified secure element (Common Criteria EAL5+ / EAL6+).
4. **Seed Verification & Engraving:**
   - Transcribe the 24 words onto a cold-storage titanium/steel plate (e.g. Cryptosteel Capsule or Billfodl) using manual punch-engraving.
   - Immediately verify the backup by executing the device's "Recovery Check" app.
5. **Public Key Export:**
   - Derive the Stellar Account Public Key (`G...`) using derivation path `m/44'/148'/0'`.
   - Display the public address on the device screen.
   - Export ONLY the public key to a clean, formatted USB drive or via QR code.
   - Public key is published to the protocol repository and verified by all witnesses.
6. **Sanitization:**
   - Power down air-gapped machine. RAM is instantly cleared by Tails shutdown sequence.
   - Format and zero out all temporary USB drives (`shred -u -z`).
   - Store the engraved metal backup in a numbered Tamper-Evident Security Bag (TESSB).
   - Sign ceremony affidavit with all participants' cryptographic signatures.

---

## 4. Key Storage and Custody Recommendations

NeuroWealth specifies two approved configurations for guardian key storage depending on deployment tier:

```
                  ┌──────────────────────────────────────────────┐
                  │        Recommended Custody Topologies        │
                  └──────────────────────────────────────────────┘

        Option A: Hardware Cold Wallet (Single Guardian)
        ┌────────────────────────────────────────────────────────┐
        │  Ledger Nano S Plus / X (Hardware Secure Element)      │
        │  • Stored in Class 3 Bank Safe Deposit Box             │
        │  • Physical access requires dual-signoff authorization  │
        └────────────────────────────────────────────────────────┘

        Option B: 2-of-3 Multisig Guardian (Target Mainnet State)
        ┌────────────────────────────────────────────────────────┐
        │                 Stellar Native Multi-Sig               │
        │                        (Threshold: 2)                  │
        │                                                        │
        │   Signer 1 (EU)          Signer 2 (US)      Signer 3   │
        │   Security Lead         External Auditor   DevOps Lead │
        │  [Ledger Cold]          [Hardware HSM]    [Ledger Cold]│
        └────────────────────────────────────────────────────────┘
```

### 4.1 Recommendation A: Hardware Wallet (Cold Custody)
- **Device:** Ledger Nano S Plus or Nano X running verified Stellar app (v2.x+).
- **Physical Custody:** The hardware device is housed in a fireproof safe in a secure physical facility.
- **Backup Custody:** The stamped titanium seed plate is stored in a separate bank safe deposit box requiring dual-identification access.
- **Suitability:** Pre-mainnet, audit periods, and initial production rollout.

### 4.2 Recommendation B: 2-of-3 Multi-Sig Guardian (Mainnet Standard)
- **Structure:** The on-chain guardian address (`DataKey::Guardian`) is configured as a Stellar native multi-sig account with three weighted signers and a threshold of 2.
- **Signer Distribution:**
  - Signer 1: NeuroWealth Lead Security Engineer (Hardware Wallet).
  - Signer 2: Independent Third-Party Security Auditor (YubiKey / HSM).
  - Signer 3: Core Governance Council Representative (Hardware Wallet).
- **Geographic Dispersion:** Signers must reside across distinct geographical jurisdictions (e.g. North America, Europe, Asia-Pacific) to eliminate geopolitical or single-jurisdiction coercion risks.

### 4.3 Cloud Hardware Security Module (HSM) Option
For automated CI/CD-driven emergency deployments where human physical access introduces unacceptable latency, an institutional HSM is permitted:
- **Provider:** AWS CloudHSM or Google Cloud EAL4+ HSM.
- **Policy:** Key usage restricted via IAM multi-party approval and tied strictly to transactions with destination contract equal to `NeuroWealthVault` and function name `execute_upgrade`.

---

## 5. Guardian Rotation Procedure

Rotation of the guardian key may be triggered under routine maintenance or emergency incident response.

### 5.1 Routine Rotation Procedure (Annual Schedule)
1. **Trigger:** Annual key rotation schedule or planned custody re-assignment.
2. **New Key Ceremony:** Execute Section 3 runbook to generate `Guardian_v2` public key (`G_NEW...`).
3. **On-Chain Update:**
   Owner calls `set_guardian`:
   ```bash
   stellar contract invoke \
     --id "$VAULT_CONTRACT_ID" \
     --source "$OWNER_SECRET_KEY" \
     --network mainnet \
     -- set_guardian --new_guardian "$GUARDIAN_V2_PUBLIC_KEY"
   ```
4. **Verification:**
   Query getter `get_guardian`:
   ```bash
   stellar contract invoke \
     --id "$VAULT_CONTRACT_ID" \
     --network mainnet \
     -- get_guardian
   ```
   Confirm return value matches `$GUARDIAN_V2_PUBLIC_KEY`.
5. **Event Audit:** Verify `GuardianSetEvent` emitted with topic `guardian_set`.
6. **Decommissioning:** Securely wipe and archive the previous device's seed materials.

### 5.2 Emergency Rotation Procedure (Suspected Compromise or Custodian Loss)
If the guardian key is suspected of compromise or a custodian becomes incapacitated:
1. **Incident Response Trigger:** Protocol Security Incident Level 1 declared under [`docs/INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md).
2. **Owner Action (Immediate Fallback):**
   - If a pre-generated standby guardian key is available:
     ```bash
     stellar contract invoke --id "$VAULT_CONTRACT_ID" --source "$OWNER_SECRET_KEY" -- set_guardian --new_guardian "$STANDBY_GUARDIAN_KEY"
     ```
   - If no verified replacement is immediately available:
     ```bash
     stellar contract invoke --id "$VAULT_CONTRACT_ID" --source "$OWNER_SECRET_KEY" -- remove_guardian
     ```
     *Note:* Calling `remove_guardian` reverts `execute_upgrade` to owner-only authorization, ensuring that a compromised guardian cannot hold the protocol hostage while the 24-hour upgrade timelock remains as the primary defense.

---

## 6. Liability, Access Control, and Signing Rules

### 6.1 Authorized Signers
The Guardian Key MUST only be held by authorized signers formally approved by protocol governance:
- Primary Custodian: Lead Security Engineer.
- Secondary Custodian: Certified Lead Auditor / Multi-Sig Council.

### 6.2 Mandatory Signing Checklist
A guardian custodian is legally and operationally authorized to sign `execute_upgrade` **ONLY IF ALL** of the following conditions are verified:

1. **Bytecode Verification:** The proposed `new_wasm_hash` matches byte-for-byte the hash produced by the reproducible build script ([`scripts/check-reproducible-build.sh`](../scripts/check-reproducible-build.sh)) against the audited Git commit tag.
2. **Full Audit Sign-Off:** The audit report for the target release commit contains zero unmitigated Critical or High severity findings.
3. **Timelock Verification:** A minimum of 17,280 ledgers (~24 hours) have elapsed since `schedule_upgrade` was emitted on the ledger.
4. **No Active Security Incident:** No alerts are flagged by real-time monitoring ([`docs/SECURITY_MONITORING.md`](SECURITY_MONITORING.md)), and no veto has been registered by the community or security council.
5. **No Parameter Deviation:** The upgrade payload does not silently modify storage layouts, balance invariant checks, or admin roles.

### 6.3 Absolute Veto Conditions (Refusal to Sign)
Custodians MUST refuse to sign `execute_upgrade` under any of the following circumstances:
- The owner account attempts to bypass the 24-hour timelock.
- The Git commit hash corresponding to `new_wasm_hash` is not publicly disclosed or fails clean reproducible build validation.
- Suspicious activity is detected on the owner account indicating private key theft.
- Any change that bypasses share accounting or withdraws unbacked assets.

---

## 7. Pre-Mainnet Testnet Verification Procedure

Before mainnet deployment, the guardian key mechanics MUST be verified on Stellar Testnet following this test sequence.

```
       Testnet Pre-Flight Testing Sequence
       ───────────────────────────────────
       [Test 1] Bootstrap & Set Guardian
          │
          ▼
       [Test 2] Happy Path: Owner + Guardian co-sign execute_upgrade
          │
          ▼
       [Test 3] Negative Test: Owner alone fails execute_upgrade
          │
          ▼
       [Test 4] Negative Test: Guardian alone cannot pause or set caps
          │
          ▼
       [Test 5] Emergency Rotation & Removal Verification
```

### 7.1 Testnet Verification Runbook

#### Test 1: Configuration & State Check
```bash
# 1. Set guardian on testnet
stellar contract invoke \
  --id "$TESTNET_VAULT_ID" \
  --source "$TESTNET_OWNER" \
  --network testnet \
  -- set_guardian --new_guardian "$TESTNET_GUARDIAN_ADDRESS"

# 2. Assert get_guardian returns testnet guardian address
RESULT=$(stellar contract invoke --id "$TESTNET_VAULT_ID" --network testnet -- get_guardian)
test "$RESULT" = "\"$TESTNET_GUARDIAN_ADDRESS\"" && echo "PASS: Guardian correctly configured"
```

#### Test 2: Negative Test — Single-Sig Upgrade Rejection
```bash
# 1. Schedule upgrade
stellar contract invoke \
  --id "$TESTNET_VAULT_ID" \
  --source "$TESTNET_OWNER" \
  --network testnet \
  -- schedule_upgrade --owner "$TESTNET_OWNER_ADDRESS" --new_wasm_hash "$TEST_WASM_HASH"

# 2. Advance time past timelock (or wait 24h on testnet)
# Attempt execute_upgrade providing ONLY owner authorization:
stellar contract invoke \
  --id "$TESTNET_VAULT_ID" \
  --source "$TESTNET_OWNER" \
  --network testnet \
  -- execute_upgrade --owner "$TESTNET_OWNER_ADDRESS"
# EXPECTED: Transaction reverts with HostError / ContractError (Missing authorization for Guardian)
```

#### Test 3: Positive Test — Dual-Signature Upgrade Execution
```bash
# Build multi-auth transaction envelope containing authorizations for BOTH owner and guardian
stellar contract invoke \
  --id "$TESTNET_VAULT_ID" \
  --source "$TESTNET_OWNER" \
  --network testnet \
  --sign-with-key "$TESTNET_GUARDIAN_SECRET" \
  -- execute_upgrade --owner "$TESTNET_OWNER_ADDRESS"
# EXPECTED: Transaction succeeds; UpgradeExecutedEvent emitted; new WASM installed
```

#### Test 4: Privilege Boundary Verification
```bash
# Verify guardian CANNOT call owner functions
stellar contract invoke \
  --id "$TESTNET_VAULT_ID" \
  --source "$TESTNET_GUARDIAN" \
  --network testnet \
  -- pause --owner "$TESTNET_GUARDIAN_ADDRESS"
# EXPECTED: Fails with VaultError::CallerIsNotOwner (#30)
```

#### Test 5: Guardian Removal and Fallback Test
```bash
# Owner calls remove_guardian
stellar contract invoke \
  --id "$TESTNET_VAULT_ID" \
  --source "$TESTNET_OWNER" \
  --network testnet \
  -- remove_guardian

# Assert get_guardian returns None (void)
RESULT=$(stellar contract invoke --id "$TESTNET_VAULT_ID" --network testnet -- get_guardian)
test "$RESULT" = "null" || test "$RESULT" = "void" && echo "PASS: Guardian removed"
```

---

## 8. Summary of Completed Deliverables

| Deliverable | Acceptance Criteria | Status |
|:---|:---|:---:|
| Role Definition | Only authorises `execute_upgrade`, zero fund/admin access | Complete |
| Key Generation Ceremony | Detailed air-gapped machine, cleanroom, and HSM protocol | Complete |
| Key Storage Architecture | Hardware wallet (Ledger) and 2-of-3 multisig recommendations | Complete |
| Rotation Procedures | Documented both annual maintenance and emergency compromise flows | Complete |
| Liability & Access Control | Custodian sign-off checklist and absolute veto rules defined | Complete |
| Testnet Verification Runbook | 5-step testnet test protocol with expected exit codes | Complete |
| Smart Contract Alignment | Verified against `contracts/vault/src/lib.rs` and `test_guardian.rs` | Complete |

---

## 9. References

- [`contracts/vault/src/lib.rs`](../neurowealth-vault/contracts/vault/src/lib.rs) — Smart contract implementation of `set_guardian`, `remove_guardian`, and `execute_upgrade`.
- [`contracts/vault/src/tests/test_guardian.rs`](../neurowealth-vault/contracts/vault/src/tests/test_guardian.rs) — Automated test suite for guardian authorization and isolation.
- [`SECURITY.md`](../SECURITY.md) — Protocol threat model and owner-compromise runbook.
- [`docs/UPGRADE_MIGRATION.md`](UPGRADE_MIGRATION.md) — Contract upgrade and state migration runbook.
- [`docs/INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) — Security incident response escalation paths.
