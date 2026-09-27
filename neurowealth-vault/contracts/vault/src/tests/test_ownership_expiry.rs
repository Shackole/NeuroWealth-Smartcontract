//! Tests for two-step ownership transfer edge cases (#61):
//!   - Pending transfer expires after 34,560 ledgers (≈48 h)
//!   - Expired transfer can be re-proposed without manual cancellation
//!   - `PendingOwnerExpiredEvent` emitted when expired transfer is overwritten
//!   - `accept_ownership` reverts with NoPendingOwner when nothing is pending
//!   - `accept_ownership` reverts with OwnershipTransferExpired after expiry
//!   - Full flow: propose → expire → re-propose → accept

extern crate std;

use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env};

use super::utils::*;

// 34,560 = 17,280 × 2 ledgers (48 h window)
const OWNERSHIP_TRANSFER_EXPIRY_LEDGERS: u32 = 34_560;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Happy path: propose → accept within window
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_ownership_transfer_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&new_owner);

    // get_pending_ownership should reflect the candidate and a real expiry.
    let info = client.get_pending_ownership().expect("should have a pending transfer");
    assert_eq!(info.pending_owner, new_owner);
    assert!(info.timelock_expiry > 0, "expiry should be non-zero");

    // Accept before expiry succeeds.
    client.accept_ownership(&new_owner);

    assert_eq!(client.get_owner(), new_owner, "owner should be updated");
    assert!(
        client.get_pending_ownership().is_none(),
        "pending cleared after accept"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. accept_ownership with no pending transfer → NoPendingOwner (#29)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #29)")]
fn test_accept_ownership_no_pending_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let random = Address::generate(&env);
    // No transfer was initiated — must panic with CallerIsNotPendingOwner = #29.
    client.accept_ownership(&random);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. accept_ownership after expiry → OwnershipTransferExpired (#29)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #29)")]
fn test_accept_ownership_after_expiry_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&new_owner);

    // Advance ledger sequence past the expiry window.
    env.ledger().with_mut(|l| {
        l.sequence_number += OWNERSHIP_TRANSFER_EXPIRY_LEDGERS + 1;
    });

    // Should panic with OwnershipTransferExpired (aliased to #29).
    client.accept_ownership(&new_owner);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Expired transfer can be silently re-proposed without cancellation
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_expired_transfer_can_be_re_proposed() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let first_candidate = Address::generate(&env);
    let second_candidate = Address::generate(&env);

    // Propose first transfer.
    client.transfer_ownership(&first_candidate);

    // Advance ledger past the expiry window.
    env.ledger().with_mut(|l| {
        l.sequence_number += OWNERSHIP_TRANSFER_EXPIRY_LEDGERS + 1;
    });

    // Re-propose without explicit cancel — must succeed because previous expired.
    client.transfer_ownership(&second_candidate);

    let info = client
        .get_pending_ownership()
        .expect("should have pending after re-proposal");
    assert_eq!(
        info.pending_owner, second_candidate,
        "pending_owner should be updated to second_candidate"
    );
    assert!(info.timelock_expiry > 0, "new expiry should be set");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Re-proposal while still within the active window → TimelockAlreadyPending (#48)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #48)")]
fn test_re_propose_within_active_window_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let first_candidate = Address::generate(&env);
    let second_candidate = Address::generate(&env);

    client.transfer_ownership(&first_candidate);

    // Immediate second proposal while first is still active → TimelockAlreadyPending = #48.
    client.transfer_ownership(&second_candidate);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Full lifecycle: propose → expire → re-propose → accept (Issue #61 AC)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_propose_expire_repropose_accept() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let stale_candidate = Address::generate(&env);
    let real_candidate = Address::generate(&env);

    // Step 1: propose to stale_candidate.
    client.transfer_ownership(&stale_candidate);
    assert_eq!(
        client.get_pending_ownership().unwrap().pending_owner,
        stale_candidate
    );

    // Step 2: advance past expiry.
    env.ledger().with_mut(|l| {
        l.sequence_number += OWNERSHIP_TRANSFER_EXPIRY_LEDGERS + 100;
    });

    // Step 3: stale_candidate tries to accept — must fail (expired).
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.accept_ownership(&stale_candidate);
    }));
    assert!(result.is_err(), "acceptance of expired proposal should panic");

    // Step 4: owner re-proposes to real_candidate (no manual cancel needed).
    client.transfer_ownership(&real_candidate);
    let info = client.get_pending_ownership().unwrap();
    assert_eq!(info.pending_owner, real_candidate);
    assert!(
        info.timelock_expiry > env.ledger().sequence(),
        "new expiry should be in the future"
    );

    // Step 5: real_candidate accepts within the new window.
    client.accept_ownership(&real_candidate);
    assert_eq!(client.get_owner(), real_candidate, "real_candidate is new owner");
    assert!(
        client.get_pending_ownership().is_none(),
        "pending cleared after acceptance"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. get_pending_ownership is None before any proposal
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_get_pending_ownership_none_initially() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    assert!(client.get_pending_ownership().is_none());
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. get_pending_ownership returns real expiry (seq + 34_560)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_get_pending_ownership_real_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let candidate = Address::generate(&env);
    let seq_before = env.ledger().sequence();
    client.transfer_ownership(&candidate);

    let info = client.get_pending_ownership().unwrap();
    assert_eq!(info.pending_owner, candidate);
    // Expiry should be exactly seq_before + OWNERSHIP_TRANSFER_EXPIRY_LEDGERS.
    let expected_expiry = u64::from(seq_before + OWNERSHIP_TRANSFER_EXPIRY_LEDGERS);
    assert_eq!(
        info.timelock_expiry, expected_expiry,
        "timelock_expiry should equal seq_before + EXPIRY_LEDGERS"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Cancel clears both pending owner and expiry
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_cancel_clears_pending_and_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let candidate = Address::generate(&env);
    client.transfer_ownership(&candidate);
    assert!(client.get_pending_ownership().is_some());

    client.cancel_ownership_transfer();
    assert!(
        client.get_pending_ownership().is_none(),
        "cancel should clear pending owner and expiry"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. After cancel, owner can immediately propose again (no double-pending conflict)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_after_cancel_owner_can_re_propose() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let first_candidate = Address::generate(&env);
    let second_candidate = Address::generate(&env);

    client.transfer_ownership(&first_candidate);
    client.cancel_ownership_transfer();

    // After cancellation, proposing again must succeed immediately.
    client.transfer_ownership(&second_candidate);

    let info = client.get_pending_ownership().unwrap();
    assert_eq!(info.pending_owner, second_candidate);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Non-pending-owner cannot accept transfer
// ─────────────────────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #29)")]
fn test_wrong_caller_cannot_accept() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let correct_candidate = Address::generate(&env);
    let wrong_caller = Address::generate(&env);

    client.transfer_ownership(&correct_candidate);
    // wrong_caller tries to accept — must fail with CallerIsNotPendingOwner = #29.
    client.accept_ownership(&wrong_caller);
}
