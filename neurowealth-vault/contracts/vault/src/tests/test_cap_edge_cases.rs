//! Edge-case tests for TVL cap and per-user deposit cap enforcement (Issue #95).
//!
//! Acceptance criteria:
//!   1. Deposit exactly at TVL cap succeeds; 1 stroop over fails with #41.
//!   2. Deposit exactly at user cap succeeds; 1 stroop over fails with #40.
//!   3. Two users each depositing to their cap do not block each other.
//!   4. Owner reduces TVL cap below current TVL → existing deposits unaffected.
//!   5. Batch deposit where the aggregate exceeds user cap → fails with #40.
//!   6. set_caps(0, 0) / individual zero setters disable both caps (unlimited).

use super::utils::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

const USDC: i128 = 1_000_000; // 1 USDC in stroops (7 decimal places)

// ============================================================================
// AC-1: Deposit exactly at TVL cap succeeds; 1 stroop over fails with #41
// ============================================================================

/// Deposit of exactly tvl_cap stroops must succeed.
#[test]
fn test_deposit_exactly_at_tvl_cap_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let tvl_cap = 10 * USDC;
    client.set_tvl_cap(&tvl_cap);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, tvl_cap);

    assert_eq!(
        client.get_total_deposits(),
        tvl_cap,
        "Total deposits should equal TVL cap after exact-cap deposit"
    );
}

/// Deposit of tvl_cap + 1 stroop must fail with ExceedsTvlCap (#41).
#[test]
#[should_panic(expected = "Error(Contract, #41)")]
fn test_deposit_one_stroop_over_tvl_cap_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let tvl_cap = 10 * USDC;
    client.set_tvl_cap(&tvl_cap);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, tvl_cap + 1);
}

/// try_deposit at tvl_cap + 1 returns the TvlCap error without panicking.
#[test]
fn test_try_deposit_one_stroop_over_tvl_cap_returns_error() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    let tvl_cap = 10 * USDC;
    client.set_tvl_cap(&tvl_cap);

    let user = Address::generate(&env);
    token_client.mint(&user, &(tvl_cap + 1));

    let result = client.try_deposit(&user, &(tvl_cap + 1));
    assert!(
        result.is_err(),
        "Deposit 1 stroop over TVL cap must return an error"
    );
    assert_eq!(
        result,
        Err(Ok(soroban_sdk::Error::from_contract_error(41))),
        "Error must be ExceedsTvlCap (#41)"
    );
}

// ============================================================================
// AC-2: Deposit exactly at user cap succeeds; 1 stroop over fails with #40
// ============================================================================

/// Deposit of exactly user_cap stroops must succeed.
#[test]
fn test_deposit_exactly_at_user_cap_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user_cap = 5 * USDC;
    client.set_user_deposit_cap(&user_cap);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, user_cap);

    assert_eq!(
        client.get_balance(&user),
        user_cap,
        "User balance should equal user cap after exact-cap deposit"
    );
}

/// Deposit of user_cap + 1 stroop must fail with ExceedsUserDepositCap (#40).
#[test]
#[should_panic(expected = "Error(Contract, #40)")]
fn test_deposit_one_stroop_over_user_cap_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user_cap = 5 * USDC;
    client.set_user_deposit_cap(&user_cap);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, user_cap + 1);
}

/// try_deposit at user_cap + 1 returns the UserCap error without panicking.
#[test]
fn test_try_deposit_one_stroop_over_user_cap_returns_error() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    let user_cap = 5 * USDC;
    client.set_user_deposit_cap(&user_cap);

    let user = Address::generate(&env);
    token_client.mint(&user, &(user_cap + 1));

    let result = client.try_deposit(&user, &(user_cap + 1));
    assert!(
        result.is_err(),
        "Deposit 1 stroop over user cap must return an error"
    );
    assert_eq!(
        result,
        Err(Ok(soroban_sdk::Error::from_contract_error(40))),
        "Error must be ExceedsUserDepositCap (#40)"
    );
}

// ============================================================================
// AC-3: Two users each depositing to their cap do not block each other
// ============================================================================

/// Each user has an independent cap bucket. User A filling their cap
/// must not prevent User B from depositing up to the same cap.
#[test]
fn test_two_users_at_user_cap_independent() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Set user cap to 10 USDC and TVL cap large enough for both users.
    let user_cap = 10 * USDC;
    let tvl_cap = 100 * USDC;
    client.set_user_deposit_cap(&user_cap);
    client.set_tvl_cap(&tvl_cap);

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    // User A deposits exactly at user cap.
    mint_and_deposit(&env, &client, &usdc_token, &user_a, user_cap);
    assert_eq!(client.get_balance(&user_a), user_cap);

    // User B should be able to deposit up to their own cap independently.
    mint_and_deposit(&env, &client, &usdc_token, &user_b, user_cap);
    assert_eq!(client.get_balance(&user_b), user_cap);
}

/// After User A fills their cap, User B can still make partial deposits
/// and User A is blocked from depositing more (their cap is full).
#[test]
fn test_user_a_full_cap_does_not_prevent_user_b_partial_deposit() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    let user_cap = 8 * USDC;
    let tvl_cap = 100 * USDC;
    client.set_user_deposit_cap(&user_cap);
    client.set_tvl_cap(&tvl_cap);

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    // User A fills their cap.
    mint_and_deposit(&env, &client, &usdc_token, &user_a, user_cap);

    // User A is now blocked from depositing even 1 more stroop.
    token_client.mint(&user_a, &1_i128);
    let result_a = client.try_deposit(&user_a, &1_i128);
    assert!(
        result_a.is_err(),
        "User A must be blocked after filling their cap"
    );

    // User B's cap is entirely independent — can deposit up to their cap.
    mint_and_deposit(&env, &client, &usdc_token, &user_b, 5 * USDC);
    assert_eq!(client.get_balance(&user_b), 5 * USDC);
}

