# Pool Configuration Terminology

> **Issue:** #676  
> **Context:** `docs/BLEND_INTEGRATION_RESEARCH.md`  
> **Purpose:** Map pool IDs, vault addresses, and strategy allocations to their
> corresponding on-chain configuration fields so reviewers can distinguish them
> unambiguously during configuration review.

---

## Overview

Three families of identifiers appear together during a configuration review:

| Family | What it identifies | Example length |
|---|---|---|
| **Pool ID** | The Blend lending-pool Soroban contract | 56-char Stellar contract address (`C…`) |
| **Vault address** | The NeuroWealth vault Soroban contract | 56-char Stellar contract address (`C…`) |
| **Strategy allocation** | The percentage of vault TVL to deploy per protocol | Basis points (bps) stored as `i128` |

Because pool addresses and vault addresses share the same 56-character `C…` format,
reviews MUST cross-check each address against the specific `DataKey` it is stored
under rather than relying on the address shape alone.

---

## Term-to-Field Mapping

### 1. Pool ID — `DataKey::BlendPool`

| Attribute | Value |
|---|---|
| **Configuration field** | `DataKey::BlendPool` |
| **Contract entrypoint (write)** | `set_blend_pool(owner, pool_address)` |
| **Contract entrypoint (read)** | `get_blend_pool()` |
| **Storage type** | `Address` (Soroban `Address` stored in persistent ledger storage) |
| **Who may set it** | Owner only (enforced by `require_auth(&owner)`) |
| **Effect** | All subsequent `rebalance("blend", …)` calls submit funds to this pool |
| **Revocation** | Call `rebalance("none", 0, 0)` to withdraw, then `set_blend_pool(owner, new_address)` |

**Redacted configuration example (testnet):**

```env
# .env.devnet — pool ID
BLEND_POOL=CCLBPEYS3XFK4K**************************BAFRL
```

**Stellar CLI read-back:**

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --network testnet \
  -- get_blend_pool
