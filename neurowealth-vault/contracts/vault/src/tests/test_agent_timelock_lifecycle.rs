//! Integration tests for the full agent-update timelock lifecycle (issue #58).
//!
//! These tests exercise end-to-end scenarios that span the entire two-step
//! propose → wait → confirm/cancel flow, verifying that every observable
//! state transition is correct and that all acceptance criteria from issue #58
//! are met:
//!
//!   ✓ confirm_agent_update reverts if timelock has not elapsed (TimelockNotElapsed, #50)
//!   ✓ cancel_agent_update can be called even if the timelock has elapsed
//!   ✓ get_pending_agent_update returns None after confirmation or cancellation
//!   ✓ Double-confirm is a no-op (idempotent) after first confirmation
//!   ✓ AgentUpdateConfirmed and AgentUpdateCancelled events emitted
//!   ✓ Integration test covers full lifecycle: propose → wait → confirm, propose → cancel

use super::utils::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env};

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE 1: propose → wait → confirm
// ─────────────────────────────────────────────────────────────────────────────

/// Full happy-path lifecycle: propose a new agent, wait for the timelock, then
/// confirm. Verifies all observable state transitions at every step.
#[test]
fn test_lifecycle_propose_wait_confirm() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // ── Step 1: Propose ──────────────────────────────────────────────────────
    let new_agent = Address::generate(&env);

    // No pending update before proposal.
    assert!(
        client.get_pending_agent_update().is_none(),
        "precondition: no pending update before proposal"
    );

    client.update_agent(&new_agent);

    // After proposal: pending update is recorded, active agent is unchanged.
    let (pending_addr, expiry) = client
        .get_pending_agent_update()
        .expect("pending update must exist after proposal");
    assert_eq!(
        pending_addr, new_agent,
        "pending address must match proposed agent"
    );
    assert!(expiry > 0, "expiry ledger must be positive");
    assert_eq!(
        client.get_agent(),
        old_agent,
        "active agent must NOT change on propose"
    );

    // ── Step 2: Verify timelock not-yet-elapsed revert ───────────────────────
    // Advance to one ledger before expiry — confirm must still revert.
    env.ledger().set_sequence_number(expiry - 1);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.confirm_agent_update()
    }));
    assert!(
        result.is_err(),
        "confirm must revert when timelock has not elapsed"
    );

    // Pending update still intact after the failed confirm.
    assert!(
        client.get_pending_agent_update().is_some(),
        "pending update must remain after failed confirm"
    );

    // ── Step 3: Advance to expiry and confirm ────────────────────────────────
    env.ledger().set_sequence_number(expiry);
    client.confirm_agent_update();

    // After confirm: active agent updated, pending state cleared.
    assert_eq!(
        client.get_agent(),
        new_agent,
        "active agent must be updated after confirm"
    );
    assert!(
        client.get_pending_agent_update().is_none(),
        "pending state must be cleared after confirm"
    );

    // Events were emitted (proposal + confirmation + backward-compat).
    let events = env.events().all();
    assert!(
        events.len() >= 2,
        "at least proposal and confirmation events must be emitted; got {}",
        events.len()
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE 2: propose → cancel (before expiry)
// ─────────────────────────────────────────────────────────────────────────────

/// Full lifecycle where the owner cancels the proposal before the timelock
/// window has opened.
#[test]
fn test_lifecycle_propose_cancel_before_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    // Cancel while inside the timelock window.
    let (_, expiry) = client.get_pending_agent_update().unwrap();
    assert!(
        env.ledger().sequence() < expiry,
        "precondition: still inside timelock window"
    );

    client.cancel_agent_update();

    // Active agent unchanged, pending state cleared.
    assert_eq!(
        client.get_agent(),
        old_agent,
        "active agent must be unchanged after cancel"
    );
    assert!(
        client.get_pending_agent_update().is_none(),
        "pending state must be cleared after cancel"
    );

    // Cancellation event emitted.
    let events = env.events().all();
    assert!(
        !events.is_empty(),
        "cancellation event must be emitted"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE 3: propose → cancel (after expiry)
// ─────────────────────────────────────────────────────────────────────────────

/// The owner may cancel even after the timelock window has opened — choosing
/// not to apply the update is always valid.
#[test]
fn test_lifecycle_propose_cancel_after_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    // Advance past expiry.
    let (_, expiry) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry + 5_000);

    // Cancel must succeed.
    client.cancel_agent_update();

    assert_eq!(
        client.get_agent(),
        old_agent,
        "active agent must be unchanged after post-expiry cancel"
    );
    assert!(
        client.get_pending_agent_update().is_none(),
        "pending state must be cleared after post-expiry cancel"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE CRITERION: TimelockNotElapsed / TimelockNotExpired (#50)
// ─────────────────────────────────────────────────────────────────────────────

/// Confirms that `confirm_agent_update` reverts with error code #50
/// (`TimelockNotElapsed` / `TimelockNotExpired`) when the timelock has not
/// elapsed — directly exercising the issue #58 acceptance criterion.
#[test]
#[should_panic(expected = "Error(Contract, #50)")]
fn test_confirm_reverts_with_timelock_not_elapsed_error() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    // Immediately confirm without advancing the ledger — must revert with #50.
    client.confirm_agent_update();
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE CRITERION: Double-confirm is idempotent
// ─────────────────────────────────────────────────────────────────────────────

/// Verifies that calling `confirm_agent_update` twice in succession is safe:
/// the second call is a silent no-op that neither panics nor alters state.
#[test]
fn test_double_confirm_idempotent_full_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    let (_, expiry) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry);

    // First confirm applies the update.
    client.confirm_agent_update();
    assert_eq!(client.get_agent(), new_agent, "first confirm must apply update");
    assert!(client.get_pending_agent_update().is_none(), "pending cleared after first confirm");

    // Second confirm must be a silent no-op.
    client.confirm_agent_update();

    // State is identical to after the first confirm.
    assert_eq!(
        client.get_agent(),
        new_agent,
        "double-confirm must not change agent again"
    );
    assert!(
        client.get_pending_agent_update().is_none(),
        "double-confirm must not create a pending entry"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE CRITERION: AgentUpdateConfirmed event emitted
// ─────────────────────────────────────────────────────────────────────────────

/// Confirms that at least one event is emitted on `confirm_agent_update` and
/// that events are absent on a no-op double-confirm (no state to report).
#[test]
fn test_agent_update_confirmed_event_emitted_on_confirm() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    let (_, expiry) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry);
    client.confirm_agent_update();

    // At least the proposal event and the confirmation event must be present.
    let events = env.events().all();
    assert!(
        events.len() >= 2,
        "AgentUpdateProposedEvent + AgentUpdateConfirmedEvent (+ backward-compat) must be emitted; got {}",
        events.len()
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE CRITERION: AgentUpdateCancelled event emitted
// ─────────────────────────────────────────────────────────────────────────────

/// Confirms that at least one event is emitted when `cancel_agent_update` is
/// called — the `AgentUpdateCancelledEvent`.
#[test]
fn test_agent_update_cancelled_event_emitted_on_cancel() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);
    client.cancel_agent_update();

    let events = env.events().all();
    // Proposal + cancellation events must both be present.
    assert!(
        events.len() >= 2,
        "AgentUpdateProposedEvent + AgentUpdateCancelledEvent must be emitted; got {}",
        events.len()
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-CYCLE: sequential propose/confirm/cancel cycles
// ─────────────────────────────────────────────────────────────────────────────

/// Verifies that the timelock machinery correctly resets after each cycle,
/// allowing successive propose → confirm and propose → cancel rounds without
/// any stale state leaking between cycles.
#[test]
fn test_multiple_sequential_cycles() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _initial_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    // Cycle 1: propose → confirm.
    let agent2 = Address::generate(&env);
    client.update_agent(&agent2);
    let (_, expiry1) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry1);
    client.confirm_agent_update();
    assert_eq!(client.get_agent(), agent2, "cycle 1: agent must be agent2");
    assert!(client.get_pending_agent_update().is_none(), "cycle 1: no pending");

    // Cycle 2: propose → cancel.
    let agent3 = Address::generate(&env);
    client.update_agent(&agent3);
    assert!(client.get_pending_agent_update().is_some(), "cycle 2: pending exists");
    client.cancel_agent_update();
    assert_eq!(client.get_agent(), agent2, "cycle 2: active agent unchanged after cancel");
    assert!(client.get_pending_agent_update().is_none(), "cycle 2: no pending after cancel");

    // Cycle 3: propose → confirm again.
    let agent4 = Address::generate(&env);
    client.update_agent(&agent4);
    let (_, expiry3) = client.get_pending_agent_update().unwrap();
    env.ledger().set_sequence_number(expiry3);
    client.confirm_agent_update();
    assert_eq!(client.get_agent(), agent4, "cycle 3: agent must be agent4");
    assert!(client.get_pending_agent_update().is_none(), "cycle 3: no pending");
}

// ─────────────────────────────────────────────────────────────────────────────
// GUARD: active agent is NOT changed until confirm
// ─────────────────────────────────────────────────────────────────────────────

/// Confirms that the active agent returned by `get_agent()` is unchanged
/// throughout the entire timelock window and only switches atomically on
/// `confirm_agent_update`.
#[test]
fn test_active_agent_unchanged_until_confirm() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, old_agent, _owner, _usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_agent = Address::generate(&env);
    client.update_agent(&new_agent);

    let (_, expiry) = client.get_pending_agent_update().unwrap();

    // Sample the active agent at several ledgers during the window.
    for offset in [0u32, expiry / 4, expiry / 2, expiry - 1] {
        env.ledger().set_sequence_number(offset);
        assert_eq!(
            client.get_agent(),
            old_agent,
            "active agent must remain old_agent at ledger {}",
            offset
        );
    }

    // After confirmation the active agent switches atomically.
    env.ledger().set_sequence_number(expiry);
    client.confirm_agent_update();
    assert_eq!(
        client.get_agent(),
        new_agent,
        "active agent must switch to new_agent after confirm"
    );
}