// ============================================================================
// AC-4: Owner reduces TVL cap below current TVL — existing deposits unaffected
// ============================================================================

/// Reducing the TVL cap below current total assets does not eject existing
/// deposits; it only blocks new ones until TVL drops back under the cap.
#[test]
fn test_owner_reduces_tvl_cap_below_current_tvl_existing_deposits_safe() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    // Deposit 20 USDC total (two users, 10 each).
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user_a, 10 * USDC);
    mint_and_deposit(&env, &client, &usdc_token, &user_b, 10 * USDC);

    assert_eq!(client.get_total_deposits(), 20 * USDC);

    // Owner reduces TVL cap to 15 USDC — below current TVL of 20 USDC.
    client.set_tvl_cap(&(15 * USDC));

    // Existing balances must be unaffected.
    assert_eq!(
        client.get_balance(&user_a),
        10 * USDC,
        "User A's existing deposit must not be touched"
    );
    assert_eq!(
        client.get_balance(&user_b),
        10 * USDC,
        "User B's existing deposit must not be touched"
    );
    assert_eq!(
        client.get_total_deposits(),
        20 * USDC,
        "Total deposits must remain unchanged after cap reduction"
    );

    // New deposits are now blocked.
    let user_c = Address::generate(&env);
    token_client.mint(&user_c, &USDC);
    let result = client.try_deposit(&user_c, &USDC);
    assert!(
        result.is_err(),
        "New deposits must be blocked when TVL cap is below current TVL"
    );
}

// ============================================================================
// AC-5: Batch deposit aggregate exceeding user cap → rejected with #40
// ============================================================================

/// A batch deposit whose AGGREGATE amount exceeds the user cap must be
/// rejected entirely with ExceedsUserDepositCap (#40).
#[test]
#[should_panic(expected = "Error(Contract, #40)")]
fn test_batch_deposit_aggregate_over_user_cap_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    // User cap = 10 USDC; batch will try to deposit 12 USDC in two entries.
    let user_cap = 10 * USDC;
    client.set_user_deposit_cap(&user_cap);

    let user = Address::generate(&env);
    token_client.mint(&user, &(12 * USDC));

    // Two entries of 6 USDC each = 12 USDC total > 10 USDC cap.
    let mut entries = Vec::new(&env);
    entries.push_back((usdc_token.clone(), 6 * USDC));
    entries.push_back((usdc_token.clone(), 6 * USDC));

    client.batch_deposit(&user, &entries);
}

/// A batch deposit whose aggregate exactly equals the user cap must succeed.
#[test]
fn test_batch_deposit_aggregate_exactly_at_user_cap_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    // User cap = 10 USDC; batch deposits exactly 10 USDC in two entries.
    let user_cap = 10 * USDC;
    client.set_user_deposit_cap(&user_cap);

    let user = Address::generate(&env);
    token_client.mint(&user, &user_cap);

    // Two entries of 5 USDC each = 10 USDC exactly.
    let mut entries = Vec::new(&env);
    entries.push_back((usdc_token.clone(), 5 * USDC));
    entries.push_back((usdc_token.clone(), 5 * USDC));

    client.batch_deposit(&user, &entries);

    assert_eq!(client.get_balance(&user), user_cap);
}

/// A batch deposit whose aggregate exceeds the TVL cap must be
/// rejected entirely with ExceedsTvlCap (#41).
#[test]
#[should_panic(expected = "Error(Contract, #41)")]
fn test_batch_deposit_aggregate_over_tvl_cap_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    let tvl_cap = 8 * USDC;
    client.set_tvl_cap(&tvl_cap);

    let user = Address::generate(&env);
    token_client.mint(&user, &(10 * USDC));

    // Two entries totalling 10 USDC — exceeds TVL cap of 8 USDC.
    let mut entries = Vec::new(&env);
    entries.push_back((usdc_token.clone(), 5 * USDC));
    entries.push_back((usdc_token.clone(), 5 * USDC));

    client.batch_deposit(&user, &entries);
}

// ============================================================================
// AC-6: set_caps(0, 0) / individual zero setters disable both caps (unlimited)
// ============================================================================

/// Setting each cap individually to 0 disables both; deposits well above
/// what was previously capped must succeed.
#[test]
fn test_individual_zero_caps_disable_enforcement() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // First set restrictive caps.
    client.set_tvl_cap(&(5 * USDC));
    client.set_user_deposit_cap(&(3 * USDC));

    // Disable both caps individually.
    client.set_tvl_cap(&0_i128);
    client.set_user_deposit_cap(&0_i128);

    assert_eq!(client.get_tvl_cap(), 0, "TVL cap should be 0 (unlimited)");
    assert_eq!(
        client.get_user_deposit_cap(),
        0,
        "User deposit cap should be 0 (unlimited)"
    );

    // Large deposit — would have been blocked by either cap.
    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 50 * USDC);

    assert_eq!(client.get_balance(&user), 50 * USDC);
}

/// set_caps(0, 0) using the combined setter also disables both caps.
#[test]
fn test_set_caps_combined_zero_zero_disables_both() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Disable both via set_caps(0, 0).
    client.set_caps(&0_i128, &0_i128);

    assert_eq!(client.get_user_deposit_cap(), 0);
    assert_eq!(client.get_tvl_cap(), 0);

    // Deposit above any reasonable cap — must succeed.
    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 100 * USDC);

    assert_eq!(client.get_balance(&user), 100 * USDC);
}
