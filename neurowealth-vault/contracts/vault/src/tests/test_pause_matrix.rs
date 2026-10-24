//! Pause-matrix acceptance tests for Issue #438.
//!
//! This module verifies the explicit pause policy for every state-changing
//! entrypoint that was missing a `require_not_paused` check before the fix.
//!
//! ## Policy rationale
//!
//! | Function | Policy | Reason |
//! |---|---|---|
//! | `update_total_assets` | BLOCKED | Yield/loss must not silently update share pricing during an emergency halt |
//! | `update_agent` | BLOCKED | Agent-rotation proposals must not be accepted while operator is responding to an incident |
//! | `confirm_agent_update` | BLOCKED | Activating a new agent key while paused is unsafe — the operator has not verified the situation |
//! | `emergency_harvest` | ALLOWED | Intentionally bypasses pause; lets the owner compound yield during an agent outage |
//! | `cancel_agent_update` | ALLOWED | Recovery/cancellation operations must remain available to the owner during a pause |

use super::utils::*;
use soroban_sdk::{testutils::{Address as _, Ledger as _}, Address, Env};

// ============================================================================
// BLOCKED while paused
// ============================================================================

/// `update_total_assets` is BLOCKED while paused.
///
/// The agent must not update share pricing while the vault is in an
/// emergency-paused state. Any accrued yield or confirmed loss must be
/// applied only after the owner has reviewed and resolved the pause condition.
#[test]
fn test_update_total_assets_blocked_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, agent, owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 10_000_000_i128);
    // Mint extra directly to vault so solvency check would pass if not paused.
    token_client.mint(&contract_id, &1_000_000_i128);

    client.pause(&owner);
    assert!(client.is_paused());

    let current = client.get_total_assets();
    let new_total = current + 500_000_i128;

    let result = client.try_update_total_assets(&agent, &new_total, &false, &0_u32);
    assert!(
        result.is_err(),
        "update_total_assets must be blocked while paused"
    );

    // Total assets must be unchanged.
    assert_eq!(
        client.get_total_assets(),
        current,
        "total assets must not change when update_total_assets is blocked"
    );
}

/// `update_agent` is BLOCKED while paused.
///
/// Agent-rotation proposals must not be accepted while the vault is paused.
/// The operator must resolve the pause condition before initiating key rotation.
#[test]
fn test_update_agent_blocked_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    client.pause(&owner);
    assert!(client.is_paused());

    let new_agent = Address::generate(&env);
    let result = client.try_update_agent(&new_agent);
    assert!(
        result.is_err(),
        "update_agent must be blocked while paused"
    );

    // No pending agent update should exist.
    assert!(
        client.get_pending_agent_update().is_none(),
        "no pending agent update must be recorded when blocked"
    );
}

/// `confirm_agent_update` is BLOCKED while paused.
///
/// Even if a pending agent update was proposed before the vault was paused,
/// confirming it while paused is unsafe — the operator may not have verified
/// the new agent key during the incident response.
#[test]
fn test_confirm_agent_update_blocked_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Propose agent rotation while vault is UNPAUSED (allowed).
    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);
    assert!(client.get_pending_agent_update().is_some());

    // Advance ledger past the timelock.
    env.ledger().with_mut(|l| {
        l.sequence_number += 17_281;
    });

    // Now pause the vault.
    client.pause(&owner);
    assert!(client.is_paused());

    // Confirm must be blocked.
    let result = client.try_confirm_agent_update();
    assert!(
        result.is_err(),
        "confirm_agent_update must be blocked while paused"
    );

    // The pending proposal must still exist (not consumed by the blocked call).
    assert!(
        client.get_pending_agent_update().is_some(),
        "pending agent update must remain after blocked confirm"
    );

    // After unpausing, the owner can confirm.
    client.unpause(&owner);
    let confirm_result = client.try_confirm_agent_update();
    assert!(
        confirm_result.is_ok(),
        "confirm_agent_update must succeed after unpausing"
    );
}

// ============================================================================
// ALLOWED while paused (recovery operations must remain callable)
// ============================================================================

/// `emergency_harvest` is ALLOWED while paused.
///
/// This is an intentional bypass: the function is explicitly designed to let
/// the owner compound yield during an agent outage, even if the vault is
/// emergency-paused. It should fail for other reasons (no active protocol),
/// not because the vault is paused.
#[test]
fn test_emergency_harvest_allowed_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    client.pause(&owner);
    assert!(client.is_paused());

    // Should fail with UnsupportedProtocol (no active protocol), NOT Paused.
    let result = client.try_emergency_harvest(&0_i128);
    assert!(result.is_err(), "emergency_harvest returns an error");
    // Verify the error is NOT the Paused error.
    if let Err(e) = result {
        use crate::VaultError;
        let err_code = e.unwrap();
        assert_ne!(
            err_code,
            soroban_sdk::Error::from(VaultError::Paused),
            "emergency_harvest must NOT return Paused error"
        );
    }
}

/// `cancel_agent_update` is ALLOWED while paused.
///
/// Cancellation is a recovery operation — the owner must be able to abort a
/// pending agent rotation at any time, including during a pause.
#[test]
fn test_cancel_agent_update_allowed_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Propose while unpaused, then pause.
    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);
    client.pause(&owner);
    assert!(client.is_paused());

    // Cancel must succeed even while paused.
    let result = client.try_cancel_agent_update();
    assert!(
        result.is_ok(),
        "cancel_agent_update must succeed while paused"
    );
    assert!(
        client.get_pending_agent_update().is_none(),
        "pending agent update must be cleared after cancel"
    );
}

/// Deposits are BLOCKED while paused — validates an already-existing policy
/// is unbroken after the Issue #438 changes.
#[test]
fn test_deposit_still_blocked_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let token_client = TestTokenClient::new(&env, &usdc_token);
    token_client.mint(&user, &10_000_000_i128);

    client.pause(&owner);

    let result = client.try_deposit(&user, &1_000_000_i128);
    assert!(result.is_err(), "deposit must be blocked while paused");
}

/// Withdrawals are BLOCKED while paused — validates an already-existing policy
/// is unbroken after the Issue #438 changes.
#[test]
fn test_withdraw_still_blocked_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 5_000_000_i128);

    client.pause(&owner);

    let result = client.try_withdraw(&user, &1_000_000_i128);
    assert!(result.is_err(), "withdraw must be blocked while paused");
}
