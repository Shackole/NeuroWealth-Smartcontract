# Formal Verification of Share Accounting

> **Issue:** #79 (Original Implementation: #672)  
> **Status:** Active in CI & Local Tooling  
> **Target Package:** `neurowealth-vault/share-math`  
> **Maintainer:** NeuroWealth Security & Formal Methods Team  
> **Last Updated:** 2026-09-25  

---

## 1. Introduction & Plain-English Overview

In decentralized finance (DeFi), **share accounting** is the fundamental mathematical backbone of any yield-bearing vault. When a user deposits USDC, the vault mints "shares" representing the user's fractional ownership of the pool. As yield accrues from lending protocols or liquidity pools, the vault's total asset balance grows while the total share count remains constant, driving up the redemption value of each share.

If share accounting contains even a single integer division rounding mistake or arithmetic bug:
- An attacker could repeatedly deposit and withdraw to extract fractional pennies (inflation / donation attacks), draining the vault.
- Phantom shares could be minted from thin air, diluting legitimate depositors.
- Rounding remainders could cause a user to receive more funds on withdrawal than the vault actually holds, leaving the last withdrawer holding unbacked claims.

To ensure mathematical precision, NeuroWealth uses **Formal Verification with [Kani](https://github.com/model-checking/kani)**, a bit-precise model checker for Rust based on CBMC (Bounded Model Checking). Unlike traditional unit tests that test only a few hand-picked numbers, Kani evaluates **every possible combination of mathematical inputs** within symbolic bounds to mathematically prove that our security invariants can never be violated.

---

## 2. Specification: ERC-4626 Rounding Direction Rules

The core arithmetic formulas are implemented in the dedicated zero-dependency crate [`neurowealth-vault/share-math`](../neurowealth-vault/share-math). This crate is the **single source of truth** called by `NeuroWealthVault` for all share conversions.

The vault strictly follows the **ERC-4626** standard for rounding directions, designed to protect the protocol and its existing depositors:

| Direction | On-Chain Function | Formula | Rounding Mode | Security Purpose |
|:---|:---|:---|:---:|:---|
| **Assets → Shares** (Deposit) | `shares_floor(assets, total_shares, total_assets)` | $\lfloor \frac{\text{assets} \times \text{total\_shares}}{\text{total\_assets}} \rfloor$ | **Floor** (down) | The vault keeps remainder dust; depositors never receive unbacked shares. |
| **Assets → Shares** (Withdraw Burn) | `shares_ceil(assets, total_shares, total_assets)` | $\lceil \frac{\text{assets} \times \text{total\_shares}}{\text{total\_assets}} \rceil$ | **Ceil** (up) | Users burn at least the exact shares needed; prevents leaving unburned share dust. |
| **Shares → Assets** (Redeem) | `assets_from_shares(shares, total_shares, total_assets)` | $\lfloor \frac{\text{shares} \times \text{total\_assets}}{\text{total\_shares}} \rfloor$ | **Floor** (down) | Redeemers never receive more assets than their shares are strictly entitled to. |

**Bootstrap Rule (Empty Vault):** When `total_shares == 0` or `total_assets == 0`, assets map 1:1 onto shares. A zero input (`0`) always yields zero output (`0`).

---

## 3. Plain-English Harness Explanations

Each formal proof is written as a Rust test function annotated with `#[kani::proof]`. Below is an accessible explanation of each proof harness, what property it mathematically guarantees, and why that property matters.

```
       Kani Proof Architecture
       ────────────────────────────────────────────────────────────────
       [proof_total_shares_equals_sum_of_user_shares]
       └─► Invariant: total_shares == sum(user_shares) across lifecycle

       [proof_no_negative_share_balance]
       └─► Invariant: user_shares >= 0 and total_shares >= 0

       [proof_exchange_rate_non_decreasing_with_yield]
       └─► Invariant: yield accrual never decreases share exchange rate

       [proof_deposit_withdraw_round_trip_within_tolerance]
       └─► Invariant: deposit then immediate redeem returns <= deposit

       [proof_rounding_always_favours_the_vault]
       └─► Invariant: ceil_burn >= floor_mint (divergence <= 1)

       [proof_zero_input_zero_output]
       └─► Invariant: zero in -> zero out for all conversions
```

---

### Harness 1: `proof_total_shares_equals_sum_of_user_shares`

- **What property it proves:**
  Across every possible sequence of actions in a two-user vault model—User A depositing, User B depositing, yield accruing to total assets, and User A withdrawing—the tracked `total_shares` in the vault is always **identically equal** to the sum of all individual user share balances (`user_shares[0] + user_shares[1]`).
- **Why it matters:**
  If `total_shares` were ever greater than the sum of user shares, phantom shares would dilute existing depositors. If `total_shares` were less than the sum of user shares, the last depositor attempting to withdraw would find the vault insolvent. Proving conservation of shares ensures the vault is always solvent.

---

### Harness 2: `proof_no_negative_share_balance`

- **What property it proves:**
  No sequence of deposits and attempted withdrawals can ever cause any individual user's share balance or the vault's `total_shares` to drop below zero (`< 0`). When a withdrawal request exceeds available shares, the model cleanly rejects it, leaving state unchanged.
- **Why it matters:**
  In integer arithmetic, negative values can cause underflow vulnerabilities (wrapping to huge positive numbers like $2^{128}-1$) or trigger unhandled contract panics that permanently lock user funds. This proof guarantees non-negativity across all states.

---

### Harness 3: `proof_exchange_rate_non_decreasing_with_yield`

- **What property it proves:**
  When yield accrues (increasing `total_assets` while keeping `total_shares` constant), the exchange rate $\frac{\text{total\_assets}}{\text{total\_shares}}$ is strictly non-decreasing. That is:
  $$\text{assets}_{\text{after}} \times \text{shares}_{\text{before}} \ge \text{assets}_{\text{before}} \times \text{shares}_{\text{after}}$$
- **Why it matters:**
  Yield events must only benefit depositors by increasing (or maintaining) the asset value of their shares. This proof mathematically verifies that external yield harvesting cannot accidentally cause an exchange rate drop due to integer truncation.

---

### Harness 4: `proof_deposit_withdraw_round_trip_within_tolerance`

- **What property it proves:**
  If a user deposits any amount of assets, receives minted shares calculated by `shares_floor`, and then immediately redeems those exact shares using `assets_from_shares`, the returned assets will **never exceed the original deposited assets** ($\text{redeemed} \le \text{assets}$).
- **Why it matters:**
  If a deposit-and-redeem round-trip yielded even 1 stroop more than was deposited, an arbitrageur could loop deposit and withdraw transactions millions of times in a flash-loan sandwich attack to siphon all liquidity out of the vault.

---

### Harness 5: `proof_rounding_always_favours_the_vault`

- **What property it proves:**
  Integer division rounding strictly favors the protocol:
  1. The shares burned for an asset withdrawal (`shares_ceil`) is always greater than or equal to the shares minted for that same deposit (`shares_floor`), with the gap bounded at **at most 1 unit**:
     $$0 \le \text{shares\_ceil} - \text{shares\_floor} \le 1$$
  2. Redeeming the floor-minted shares pays out less than or equal to the deposited assets.
- **Why it matters:**
  Floating point math does not exist on-chain; integer division always produces fractional remainders. This proof establishes that remainder truncation always protects the vault treasury from fractional draining attacks.

---

### Harness 6: `proof_zero_input_zero_output`

- **What property it proves:**
  Passing an asset input of `0` to `shares_floor` and `shares_ceil` returns `Some(0)`. Passing a share input of `0` to `assets_from_shares` returns `Some(0)`.
- **Why it matters:**
  Prevents zero-value griefing attacks where malicious actors submit zero-asset transactions to mint free shares or distort fee and share distributions.

---

## 4. Documented Assumptions (`kani::assume`) & Justification

Kani model checking uses `kani::assume(...)` to constrain symbolic inputs to meaningful domains. Below are the assumptions used in [`neurowealth-vault/share-math/src/proofs.rs`](../neurowealth-vault/share-math/src/proofs.rs):

```rust
const MAX: i128 = 64;

fn bounded_positive() -> i128 {
    let value: i128 = kani::any();
    kani::assume(value >= 1 && value <= MAX);
    value
}

fn bounded_non_negative() -> i128 {
    let value: i128 = kani::any();
    kani::assume(value >= 0 && value <= MAX);
    value
}
```

### Detailed Justification of Assumptions

1. **`value >= 1` (Positivity for Assets & Shares):**
   - *On-Chain Context:* The smart contract enforces `require_positive_amount` on deposits and withdrawals. Zero-amount inputs are handled by `proof_zero_input_zero_output`.
   - *Justification:* Testing values $\ge 1$ reflects real-world operational constraints where negative or zero values are pre-filtered by contract guard rails.

2. **`value <= MAX` (`MAX = 64`):**
   - *Bit-Level State Complexity:* CBMC translates Rust code into Boolean SAT formulas. Unconstrained 128-bit multiplications ($\text{assets} \times \text{total\_shares}$) generate $256$-bit intermediate numbers with hundreds of thousands of SAT clauses, resulting in combinatorial explosion and solver timeouts.
   - *Exhaustive Remainder Coverage:* In integer division $\lfloor \frac{a \times b}{c} \rfloor$, rounding anomalies occur strictly due to the integer remainder modulo $c$. A bound of $64$ explores every possible remainder from $0$ to $63$, covering all edge cases (coprime ratios, exact divisors, off-by-one numerators, powers of 2).
   - *Large-Scale Complement:* While Kani exhaustively explores $1..=64$, the `proptest` test suite (`test_share_conversion_proptest.rs`) and cargo-fuzz targets (`fuzz/fuzz_targets/share_accounting_invariants.rs`) complement Kani by testing pseudo-random inputs up to $10^{12}$ and $10^{38}$.

---

## 5. Instructions for Running Kani Proofs Locally

### 5.1 Installation & Setup
Install `cargo-kani` using Rust's package manager:

```bash
# 1. Install Kani verifier
cargo install --locked kani-verifier

# 2. Run initial Kani setup (downloads CBMC dependencies)
cargo kani setup
```

### 5.2 Running All Proofs
To execute all Kani harnesses across the `share-math` crate:

```bash
# Option A: Using the automated helper script
./scripts/run-kani-proofs.sh

# Option B: Direct cargo kani invocation
cd neurowealth-vault
cargo kani -p share-math --features kani
```

### 5.3 Running an Individual Harness
You can run an isolated harness by name to verify a specific property quickly:

```bash
cd neurowealth-vault
cargo kani -p share-math --features kani --harness proof_rounding_always_favours_the_vault
```

### 5.4 Running Concrete Unit Tests (No Kani Required)
Standard unit tests covering concrete cases and regression values can be executed without Kani:

```bash
cd neurowealth-vault
cargo test -p share-math
```

---

## 6. Continuous Integration (CI) Instructions

To integrate Kani proofs into GitHub Actions, add the following workflow job to `.github/workflows/ci.yml` using the official [`model-checking/kani-github-action`](https://github.com/model-checking/kani-github-action):

```yaml
  kani-formal-verification:
    name: Kani Formal Verification (share-math)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Install Rust Toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Verify Kani Proofs
        uses: model-checking/kani-github-action@v1
        with:
          args: "--features kani"
          working-directory: "neurowealth-vault"
          crate: "share-math"
```

### CI Enforcement Policy
- **PR Blocker:** The `kani-formal-verification` job must pass for any pull request touching `neurowealth-vault/share-math`, `contracts/vault`, or `ARCHITECTURE.md`.
- **Release Gate:** WASM builds for devnet or mainnet deployments are blocked if Kani verification fails on `main`.

---

## 7. Known Limitations of Current Proof Coverage

While formal verification provides mathematical certainty, contributors should be aware of current scope limitations:

1. **Small Bound Limit (`MAX = 64`):**
   Kani proofs verify inputs up to $64$. Extreme overflow near $2^{128}-1$ is prevented by Rust's `checked_mul` / `checked_div` and verified by `proptest`, but not proved for all 128-bit values by Kani.
2. **Simplified Model (`VaultModel`):**
   Harnesses 1 and 2 operate against a 2-user discrete state machine (`VaultModel`), not an arbitrary $N$-user dynamic tree.
3. **Isolation to `share-math`:**
   Kani verifies the pure mathematical library in isolation. It does not model the live Soroban Host environment, ledger storage key lifetime, or cross-contract reentrancy.

---

## 8. Properties NOT Yet Proven (Future Work)

The following properties are targeted for future formal verification cycles:

| Target Property | Proposed Tool | Scope | Status |
|:---|:---:|:---|:---:|
| **Multi-Asset Invariant:** Exchange rate preservation across independent token share pools (`AssetTotals`) | Kani | `contracts/vault` | Planned |
| **Performance Fee Invariance:** Share dilution bounds during fee deduction on yield | Kani | `share-math` | Planned |
| **Protocol Rebalance Balance-Delta:** Verification that rebalancing with slippage cannot inflate total assets | Kani | `contracts/vault` | In Design |
| **Upgrade Timelock Transitions:** Timelock state machine transitions (propose, wait 17,280 ledgers, execute, cancel) | TLA+ / Kani | `formal-methods/` | In Progress |

---

## 9. References

- [`neurowealth-vault/share-math/src/proofs.rs`](../neurowealth-vault/share-math/src/proofs.rs) — Source code for all Kani harnesses.
- [`neurowealth-vault/share-math/src/lib.rs`](../neurowealth-vault/share-math/src/lib.rs) — ERC-4626 rounding mathematical implementation.
- [`scripts/run-kani-proofs.sh`](../scripts/run-kani-proofs.sh) — Local proof execution script.
- [ERC-4626 Tokenized Vault Standard](https://eips.ethereum.org/EIPS/eip-4626) — Specifications on rounding directions.
- [Kani Rust Verifier Documentation](https://model-checking.github.io/kani/) — Official CBMC model checking guide.
