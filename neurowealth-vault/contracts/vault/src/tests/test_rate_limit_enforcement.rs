//! Rate-limit enforcement tests — Issue #92
//!
//! Verifies that on-chain rate limits are correctly enforced and cannot be
//! bypassed:
//!
//!   - Deposit more than `max_calls` times in one window → `RateLimitExceeded`
//!   - Wait for window reset (advance ledger) → deposit succeeds again
//!   - `max_calls == 0` disables the limit (unlimited calls allowed)
//!   - Withdraw and withdraw_all share the same per-user bucket
//!   - Rebalance uses a global bucket (not per-user)
//!   - Preview/conversion entrypoints share one global bucket
//!   - Independent users have independent buckets
//!
//! Uses `env.ledger().set_sequence_number()` to advance the simulated ledger
//! rather than sleeping, following the patterns in `test_rate_limiting.rs`.

#![cfg(test)]

use super::utils::*;
use crate::{
    RATE_LIMIT_DEPOSIT, RATE_LIMIT_PREVIEW, RATE_LIMIT_REBALANCE, RATE_LIMIT_WITHDRAW,
};
use soroban_sdk::{symbol_short, testutils::Address as _, testutils::Ledger, Address, Env};

// Helper: configure a category with owner auth
fn set_limit(
    client: &NeuroWealthVaultClient,
    category: soroban_sdk::Symbol,
    max_calls: u32,
    window_ledgers: u32,
) {
    client.set_rate_limit(&category, &max_calls, &window_ledgers);
}

// ── Deposit rate limit enforcement ────────────────────────────────────────────

/// AC1: Depositing more than `max_calls` times in one ledger window returns
/// `RateLimitExceeded`.
#[test]
fn deposit_exceeds_max_calls_in_window_returns_rate_limit_exceeded() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    // Allow only 2 deposits per 5-ledger window
    set_limit(&client, RATE_LIMIT_DEPOSIT, 2, 5);

    mint_and_deposit(&env, &client, &usdc_token, &user, 1_000_000);
    mint_and_deposit(&env, &client, &usdc_token, &user, 1_000_000);

    // Third deposit in the same window must fail
    let token = TestTokenClient::new(&env, &usdc_token);
    token.mint(&user, &1_000_000);
    let result = client.try_deposit(&user, &1_000_000);
    assert!(
        result.is_err(),
        "deposit beyond max_calls must return an error"
    );
}

/// AC2: After the window resets (ledger advances past window_ledgers), the
/// next deposit succeeds and the call counter restarts.
#[test]
fn deposit_succeeds_after_window_reset() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    set_limit(&client, RATE_LIMIT_DEPOSIT, 1, 3);

    // Use one call — window opens at current sequence
    mint_and_deposit(&env, &client, &usdc_token, &user, 1_000_000);
    let state = client.get_user_rate_limit_state(&user, &RATE_LIMIT_DEPOSIT);
    assert_eq!(state.calls, 1, "call counter should be 1 after first deposit");

    // Advance ledger past the window boundary
    env.ledger().set_sequence_number(state.window_start + 3);

    // Deposit again — should succeed and reset the counter to 1
    let token = TestTokenClient::new(&env, &usdc_token);
    token.mint(&user, &1_000_000);
    client.deposit(&user, &1_000_000);

    let new_state = client.get_user_rate_limit_state(&user, &RATE_LIMIT_DEPOSIT);
    assert_eq!(new_state.calls, 1, "counter must restart at 1 in the new window");
    assert_eq!(
        new_state.window_start,
        state.window_start + 3,
        "window_start must advance to the new ledger"
    );
}

/// AC3: When `max_calls == 0` the limit is disabled — any number of deposits
/// must succeed.
#[test]
fn deposit_rate_limit_disabled_when_max_calls_is_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    // max_calls = 0 disables this category
    set_limit(&client, RATE_LIMIT_DEPOSIT, 0, 5);

    let token = TestTokenClient::new(&env, &usdc_token);
    // Fire 10 deposits — none should be rejected
    for _ in 0..10 {
        token.mint(&user, &1_000_000);
        client.deposit(&user, &1_000_000);
    }
}

// ── Per-user bucket isolation ─────────────────────────────────────────────────

/// Independent users have independent rate-limit buckets.
/// Exhausting one user's bucket must not affect another user.
#[test]
fn deposit_rate_limit_buckets_are_per_user() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    set_limit(&client, RATE_LIMIT_DEPOSIT, 1, 10);

    // User A deposits once — bucket exhausted
    mint_and_deposit(&env, &client, &usdc_token, &user_a, 1_000_000);
    let token = TestTokenClient::new(&env, &usdc_token);
    token.mint(&user_a, &1_000_000);
    assert!(
        client.try_deposit(&user_a, &1_000_000).is_err(),
        "user A's second deposit must be rate-limited"
    );

    // User B's bucket is independent — must succeed
    mint_and_deposit(&env, &client, &usdc_token, &user_b, 1_000_000);

    let state_a = client.get_user_rate_limit_state(&user_a, &RATE_LIMIT_DEPOSIT);
    let state_b = client.get_user_rate_limit_state(&user_b, &RATE_LIMIT_DEPOSIT);
    assert_eq!(state_a.calls, 1, "user A counter = 1");
    assert_eq!(state_b.calls, 1, "user B counter = 1");
}

// ── Withdraw rate limit enforcement ──────────────────────────────────────────

