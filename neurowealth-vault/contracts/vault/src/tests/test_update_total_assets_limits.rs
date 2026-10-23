//! Acceptance tests for Issue #437 — loss reporting limits for total asset updates.
//!
//! Verifies the explicit valuation constraints on `update_total_assets`:
//!
//! 1. Impossible values (negative `new_total`) are rejected.
//! 2. Zero is accepted (valid for a vault with no assets).
//! 3. A decrease without `allow_decrease = true` is rejected.
//! 4. A decrease that exceeds `max_decrease_bps` is rejected.
//! 5. An increase beyond on-chain balance is rejected (no principal minting).
//! 6. An accepted loss updates share pricing consistently (exchange rate falls proportionally).

use super::utils::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

// ============================================================================
// Helpers
// ============================================================================

/// Deploy a vault, deposit `amount`, and return the key handles.
fn setup_with_deposit(
    env: &Env,
    amount: i128,
) -> (NeuroWealthVaultClient<'_>, Address, Address, Address) {
    let (contract_id, agent, owner, usdc_token) = setup_vault_with_token(env);
    let client = NeuroWealthVaultClient::new(env, &contract_id);

    let user = Address::generate(env);
    mint_and_deposit(env, &client, &usdc_token, &user, amount);

    (client, agent, owner, usdc_token)
}

// ============================================================================
// AC1 — Impossible values are rejected
// ============================================================================

/// `new_total < 0` must be rejected immediately, before any other check.
/// A negative total assets figure is physically impossible and would corrupt
/// share-price math.
#[test]
fn test_negative_new_total_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, agent, _owner, _usdc_token) = setup_with_deposit(&env, 10_000_000_i128);

    let result = client.try_update_total_assets(&agent, &(-1_i128), &false, &0_u32);
    assert!(
        result.is_err(),
        "negative new_total must be rejected"
    );

    // State unchanged.
    assert_eq!(
        client.get_total_assets(),
        10_000_000_i128,
        "total assets must not change after rejected update"
    );
}

/// Deeply negative values must also be rejected, not silently wrapped.
#[test]
fn test_deeply_negative_new_total_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, agent, _owner, _usdc_token) = setup_with_deposit(&env, 10_000_000_i128);

    let result = client.try_update_total_assets(&agent, &i128::MIN, &false, &0_u32);
    assert!(result.is_err(), "i128::MIN must be rejected as impossible");
}

/// `new_total == 0` is valid: it represents a fully drained vault (e.g. after
/// a loss write-down to zero) or a freshly initialized vault before any deposit.
#[test]
fn test_zero_new_total_accepted_for_empty_vault() {
    let env = Env::default();
    env.mock_all_auths();

    // No deposit — TotalAssets is already 0.
    let (contract_id, agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Reporting 0 on a 0-asset vault is a no-op; must succeed.
    let result = client.try_update_total_assets(&agent, &0_i128, &false, &0_u32);
    assert!(
        result.is_ok(),
        "new_total == 0 on an empty vault must be accepted"
    );
    assert_eq!(client.get_total_assets(), 0_i128);
}

// ============================================================================
// AC2 — Accepted losses update share pricing consistently
// ============================================================================

/// After an accepted loss the exchange rate (assets per share) must fall
/// proportionally. No shares are minted or burned; only the rate changes.
#[test]
fn test_accepted_loss_updates_share_pricing_consistently() {
    let env = Env::default();
    env.mock_all_auths();

    let deposit = 10_000_000_i128; // 10 USDC
    let (client, agent, owner, usdc_token) = setup_with_deposit(&env, deposit);

    let total_shares_before = client.get_total_shares();
    assert!(total_shares_before > 0, "pre-condition: shares exist");

    // Report a 5% loss (500 bps); owner must co-sign.
    let loss_bps = 500_u32;
    let loss_amount = deposit * loss_bps as i128 / 10_000;
    let new_total = deposit - loss_amount; // 9_500_000

    // Mint enough tokens so vault holds the new_total on-chain
    // (the vault already holds the full deposit; we're just reporting it lower).
    let _ = usdc_token;

    client.update_total_assets(&agent, &new_total, &true, &loss_bps);

    // Total assets must reflect the reported loss.
    assert_eq!(
        client.get_total_assets(),
        new_total,
        "total assets must equal the reported new_total after loss"
    );

    // Total shares must be unchanged (no burn on loss).
    assert_eq!(
        client.get_total_shares(),
        total_shares_before,
        "total shares must not change after a loss report"
    );

    // Exchange rate must have fallen (each share buys fewer assets).
    let rate_after = client.get_exchange_rate();
    // Exchange rate = assets * 10_000_000 / shares; for deposit==shares it equals
    // new_total * 10_000_000 / deposit. Rate must be below 10_000_000 (1:1 baseline).
    assert!(
        rate_after < 10_000_000_i128,
        "exchange rate must fall after a loss: got {rate_after}"
    );
}

// ============================================================================
// AC3 — Reporting cannot mint principal or bypass accounting bounds
// ============================================================================

/// Attempting to report a `new_total` greater than the vault's on-chain USDC
/// balance (idle + deployed) must be rejected. This prevents the agent from
/// inflating assets beyond what can actually be paid out.
#[test]
fn test_inflation_above_balance_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let deposit = 10_000_000_i128;
    let (client, agent, _owner, _usdc_token) = setup_with_deposit(&env, deposit);

    // Try to report more than the vault holds.
    let inflated = deposit + 1_000_000_i128;
    let result = client.try_update_total_assets(&agent, &inflated, &false, &0_u32);
    assert!(
        result.is_err(),
        "new_total exceeding on-chain balance must be rejected"
    );

    // State unchanged.
    assert_eq!(client.get_total_assets(), deposit);
}

