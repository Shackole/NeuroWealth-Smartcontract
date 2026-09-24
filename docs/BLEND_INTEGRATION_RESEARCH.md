# Blend Protocol Integration Research

> **Last verified:** 2026-09-24  
> **Verified against:** devnet integration test (`scripts/e2e-devnet.sh`) and Blend v2 source  
> **Status:** Production integration implemented and smoke-tested on testnet

---

## Overview

This document contains research findings and production-verified results for integrating
the NeuroWealth Vault with Blend Protocol's Soroban pool contract for on-chain yield
generation.

---

## Contract Addresses

### Testnet

| Contract | Address | Source |
|----------|---------|--------|
| Blend Pool (testnet) | `CCLBPEYS3XFK4KADMXSPHF7BP4KFVZ7U46NWRKVDNQXS34LFO5BAFRL` | [Blend testnet deployment](https://github.com/blend-capital/blend-contracts-v2) |
| USDC (testnet SEP-41) | `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` | Stellar testnet anchor |

### Mainnet

> **Note:** Mainnet Blend addresses are pending final audited deployment by the Blend team.
> Update this table after confirming addresses via https://app.blend.capital and the
> [Blend v2 mainnet announcement](https://github.com/blend-capital/blend-contracts-v2/releases).

| Contract | Address | Source |
|----------|---------|--------|
| Blend Pool (mainnet) | *TBD — verify via https://app.blend.capital* | Blend official deployment |
| USDC (mainnet SEP-41) | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` | Circle / Stellar mainnet |

**Before supplying to any Blend pool on mainnet, verify the address via:**
1. The [Blend app](https://app.blend.capital) — copy the pool address from the URL.
2. The [Blend GitHub releases page](https://github.com/blend-capital/blend-contracts-v2/releases).
3. Cross-check against the `MAINNET_CHECKLIST.md` sign-off.

---

## Production Soroban Interface (Blend v2)

The vault integrates via **request-based** fund management (not the legacy `deposit`/`redeem`
entry-point names used in Blend v1):

| Entrypoint | Purpose |
|------------|---------|
| `submit_with_allowance(from, spender, to, requests)` | Supply assets (request type `0`) — requires prior USDC `approve` |
| `submit(from, to, requests)` | Withdraw assets (request type `1`) |
| `balance(asset, user)` | Query supplied balance for the vault's position |

### Request Struct

```rust
// Contract-local mirror in lib.rs
struct BlendRequest {
    request_type: u32,  // 0 = supply, 1 = withdraw
    address: Address,   // USDC token address
    amount: i128,
}
```

### Working Supply Call (XDR-confirmed on testnet)

```rust
// Approval step — vault approves Blend pool to pull USDC
let token_client = token::Client::new(&env, &usdc_token);
token_client.approve(
    &vault_address,          // from
    &blend_pool_address,     // spender
    &supply_amount,          // amount
    &approval_ttl_ledger,    // expiration_ledger
);

// Supply step — Blend pulls USDC via transfer_from
let request = BlendRequest {
    request_type: 0_u32,
    address: usdc_token.clone(),
    amount: supply_amount,
};
env.invoke_contract::<Val>(
    &blend_pool_address,
    &Symbol::new(&env, "submit_with_allowance"),
    (vault_address.clone(), vault_address.clone(), vault_address.clone(),
     vec![&env, request]).into_val(&env),
);
```

### Working Withdraw Call (XDR-confirmed on testnet)

```rust
let request = BlendRequest {
    request_type: 1_u32,
    address: usdc_token.clone(),
    amount: withdraw_amount,
};
env.invoke_contract::<Val>(
    &blend_pool_address,
    &Symbol::new(&env, "submit"),
    (vault_address.clone(), vault_address.clone(),
     vec![&env, request]).into_val(&env),
);
```

### Balance Query

```bash
# CLI smoke test — check vault's Blend position
stellar contract invoke \
  --id "$BLEND_POOL" \
  --network testnet \
  -- balance \
  --asset "$USDC" \
  --user "$VAULT_CONTRACT_ID"
```

---

## APY Fetching

Blend does not expose a single `get_apy()` function. To compute the current supply APY
the agent calls two view functions and derives the rate:

```bash
# 1. Fetch the pool's reserve data for USDC
stellar contract invoke --id "$BLEND_POOL" --network testnet \
  -- get_reserve --asset "$USDC"

# The response includes:
#   d_rate     — borrow interest rate (in fixed-point basis points)
#   b_rate     — supply interest rate derived from utilisation
#   util       — current utilisation ratio (0–1e7)

# 2. APY ≈ b_rate / 1e7 * 365 * 24 * (ledgers_per_hour)
# In practice: read b_supply_rate from ReserveData and annualise.
```

The off-chain agent reads `ReserveData.b_rate` (Blend's per-ledger supply rate) from
`get_reserve_data(asset)` and converts it to an annualised APY:

```python
# Pseudo-code — agent/src/yield_calculator.py
LEDGERS_PER_YEAR = 365 * 24 * 720  # ≈ 6,307,200

def blend_apy(b_rate_per_ledger: int) -> float:
    # b_rate is expressed in 1e9 fixed-point
    return ((1 + b_rate_per_ledger / 1e9) ** LEDGERS_PER_YEAR) - 1
```

---

## Known Limitations

| Limitation | Details | Impact |
|-----------|---------|--------|
| **Minimum supply amount** | Blend rejects supplies below `min_supply` (pool-specific, typically 1 USDC = 10,000,000 stroops). Vault enforces its own 1 USDC minimum deposit, so this is not a practical concern in normal operation. | Low |
| **100% utilisation lock** | If Blend utilisation reaches 100%, `submit(withdraw)` will revert. The vault handles this via partial-withdrawal logic: the user receives available idle USDC and retains their remaining shares. See `docs/PARTIAL_WITHDRAWAL_BEHAVIOR.md`. | Medium — monitor utilisation |
| **No withdrawal delay on Blend v2** | Blend v2 does not enforce a withdrawal delay (unlike some lending protocols). Funds are available immediately as long as liquidity exists. | Positive — no lock-up |
| **Approval TTL** | Token approvals set via `token.approve` expire at a configurable ledger (`DataKey::ApprovalTtl`, default 50,000 ledgers ≈ 70 days). The agent must re-approve before supplying if the TTL has expired. Owner configures via `set_approval_ttl`. | Operational — set TTL conservatively |
| **Blend oracle dependency** | Blend uses price oracles for collateral valuation. An oracle failure does not block USDC lending/redemption directly, but can affect overall pool health and bad-debt socialisation. | See bad-debt analysis below |
| **Cross-contract invocation cost** | Each `submit_with_allowance` or `submit` call costs approximately 600,000–900,000 Soroban gas instructions. At Stellar's current fee schedule this is ~0.01 XLM per rebalance leg. | Low |

---

## Risks

### Protocol Risk

| Risk | Severity | Mitigation |
|------|----------|------------|
| Blend smart contract bug or exploit | Critical | Vault restricts pool address to owner-whitelisted `DataKey::BlendPool`; owner can rebalance to `none` immediately via `rebalance("none", 0, 0)` |
| Blend governance attack | High | Monitor Blend governance proposals; owner can exit to idle ahead of risky changes |
| Blend v2 → v3 migration | Medium | Vault `set_blend_pool` allows owner to point to a new pool address; requires agent cooldown flush |

### Oracle Dependency Risk

Blend relies on price oracles to determine borrow collateral ratios. For **USDC-only
lending** (the vault's current usage), oracle failure has limited direct impact because:

- The vault only *supplies* USDC; it does not borrow against collateral.
- Oracle failure can cause Blend to pause borrow activity and new supply, but does not
  lock existing USDC supplies unless triggered by a bad-debt event.

If oracle failure leads to mass liquidation failures and bad-debt socialisation, see
the **Bad-Debt Analysis** section below for detection and response.

### Liquidity Risk

High Blend utilisation (>95%) means the vault may not be able to withdraw the full
deployed balance immediately. The vault's partial-withdrawal fallback handles this:
the user receives their full idle portion immediately, and retains shares for the
still-deployed portion. No user is force-liquidated.

**Agent action:** Monitor `get_reserve_data(usdc).utilisation`. If utilisation exceeds
90%, the agent should avoid rebalancing additional idle USDC into Blend and consider
a proactive partial exit to `none`.

---

## Cross-Contract Call Pattern

```rust
env.invoke_contract::<Val>(
    &pool_address,
    &Symbol::new(env, "submit_with_allowance"),
    args,
);
```

Supply flow:
1. Vault `approve`s the Blend pool for the supply amount at `approval_ttl` ledger.
2. Vault calls `submit_with_allowance` with a type-0 request.
3. Blend pulls USDC via `transfer_from` (authorized sub-invocation).
4. Vault emits `RebalanceEvent` + `ProtocolChangedEvent`.

Withdraw flow:
1. Vault calls `submit` with a type-1 request.
2. Blend transfers USDC back to the vault.
3. Vault records updated idle balance.

---

## Protocol Tracking

`DataKey::CurrentProtocol` values:

- `"none"` — Funds held idle in vault; not deployed to any protocol.
- `"blend"` — Funds supplied to the configured Blend pool.
- `"dex"` — Funds added to the configured DEX pool.

`ProtocolChangedEvent` (topic `proto_chg`) is emitted whenever `CurrentProtocol` changes.

---

## Rebalance API (Agent)

```rust
pub fn rebalance(env: Env, protocol: Symbol, expected_apy: i128, min_out: i128);
```

- `protocol`: `"blend"`, `"dex"`, or `"none"`.
- `expected_apy`: informational — stored in the `RebalanceEvent` for indexers; not
  validated on-chain.
- `min_out`: minimum assets received per supply/withdraw leg. `0` disables slippage
  checks (acceptable on testnet; always set a non-zero value on mainnet).
- `RebalanceEvent.status == "noop"`: no funds moved (e.g. already in Blend, no idle
  USDC to deploy).

---

## Testing

| Layer | Command |
|-------|---------|
| Unit / mock pool | `cargo test -p neurowealth-vault` |
| Blend interface (feature flag) | `cargo test -p neurowealth-vault --features blend-devnet` |
| End-to-end devnet | `./scripts/e2e-devnet.sh` |

### Manual Devnet Smoke Test

```bash
# 1. Set environment from devnet deployment
source scripts/devnet-contracts.env

# 2. Rebalance to Blend
stellar contract invoke --id "$VAULT_CONTRACT_ID" --source "$AGENT_SECRET_KEY" \
  --network testnet -- rebalance \
  --protocol blend --expected_apy 500 --min_out 0

# 3. Check vault Blend position
stellar contract invoke --id "$BLEND_POOL" --network testnet \
  -- balance --asset "$USDC" --user "$VAULT_CONTRACT_ID"

# 4. Verify deployed assets match
stellar contract invoke --id "$VAULT_CONTRACT_ID" --network testnet \
  -- get_deployed_assets

# 5. Rebalance back to idle
stellar contract invoke --id "$VAULT_CONTRACT_ID" --source "$AGENT_SECRET_KEY" \
  --network testnet -- rebalance \
  --protocol none --expected_apy 0 --min_out 0
```

---

## Security Considerations

1. **Reentrancy:** Blend calls follow all state updates (CEI on protocol transitions).
2. **Incomplete exit:** Rebalance aborts if a protocol switch cannot withdraw the full
   deployed balance.
3. **Slippage:** `min_out` guard on supply/withdraw legs — always set on mainnet.
4. **Approval scope:** Token approvals are scoped to exactly the supply amount and a
   bounded TTL; never an unlimited approval.

---

## Status

| Item | Status |
|------|--------|
| Research Blend interface | ✅ Complete |
| Implement `BlendPoolClient` with production entrypoints | ✅ Complete |
| `ProtocolChangedEvent` for indexers | ✅ Complete |
| Rebalance `min_out` slippage guard | ✅ Complete |
| No-op rebalance semantics (`status: "noop"`) | ✅ Complete |
| Smoke-test supply + withdraw on testnet | ✅ Complete (2026-09-24) |
| Confirm contract addresses on testnet | ✅ Complete (see above) |
| Confirm contract addresses on mainnet | ⏳ Pending mainnet launch |
| Gas measurement on testnet | ✅ ~700k instructions per leg |
| Security review of cross-contract call patterns | ⏳ Pending external audit |

---

## Bad-Debt Analysis: Socialized Loss Impact on Vault Assets

### Overview

Blend Protocol uses **socialized bad debt** to manage underwater positions and protocol
solvency. When collateral liquidations or bad debts exceed reserves, the protocol
socializes losses across all suppliers.

**Vault-side consequence:** `get_balance(user)` for a user (shares × exchange rate) can
drop without any vault-level event, because the underlying Blend balance decreases due
to protocol-level socialisation.

### Mechanism

Blend tracks a global exchange rate for supplied assets:

```
user_balance = user_shares × (total_assets / total_shares)
```

When bad debts accumulate:

1. Blend's `total_assets` decreases.
2. The ratio `(total_assets / total_shares)` falls.
3. Every supplier's balance shrinks by the same percentage.
4. No vault-side event is emitted; the vault sees the loss only via `balance()` queries.

### Worked Example: $500k Bad-Debt Event

**Before event:**
- Vault deployed to Blend: 9,500,000 USDC
- Blend total supplied: 100,000,000 USDC, Blend exchange rate: 1.000

**After event (Blend socialises $500k):**
- Blend exchange rate: 0.995
- Vault's Blend position: 9,500,000 × 0.995 = **9,450,500 USDC**
- Vault exchange rate: (500,000 idle + 9,450,500 deployed) / 10,000,000 shares = **0.99505**
- Per-user loss: **0.495%** — applied pro-rata to all users equally.

### Detection

```bash
# Monitor hourly — compare to previous rate
CURRENT_RATE=$(stellar contract invoke --id "$VAULT_CONTRACT_ID" --network mainnet \
  -- get_exchange_rate)

# Alert if rate drops > 0.5% without a corresponding withdraw event
```

Thresholds: drops > 0.5% warrant investigation; drops > 2% are critical.

### Response

| Loss Magnitude | Action |
|---------------|--------|
| < 0.5% | Log; no action required |
| 0.5%–2% | Investigate Blend health; consider holding rebalances |
| > 2% | Emergency exit: `rebalance("none", 0, 0)`; notify users |

---

## References

- Blend GitHub: https://github.com/blend-capital/blend-contracts-v2
- Blend Documentation: https://docs.blend.capital
- Blend Fund Management: https://docs.blend.capital/tech-docs/core-contracts/lending-pool/fund-management
- Bad Debt & Liquidations: https://docs.blend.capital/learn/protocol-design/bad-debt-handling
- Soroban SDK: https://soroban.stellar.org/docs
- [ARCHITECTURE.md](../ARCHITECTURE.md) — Share accounting math
- [SECURITY.md](../SECURITY.md) — Full threat model
- [docs/PARTIAL_WITHDRAWAL_BEHAVIOR.md](PARTIAL_WITHDRAWAL_BEHAVIOR.md) — Liquidity-lock fallback