/// Withdraw and withdraw_all share the per-user bucket — exhausting it with
/// `withdraw` prevents `withdraw_all` and vice-versa.
#[test]
fn withdraw_and_withdraw_all_share_per_user_bucket() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    set_limit(&client, RATE_LIMIT_WITHDRAW, 1, 5);
    mint_and_deposit(&env, &client, &usdc_token, &user, 3_000_000);

    // One withdrawal — uses up the single allowed call
    client.withdraw(&user, &500_000);

    // withdraw_all must also be rejected in the same window
    assert!(
        client.try_withdraw_all(&user).is_err(),
        "withdraw_all must not bypass the withdraw bucket"
    );

    // After the window, operations resume
    let state = client.get_user_rate_limit_state(&user, &RATE_LIMIT_WITHDRAW);
    env.ledger().set_sequence_number(state.window_start + 5);
    // Should succeed in the new window
    client.withdraw_all(&user);
}

// ── Rebalance global bucket ───────────────────────────────────────────────────

/// Rebalance uses a global (not per-user) bucket. Exhausting it blocks the
/// next rebalance regardless of who calls it.
#[test]
fn rebalance_uses_global_bucket() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner) = setup_vault(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    set_limit(&client, RATE_LIMIT_REBALANCE, 1, 4);
    client.rebalance(&symbol_short!("none"), &0, &0);

    assert!(
        client
            .try_rebalance(&symbol_short!("none"), &0, &0)
            .is_err(),
        "global rebalance bucket must be exhausted after 1 call"
    );

    let state = client.get_global_rate_limit_state(&RATE_LIMIT_REBALANCE);
    assert_eq!(state.calls, 1, "global call counter must be 1");

    // Advance past window
    env.ledger().set_sequence_number(state.window_start + 4);
    client.rebalance(&symbol_short!("none"), &0, &0);
    let new_state = client.get_global_rate_limit_state(&RATE_LIMIT_REBALANCE);
    assert_eq!(new_state.calls, 1, "counter must restart at 1 in new window");
}

/// Rebalance with max_calls == 0 allows unlimited rebalances.
#[test]
fn rebalance_rate_limit_disabled_when_max_calls_is_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner) = setup_vault(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    set_limit(&client, RATE_LIMIT_REBALANCE, 0, 4);

    // Fire 5 rebalances — none should fail due to rate limiting
    for _ in 0..5 {
        client.rebalance(&symbol_short!("none"), &0, &0);
    }
}

// ── Preview / conversion global bucket ───────────────────────────────────────

/// All preview and convert_to_* entrypoints share one global bucket.
#[test]
fn preview_entrypoints_share_global_bucket() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner) = setup_vault(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    set_limit(&client, RATE_LIMIT_PREVIEW, 2, 3);

    let _ = client.preview_deposit_to_shares(&1_000_000);
    let _ = client.convert_to_assets(&1_000_000);

    // Third call exhausts the shared global bucket
    assert!(
        client.try_preview_withdraw(&1_000_000).is_err(),
        "third preview call must be rejected by the shared global bucket"
    );

    // After window reset, bucket refreshes
    let state = client.get_global_rate_limit_state(&RATE_LIMIT_PREVIEW);
    env.ledger().set_sequence_number(state.window_start + 3);
    let _ = client.preview_shares_to_assets(&1_000_000);
    let post = client.get_global_rate_limit_state(&RATE_LIMIT_PREVIEW);
    assert_eq!(post.calls, 1, "counter must restart at 1 in new window");
}

/// Preview rate limit with max_calls == 0 allows unlimited calls.
#[test]
fn preview_rate_limit_disabled_when_max_calls_is_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner) = setup_vault(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    set_limit(&client, RATE_LIMIT_PREVIEW, 0, 3);

    for _ in 0..20 {
        let _ = client.preview_deposit_to_shares(&1_000_000);
    }
}

// ── Fixed-window reset semantics ──────────────────────────────────────────────

/// The window is fixed — calls at ledger N and ledger N+window-1 share the
/// same bucket; a call at ledger N+window opens a new bucket.
#[test]
fn fixed_window_resets_at_boundary_not_sliding() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    set_limit(&client, RATE_LIMIT_DEPOSIT, 2, 4);

    // Deposit 1 at ledger 0
    mint_and_deposit(&env, &client, &usdc_token, &user, 1_000_000);
    let state = client.get_user_rate_limit_state(&user, &RATE_LIMIT_DEPOSIT);
    let window_start = state.window_start;

    // Advance to ledger window_start+3 (still in the same window)
    env.ledger().set_sequence_number(window_start + 3);
    let token = TestTokenClient::new(&env, &usdc_token);
    token.mint(&user, &1_000_000);
    client.deposit(&user, &1_000_000);
    let state2 = client.get_user_rate_limit_state(&user, &RATE_LIMIT_DEPOSIT);
    assert_eq!(state2.calls, 2, "both calls still within the same 4-ledger window");
    assert_eq!(state2.window_start, window_start, "window_start unchanged mid-window");

    // Advance to exactly the boundary → new window
    env.ledger().set_sequence_number(window_start + 4);
    token.mint(&user, &1_000_000);
    client.deposit(&user, &1_000_000);
    let state3 = client.get_user_rate_limit_state(&user, &RATE_LIMIT_DEPOSIT);
    assert_eq!(state3.calls, 1, "counter must reset to 1 at the window boundary");
    assert_eq!(
        state3.window_start,
        window_start + 4,
        "window_start must advance to the boundary ledger"
    );
}