/// A decrease without `allow_decrease = true` must be rejected, even by the
/// authorized agent, even with owner co-sign. The caller must explicitly opt in.
#[test]
fn test_decrease_without_allow_decrease_flag_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let deposit = 10_000_000_i128;
    let (client, agent, _owner, _usdc_token) = setup_with_deposit(&env, deposit);

    let new_total = deposit - 100_000_i128; // small decrease
    let result = client.try_update_total_assets(&agent, &new_total, &false, &0_u32);
    assert!(
        result.is_err(),
        "decrease with allow_decrease=false must be rejected"
    );

    assert_eq!(client.get_total_assets(), deposit, "state must be unchanged");
}

/// A decrease that exceeds the configured `max_decrease_bps` must be rejected,
/// even when `allow_decrease = true` and the owner co-signs. This caps the
/// per-call blast radius of a compromised key.
#[test]
fn test_decrease_exceeding_max_bps_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let deposit = 10_000_000_i128;
    let (client, agent, _owner, _usdc_token) = setup_with_deposit(&env, deposit);

    // Allow up to 5% decrease (500 bps), but attempt a 20% decrease.
    let max_bps = 500_u32;
    let attempted_decrease = deposit * 20 / 100; // 20%
    let new_total = deposit - attempted_decrease;

    let result = client.try_update_total_assets(&agent, &new_total, &true, &max_bps);
    assert!(
        result.is_err(),
        "decrease exceeding max_decrease_bps must be rejected"
    );

    assert_eq!(client.get_total_assets(), deposit, "state must be unchanged");
}

/// A decrease within the cap with `allow_decrease = true` and owner co-sign
/// must succeed. This is the valid loss-reporting path.
#[test]
fn test_valid_decrease_within_cap_accepted() {
    let env = Env::default();
    env.mock_all_auths();

    let deposit = 10_000_000_i128;
    let (client, agent, _owner, _usdc_token) = setup_with_deposit(&env, deposit);

    // Report a 3% loss; cap is 10% — this must succeed.
    let max_bps = 1_000_u32; // 10%
    let loss = deposit * 3 / 100; // 3%
    let new_total = deposit - loss;

    let result = client.try_update_total_assets(&agent, &new_total, &true, &max_bps);
    assert!(
        result.is_ok(),
        "valid decrease within cap must be accepted; got: {result:?}"
    );
    assert_eq!(client.get_total_assets(), new_total);
}