# Returns: "CCLBPEYS3XFK4K**************************BAFRL"
```

**Verification checklist:**
- [ ] Address begins with `C` (Soroban contract address, not a G-account).
- [ ] Address matches the value in `BLEND_INTEGRATION_RESEARCH.md` §Contract Addresses.
- [ ] Address has been confirmed via https://app.blend.capital before mainnet use.
- [ ] `MAINNET_CHECKLIST.md` sign-off row for `BlendPool` is ticked.

---

### 2. Vault Address — `DataKey::VaultContract` / `VAULT_CONTRACT_ID`

| Attribute | Value |
|---|---|
| **Configuration field** | Environment variable `VAULT_CONTRACT_ID`; on-chain the vault's own `env.current_contract_address()` |
| **On-chain usage** | Passed as `from`, `to`, and `spender` in Blend `submit_with_allowance` calls |
| **Storage type** | `Address` (derived at runtime; not stored in a `DataKey`) |
| **Who sets it** | Deployment script (`stellar contract deploy …`); fixed at deploy time |
| **Effect** | Authorises the vault contract to supply USDC to the pool on behalf of itself |

**Redacted configuration example:**

```env
# .env.devnet — vault address
VAULT_CONTRACT_ID=CDLZFC3SYJYD7M6L**************************GM37T
```

**How to distinguish vault address from pool address during review:**

| Check | Pool ID | Vault Address |
|---|---|---|
| Stored in `DataKey::BlendPool` | ✅ | ❌ |
| Returned by `get_blend_pool()` | ✅ | ❌ |
| Returned by `env.current_contract_address()` | ❌ | ✅ |
| Present in `VAULT_CONTRACT_ID` env var | ❌ | ✅ |
| Appears as `spender` in USDC `approve()` call | ❌ | ❌ — pool appears here |
| Appears as `from`/`to` in `submit_with_allowance` | ❌ | ✅ |

---

### 3. Strategy Allocation — `DataKey::StrategyAllocation` / `UserStrategy`

Strategy allocations operate at two levels: the **per-user strategy preference** and the
**owner-configured protocol weights**.

#### 3a. Per-User Strategy (`DataKey::UserStrategy`)

| Attribute | Value |
|---|---|
| **Configuration field** | `DataKey::UserStrategy(user_address)` |
| **Contract entrypoint (write)** | `set_user_strategy(user, strategy)` |
| **Contract entrypoint (read)** | `get_user_strategy(user)` |
| **Storage type** | `Strategy` enum: `Conservative = 0`, `Balanced = 1`, `Growth = 2` |
| **Who may set it** | The user themselves (enforced by `require_auth(&user)`) |
| **Effect** | Governs rebalancing behaviour for that user's shares |

**Redacted configuration example:**

```json
{
  "user": "GABC...XYZ9",
  "strategy": "balanced"
}
```

#### 3b. Protocol Allocation Weights (`DataKey::AllocationWeights`)

| Attribute | Value |
|---|---|
| **Configuration field** | `DataKey::AllocationWeights` |
| **Contract entrypoint (write)** | `set_allocation_weights(owner, weights)` |
| **Contract entrypoint (read)** | `get_allocation_weights()` |
| **Storage type** | `Map<Symbol, i128>` — keys are protocol names (`"blend"`, `"dex"`, `"none"`); values are basis points (bps, out of 10 000) |
| **Who may set it** | Owner only |
| **Effect** | Defines target percentage of TVL to deploy per protocol during automated rebalance |

**Redacted configuration example (basis-point weights):**

```json
{
  "blend": 7000,
  "dex":   2000,
  "none":  1000
}
```

Interpretation: 70 % of TVL → Blend, 20 % → DEX liquidity pool, 10 % held idle.
Weights MUST sum to exactly 10 000 bps; the contract rejects any `set_allocation_weights`
call where the sum differs.

**Stellar CLI read-back:**

```bash
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --network testnet \
  -- get_allocation_weights
# Returns: {"blend":7000,"dex":2000,"none":1000}
```

---

## Quick-Reference: All Three Identifiers Side by Side

| Field | Env var | `DataKey` | Type | Redacted example value |
|---|---|---|---|---|
| Pool ID | `BLEND_POOL` | `BlendPool` | `Address` | `CCLBPEYS3XFK4K**…**BAFRL` |
| Vault address | `VAULT_CONTRACT_ID` | *(self, not stored)* | `Address` | `CDLZFC3SYJYD7M6L**…**GM37T` |
| Per-user strategy | — | `UserStrategy(addr)` | `Strategy` enum | `"balanced"` |
| Protocol weights | — | `AllocationWeights` | `Map<Symbol,i128>` (bps) | `{"blend":7000,"dex":2000,"none":1000}` |

---

## Common Review Mistakes

| Mistake | How to avoid it |
|---|---|
| Swapping pool address for vault address (both start with `C`) | Cross-check against the `DataKey` name or env var name, not the address prefix |
| Reading allocation weights as percentages | Weights are in **basis points** (1 bps = 0.01 %). Divide by 100 to get a percentage |
| Assuming strategy `2` means "aggressive" | The enum is `Conservative=0`, `Balanced=1`, `Growth=2`; "Growth" is the highest-risk preset |
| Trusting an unverified mainnet pool address | Always verify against https://app.blend.capital and `MAINNET_CHECKLIST.md` before supplying funds |

---

## Related Documents

- [`docs/BLEND_INTEGRATION_RESEARCH.md`](BLEND_INTEGRATION_RESEARCH.md) — Pool addresses, interface, and risk analysis
- [`docs/MAINNET_CHECKLIST.md`](MAINNET_CHECKLIST.md) — Sign-off table for mainnet deployment
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — Share accounting and storage key catalogue
- [`SECURITY.md`](../SECURITY.md) — Access-control table covering `set_blend_pool` and `set_allocation_weights`
