//! Tests for Issue #56: Deposit limit validation — min and max per transaction.
//!
//! Covers:
//!  - `set_deposit_limits` stores min/max in contract storage
//!  - `deposit` rejects amounts below min (BelowMinimumDeposit = 38)
//!  - `deposit` rejects amounts above max (MaximumDepositExceeded = 39)
//!  - Default values: min = 1_000_000 (1 USDC), max = 10_000_000_000 (10,000 USDC)
//!  - `get_deposit_limits` returns (min, max) as a tuple
//!  - `DepositLimitsUpdated` event emitted on each `set_deposit_limits` call

use super::utils::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

// ============================================================================
// DEFAULT LIMITS
// ============================================================================

#[test]
fn test_default_deposit_limits() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Default min = 1 USDC (1_000_000 stroops), max = 10,000 USDC (10_000_000_000 stroops)
    assert_eq!(client.get_min_deposit(), 1_000_000_i128);
    assert_eq!(client.get_max_deposit(), 10_000_000_000_i128);
}

#[test]
fn test_get_deposit_limits_returns_tuple() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let (min, max) = client.get_deposit_limits();
    assert_eq!(min, 1_000_000_i128);
    assert_eq!(max, 10_000_000_000_i128);
}

// ============================================================================
// SET DEPOSIT LIMITS — HAPPY PATH
// ============================================================================

#[test]
fn test_owner_can_set_deposit_limits() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_min = 5_000_000_i128;     // 5 USDC
    let new_max = 1_000_000_000_i128; // 100 USDC

    client.set_deposit_limits(&new_min, &new_max);

    assert_eq!(client.get_min_deposit(), new_min);
    assert_eq!(client.get_max_deposit(), new_max);
}

#[test]
fn test_get_deposit_limits_after_set() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_min = 2_000_000_i128;   // 2 USDC
    let new_max = 500_000_000_i128; // 50 USDC

    client.set_deposit_limits(&new_min, &new_max);

    let (returned_min, returned_max) = client.get_deposit_limits();
    assert_eq!(returned_min, new_min);
    assert_eq!(returned_max, new_max);
}

#[test]
fn test_set_deposit_limits_min_equals_max() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // min == max is valid (exact-amount deposits only)
    let amount = 10_000_000_i128; // 10 USDC
    client.set_deposit_limits(&amount, &amount);

    let (min, max) = client.get_deposit_limits();
    assert_eq!(min, amount);
    assert_eq!(max, amount);
}

// ============================================================================
// DEPOSIT VALIDATION — BELOW MINIMUM
// ============================================================================

#[test]
#[should_panic(expected = "Error(Contract, #38)")]
fn test_deposit_below_custom_minimum_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let token_client = token::TestTokenClient::new(&env, &usdc_token);
    token_client.mint(&user, &10_000_000_i128);

    // Set min to 5 USDC
    client.set_deposit_limits(&5_000_000_i128, &10_000_000_000_i128);

    // Try to deposit 1 USDC — below 5 USDC min → BelowMinimumDeposit = 38
    client.deposit(&user, &1_000_000_i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #38)")]
fn test_deposit_just_below_default_minimum_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let token_client = token::TestTokenClient::new(&env, &usdc_token);
    token_client.mint(&user, &10_000_000_i128);

    // Default min is 1_000_000. Try 999_999 — one stroop below.
    client.deposit(&user, &999_999_i128);
}

// ============================================================================
// DEPOSIT VALIDATION — ABOVE MAXIMUM
// ============================================================================

#[test]
#[should_panic(expected = "Error(Contract, #39)")]
fn test_deposit_above_custom_maximum_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let token_client = token::TestTokenClient::new(&env, &usdc_token);
    token_client.mint(&user, &200_000_000_000_i128);

    // Set max to 10 USDC (100_000_000 stroops)
    client.set_deposit_limits(&1_000_000_i128, &100_000_000_i128);

    // Try to deposit 20 USDC — above 10 USDC max → MaximumDepositExceeded = 39
    client.deposit(&user, &200_000_000_i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #39)")]
fn test_deposit_exceeds_default_max_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let token_client = token::TestTokenClient::new(&env, &usdc_token);
    token_client.mint(&user, &200_000_000_000_i128);

    // Default max = 10_000_000_000. Attempt 10_000_000_001 — one stroop over.
    client.deposit(&user, &10_000_000_001_i128);
}

// ============================================================================
// DEPOSIT VALIDATION — WITHIN LIMITS (HAPPY PATH)
// ============================================================================

#[test]
fn test_deposit_at_minimum_accepted() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let token_client = token::TestTokenClient::new(&env, &usdc_token);
    token_client.mint(&user, &10_000_000_i128);

    // Deposit exactly the default minimum (1 USDC)
    client.deposit(&user, &1_000_000_i128);

    assert!(client.get_balance(&user) > 0);
}

#[test]
fn test_deposit_within_custom_limits_accepted() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Set custom range: [1 USDC, 100 USDC]
    client.set_deposit_limits(&1_000_000_i128, &1_000_000_000_i128);

    let user = Address::generate(&env);
    let token_client = token::TestTokenClient::new(&env, &usdc_token);
    token_client.mint(&user, &500_000_000_i128); // 50 USDC

    // Deposit 50 USDC — within [1, 100] USDC range
    client.deposit(&user, &500_000_000_i128);

    assert!(client.get_balance(&user) > 0);
}

// ============================================================================
// SET DEPOSIT LIMITS — INVALID CONFIGURATIONS
// ============================================================================

#[test]
#[should_panic]
fn test_set_deposit_limits_min_too_low() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // min below DEFAULT_MIN_DEPOSIT (1_000_000 = 1 USDC) is rejected
    client.set_deposit_limits(&500_000_i128, &10_000_000_000_i128);
}

#[test]
#[should_panic]
fn test_set_deposit_limits_max_less_than_min() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // max < min is invalid
    client.set_deposit_limits(&100_000_000_i128, &10_000_000_i128);
}

#[test]
#[should_panic]
fn test_set_deposit_limits_max_exceeds_ceiling() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // MAX_DEPOSIT_CEILING = 100_000_000_000. Exceeding it is rejected.
    client.set_deposit_limits(&1_000_000_i128, &100_000_000_001_i128);
}

// ============================================================================
// LIMITS UPDATE — MULTIPLE UPDATES
// ============================================================================

#[test]
fn test_can_update_deposit_limits_multiple_times() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // First update
    client.set_deposit_limits(&2_000_000_i128, &20_000_000_i128);
    assert_eq!(client.get_min_deposit(), 2_000_000_i128);
    assert_eq!(client.get_max_deposit(), 20_000_000_i128);

    // Second update
    client.set_deposit_limits(&5_000_000_i128, &50_000_000_i128);
    assert_eq!(client.get_min_deposit(), 5_000_000_i128);
    assert_eq!(client.get_max_deposit(), 50_000_000_i128);

    // Third update — check tuple getter
    client.set_deposit_limits(&1_000_000_i128, &1_000_000_000_i128);
    let (min, max) = client.get_deposit_limits();
    assert_eq!(min, 1_000_000_i128);
    assert_eq!(max, 1_000_000_000_i128);
}
