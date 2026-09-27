//! Dedicated tests verifying that `get_pending_agent_update` returns `None`
//! after `confirm_agent_update` or `cancel_agent_update` completes (issue #58).
//!
//! Acceptance criterion:
//!   "get_pending_agent_update returns None after confirmation or cancellation"
//!
//! These tests directly pin the storage-cleanup guarantee: both confirm and
//! cancel remove `DataKey::PendingAgent` and `DataKey::AgentTimelockExpiry`
//! before they return, so any subsequent call to `get_pending_agent_update`
//! must observe `None`.

use super::utils::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env};

// ─── After confirmation ───────────────────────────────────────────────────────

/// `get_pending_agent_update` returns `None` immediately after a successful
/// `confirm_agent_update` call.
#[test]
fn test_get_pending_returns_none_after_confirm() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    // Advance past the timelock expiry.
    let (_, expiry) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry);

    // Confirm the pending update.
    client.confirm_agent_update();

    // Must be None — storage was cleaned up by confirm.
    assert!(
        client.get_pending_agent_update().is_none(),
        "get_pending_agent_update must return None after confirmation"
    );
}

/// `get_pending_agent_update` returns `None` immediately after a successful
/// `confirm_agent_update` call even when confirmed long after the expiry.
#[test]
fn test_get_pending_returns_none_after_late_confirm() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    // Advance far past the timelock expiry.
    let (_, expiry) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry + 500_000);

    client.confirm_agent_update();

    assert!(
        client.get_pending_agent_update().is_none(),
        "get_pending_agent_update must return None after late confirmation"
    );
}

/// After a confirmation, `get_pending_agent_update` continues to return `None`
/// on every subsequent call — the cleared state is durable.
#[test]
fn test_get_pending_remains_none_after_confirm() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    let (_, expiry) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry);
    client.confirm_agent_update();

    // Call multiple times — all must return None.
    for _ in 0..3 {
        assert!(
            client.get_pending_agent_update().is_none(),
            "get_pending_agent_update must consistently return None after confirm"
        );
    }
}

// ─── After cancellation ──────────────────────────────────────────────────────

/// `get_pending_agent_update` returns `None` immediately after a
/// `cancel_agent_update` call (cancelled before expiry).
#[test]
fn test_get_pending_returns_none_after_cancel_before_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    // Cancel while still inside the timelock window.
    client.cancel_agent_update();

    assert!(
        client.get_pending_agent_update().is_none(),
        "get_pending_agent_update must return None after pre-expiry cancellation"
    );
}

/// `get_pending_agent_update` returns `None` after a `cancel_agent_update`
/// call that occurs after the timelock window has already opened.
#[test]
fn test_get_pending_returns_none_after_cancel_after_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    // Advance past expiry then cancel.
    let (_, expiry) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry + 1_000);

    client.cancel_agent_update();

    assert!(
        client.get_pending_agent_update().is_none(),
        "get_pending_agent_update must return None after post-expiry cancellation"
    );
}

/// After a cancellation, `get_pending_agent_update` continues to return `None`
/// on every subsequent call — the cleared state is durable.
#[test]
fn test_get_pending_remains_none_after_cancel() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);
    client.cancel_agent_update();

    for _ in 0..3 {
        assert!(
            client.get_pending_agent_update().is_none(),
            "get_pending_agent_update must consistently return None after cancel"
        );
    }
}

// ─── Propose → confirm → propose → cancel ────────────────────────────────────

/// Verifies the full propose → confirm → propose → cancel sequence:
/// `get_pending_agent_update` must be `None` after the confirm step, `Some`
/// during the second proposal, and `None` again after cancellation.
#[test]
fn test_get_pending_none_through_two_cycles() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let agent2 = Address::generate(&env);
    let agent3 = Address::generate(&env);

    // — Cycle 1: propose → confirm —
    client.update_agent(&agent2);
    assert!(
        client.get_pending_agent_update().is_some(),
        "should be Some during first proposal"
    );

    let (_, expiry1) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry1);
    client.confirm_agent_update();

    assert!(
        client.get_pending_agent_update().is_none(),
        "must be None after first confirmation"
    );

    // — Cycle 2: propose → cancel —
    client.update_agent(&agent3);
    assert!(
        client.get_pending_agent_update().is_some(),
        "should be Some during second proposal"
    );

    client.cancel_agent_update();

    assert!(
        client.get_pending_agent_update().is_none(),
        "must be None after second cancellation"
    );
}
