//! Tests for `batch_touch_ttl` — Issue #48.
//!
//! Verifies that batching multiple TTL-extension calls into one transaction
//! works correctly, returns the right boolean vector, emits the event, and
//! respects the batch-size guard.

use super::utils::*;
use crate::DataKey;
use soroban_sdk::testutils::storage::Persistent as _;
use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

// ============================================================================
// Basic correctness
// ============================================================================

/// An empty batch returns an empty vector and does NOT panic.
#[test]
fn test_batch_touch_ttl_empty_batch() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner) = setup_vault(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let users: Vec<Address> = Vec::new(&env);
    let results = client.batch_touch_ttl(&users);

    assert_eq!(results.len(), 0, "empty batch should return empty vec");
}

/// Users with shares get `true`; users without shares get `false`.
/// The result vector preserves the same order as the input.
#[test]
fn test_batch_touch_ttl_mixed_existing_and_missing() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user_with_shares = Address::generate(&env);
    let user_without_shares = Address::generate(&env);

    mint_and_deposit(&env, &client, &usdc_token, &user_with_shares, 5_000_000);

    let mut users: Vec<Address> = Vec::new(&env);
    users.push_back(user_with_shares.clone());
    users.push_back(user_without_shares.clone());
    users.push_back(user_with_shares.clone()); // duplicate with shares

    let results = client.batch_touch_ttl(&users);

    assert_eq!(results.len(), 3);
    assert!(results.get(0).unwrap(), "user with shares → true");
    assert!(!results.get(1).unwrap(), "user without shares → false");
    assert!(results.get(2).unwrap(), "duplicate user with shares → true");
}

/// All users with shares: every element should be `true`.
#[test]
fn test_batch_touch_ttl_all_existing() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    let user_c = Address::generate(&env);

    for u in [&user_a, &user_b, &user_c] {
        mint_and_deposit(&env, &client, &usdc_token, u, 1_000_000);
    }

    let mut users: Vec<Address> = Vec::new(&env);
    users.push_back(user_a.clone());
    users.push_back(user_b.clone());
    users.push_back(user_c.clone());

    let results = client.batch_touch_ttl(&users);

    assert_eq!(results.len(), 3);
    for i in 0..3 {
        assert!(results.get(i).unwrap(), "user {i} should be true");
    }
}

/// All users without shares: every element should be `false`.
#[test]
fn test_batch_touch_ttl_all_missing() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner) = setup_vault(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let mut users: Vec<Address> = Vec::new(&env);
    for _ in 0..5 {
        users.push_back(Address::generate(&env));
    }

    let results = client.batch_touch_ttl(&users);

    assert_eq!(results.len(), 5);
    for i in 0..5 {
        assert!(!results.get(i).unwrap(), "user {i} without shares → false");
    }
}

// ============================================================================
// TTL extension verification
// ============================================================================

/// `batch_touch_ttl` must actually extend the TTL of matched entries.
#[test]
fn test_batch_touch_ttl_extends_ttl() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 5_000_000);

    // Force TTL to a very low value so extension is detectable
    env.as_contract(&contract_id, || {
        env.storage().persistent().extend_ttl(
            &DataKey::Shares(user.clone()),
            0, // always act
            1, // 1 ledger remaining
        )
    });

    let ttl_before = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Shares(user.clone()))
    });

    let mut users: Vec<Address> = Vec::new(&env);
    users.push_back(user.clone());
    let results = client.batch_touch_ttl(&users);

    assert!(results.get(0).unwrap(), "user with shares → true");

    let ttl_after = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Shares(user.clone()))
    });

    assert!(
        ttl_after > ttl_before,
        "TTL must increase from {ttl_before} after batch_touch_ttl"
    );
}

// ============================================================================
// Batch size guard
// ============================================================================

/// A batch exceeding `max_batch_size` must be rejected with `BatchSizeExceeded`.
#[test]
fn test_batch_touch_ttl_exceeds_max_batch_size() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner) = setup_vault(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Set a small batch limit so we can test the guard without 51 users
    client.set_max_batch_size(&owner, &3);

    let mut users: Vec<Address> = Vec::new(&env);
    for _ in 0..4 {
        users.push_back(Address::generate(&env));
    }

    let result = client.try_batch_touch_ttl(&users);
    assert!(
        result.is_err(),
        "batch larger than max_batch_size must be rejected"
    );
}

/// Exactly at `max_batch_size` must succeed.
#[test]
fn test_batch_touch_ttl_at_max_batch_size_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner) = setup_vault(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    client.set_max_batch_size(&owner, &3);

    let mut users: Vec<Address> = Vec::new(&env);
    for _ in 0..3 {
        users.push_back(Address::generate(&env));
    }

    let results = client.batch_touch_ttl(&users);
    assert_eq!(results.len(), 3, "batch at max size must succeed");
}

// ============================================================================
// Event emission
// ============================================================================

/// `batch_touch_ttl` must emit exactly one `BatchTtlTouchedEvent` with the
/// correct `count` and `users_extended` fields.
#[test]
fn test_batch_touch_ttl_emits_event() {
    use crate::{BatchTtlTouchedEvent, TOPIC_BATCH_TTL_TOUCHED};
    use soroban_sdk::testutils::Events as _;

    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user_with = Address::generate(&env);
    let user_without = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user_with, 5_000_000);

    let mut users: Vec<Address> = Vec::new(&env);
    users.push_back(user_with.clone());
    users.push_back(user_without.clone());

    client.batch_touch_ttl(&users);

    let all_events = env.events().all();
    let batch_events: soroban_sdk::Vec<_> = all_events
        .iter()
        .filter(|(_, topics, _)| {
            topics.len() > 0
                && topics
                    .get(0)
                    .map(|t| t == TOPIC_BATCH_TTL_TOUCHED.into_val(&env))
                    .unwrap_or(false)
        })
        .collect();

    assert_eq!(batch_events.len(), 1, "exactly one BatchTtlTouchedEvent");

    let (_, _, payload) = batch_events.get(0).unwrap();
    let event: BatchTtlTouchedEvent = soroban_sdk::from_val(&env, &payload);
    assert_eq!(event.count, 2, "count should equal batch size");
    assert_eq!(event.users_extended, 1, "one user had shares");
}
