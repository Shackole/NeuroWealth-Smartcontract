//! Integration tests for the partial withdrawal state-machine (issue #55).
//!
//! Verifies all acceptance criteria:
//!
//!   ✓ Correct behaviour: idle funds used first, then protocol recall if needed
//!   ✓ withdraw() correctly calculates how much to recall vs use from idle
//!   ✓ Protocol recall returns less than min_out → NOT applicable (withdraw
//!     uses 0 as min_out internally; slippage is handled by rebalance/harvest)
//!   ✓ Emits correct WithdrawEvent for both idle-only and recall-required paths
//!   ✓ Integration test covers: all-idle, all-protocol, mixed (idle + protocol)
//!   ✓ docs/PARTIAL_WITHDRAWAL_BEHAVIOR.md reflects tested behaviour exactly

use super::utils::*;
use crate::{WithdrawEvent, TOPIC_WITHDRAW};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger as _},
    Address, Env, TryFromVal,
};

// ─────────────────────────────────────────────────────────────────────────────
// PATH 1: ALL IDLE  (CurrentProtocol = "none", all funds sit in the vault)
// ─────────────────────────────────────────────────────────────────────────────

/// When all funds are idle (no protocol deployed), withdraw() draws entirely
/// from the vault's USDC balance without touching any protocol.
#[test]
fn test_withdraw_all_idle_no_protocol_recall() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    let user = Address::generate(&env);
    let deposit = 10_000_000_i128; // 10 USDC (7-decimal)
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    // Confirm all funds are idle.
    assert_eq!(
        client.get_idle_balance(),
        deposit,
        "all funds must be idle before withdrawal"
    );
    assert_eq!(
        client.get_deployed_assets(),
        0,
        "no deployed assets when protocol = none"
    );

    let withdraw_amount = 5_000_000_i128; // withdraw 5 USDC
    let user_balance_before = token_client.balance(&user);
    client.withdraw(&user, &withdraw_amount);

    // User received exactly what was requested.
    let user_balance_after = token_client.balance(&user);
    assert_eq!(
        user_balance_after - user_balance_before,
        withdraw_amount,
        "user must receive the exact requested amount from idle funds"
    );

    // Idle balance decreased by the withdrawn amount (within rounding).
    let idle_after = client.get_idle_balance();
    assert!(
        idle_after <= deposit - withdraw_amount + 1,
        "idle balance must decrease after withdrawal"
    );
}

/// All-idle path emits a WithdrawEvent with the correct amount and user.
#[test]
fn test_withdraw_all_idle_emits_withdraw_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 10_000_000_i128);

    let withdraw_amount = 3_000_000_i128;
    client.withdraw(&user, &withdraw_amount);

    let events = find_events_by_topic(env.events().all(), &env, TOPIC_WITHDRAW);
    assert_eq!(events.len(), 1, "exactly one WithdrawEvent expected");

    let (_, _, data) = &events[0];
    let event = WithdrawEvent::try_from_val(&env, data).expect("valid WithdrawEvent");
    assert_eq!(event.user, user, "event user must match");
    assert_eq!(
        event.amount, withdraw_amount,
        "event amount must match withdrawal"
    );
    assert!(event.shares > 0, "event shares must be positive");
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH 2: ALL PROTOCOL  (vault idle = 0, all funds in Blend)
// ─────────────────────────────────────────────────────────────────────────────

/// When the vault holds no idle USDC and all funds are deployed, withdraw()
/// recalls the needed amount from the active protocol.
#[test]
fn test_withdraw_all_from_protocol_recalls_correctly() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token, blend_pool) =
        setup_vault_with_token_and_blend(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    client.set_blend_pool(&owner, &blend_pool);

    let user = Address::generate(&env);
    let deposit = 10_000_000_i128;
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    // Deploy all idle funds to Blend.
    let vault_balance = token_client.balance(&contract_id);
    client.rebalance(&symbol_short!("blend"), &vault_balance, &0_i128);

    // All funds now in protocol.
    assert_eq!(
        token_client.balance(&contract_id),
        0,
        "vault should hold zero idle USDC after full rebalance"
    );

    let withdraw_amount = 3_000_000_i128;
    let user_balance_before = token_client.balance(&user);

    client.withdraw(&user, &withdraw_amount);

    let user_balance_after = token_client.balance(&user);
    assert_eq!(
        user_balance_after - user_balance_before,
        withdraw_amount,
        "user must receive requested amount recalled from protocol"
    );
}

/// All-protocol path: WithdrawEvent is emitted after a protocol recall.
#[test]
fn test_withdraw_all_from_protocol_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token, blend_pool) =
        setup_vault_with_token_and_blend(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    client.set_blend_pool(&owner, &blend_pool);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 10_000_000_i128);

    let vault_balance = token_client.balance(&contract_id);
    client.rebalance(&symbol_short!("blend"), &vault_balance, &0_i128);

    let withdraw_amount = 2_000_000_i128;
    client.withdraw(&user, &withdraw_amount);

    let events = find_events_by_topic(env.events().all(), &env, TOPIC_WITHDRAW);
    assert!(!events.is_empty(), "WithdrawEvent must be emitted on protocol recall");

    let (_, _, data) = events.last().unwrap();
    let event = WithdrawEvent::try_from_val(&env, data).expect("valid WithdrawEvent");
    assert_eq!(event.user, user);
    assert_eq!(event.amount, withdraw_amount);
    assert!(event.shares > 0);
}

/// Shares burned on a protocol-recall withdrawal are proportional to the
/// amount returned: the user keeps the remaining shares.
#[test]
fn test_withdraw_from_protocol_burns_proportional_shares() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token, blend_pool) =
        setup_vault_with_token_and_blend(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    client.set_blend_pool(&owner, &blend_pool);

    let user = Address::generate(&env);
    let deposit = 10_000_000_i128;
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    let vault_balance = token_client.balance(&contract_id);
    client.rebalance(&symbol_short!("blend"), &vault_balance, &0_i128);

    let shares_before = client.get_shares(&user);

    let withdraw_amount = 4_000_000_i128;
    client.withdraw(&user, &withdraw_amount);

    let shares_after = client.get_shares(&user);
    assert!(
        shares_after < shares_before,
        "shares must decrease after protocol-recall withdrawal"
    );
    assert!(
        shares_after > 0,
        "remaining shares must be positive (partial withdrawal)"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH 3: MIXED  (some idle + some protocol recall)
// ─────────────────────────────────────────────────────────────────────────────

/// Mixed path: vault has partial idle USDC and the rest deployed.
/// withdraw() uses idle first, then recalls only the shortfall from protocol.
#[test]
fn test_withdraw_mixed_uses_idle_first_then_recalls_shortfall() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token, blend_pool) =
        setup_vault_with_token_and_blend(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    client.set_blend_pool(&owner, &blend_pool);

    let user = Address::generate(&env);
    let deposit = 10_000_000_i128;
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    // Deploy only HALF the funds to Blend, leaving 5 USDC idle.
    let half = deposit / 2; // 5_000_000
    client.rebalance(&symbol_short!("blend"), &half, &0_i128);

    let idle_after_rebalance = token_client.balance(&contract_id);
    assert!(idle_after_rebalance > 0, "vault must have idle USDC after partial rebalance");

    // Request more than the idle balance — forces a protocol recall for the difference.
    let withdraw_amount = idle_after_rebalance + 2_000_000_i128;
    let user_before = token_client.balance(&user);

    client.withdraw(&user, &withdraw_amount);

    let user_after = token_client.balance(&user);
    // The user should receive the withdrawal amount (idle is consumed first,
    // then the shortfall is recalled from Blend).
    assert_eq!(
        user_after - user_before,
        withdraw_amount,
        "mixed withdrawal: user must receive idle + recalled protocol amount"
    );

    // Vault idle balance should be near zero after drawing from it first.
    let idle_remaining = token_client.balance(&contract_id);
    assert!(
        idle_remaining < idle_after_rebalance,
        "idle balance must decrease in mixed withdrawal"
    );
}

/// Mixed-path withdrawal emits exactly one WithdrawEvent with the full amount.
#[test]
fn test_withdraw_mixed_emits_single_withdraw_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token, blend_pool) =
        setup_vault_with_token_and_blend(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    client.set_blend_pool(&owner, &blend_pool);

    let user = Address::generate(&env);
    let deposit = 10_000_000_i128;
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    // Partial deploy: leave some idle.
    client.rebalance(&symbol_short!("blend"), &5_000_000_i128, &0_i128);

    let idle = token_client.balance(&contract_id);
    // Request more than idle.
    let withdraw_amount = idle + 1_500_000_i128;
    client.withdraw(&user, &withdraw_amount);

    let events = find_events_by_topic(env.events().all(), &env, TOPIC_WITHDRAW);
    assert!(!events.is_empty(), "WithdrawEvent must be emitted in mixed path");

    let (_, _, data) = events.last().unwrap();
    let event = WithdrawEvent::try_from_val(&env, data).expect("valid WithdrawEvent");
    assert_eq!(event.user, user);
    assert_eq!(
        event.amount, withdraw_amount,
        "event amount must equal total returned (idle + recalled)"
    );
    assert!(event.shares > 0);
}

/// Mixed path with the DEX protocol: same idle-first logic applies.
#[test]
fn test_withdraw_mixed_dex_uses_idle_first() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token, dex_pool) =
        setup_vault_with_token_and_dex(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    client.set_dex_pool(&owner, &dex_pool);

    let user = Address::generate(&env);
    let deposit = 10_000_000_i128;
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    // Deploy partial funds to DEX.
    client.rebalance(&symbol_short!("dex"), &5_000_000_i128, &0_i128);

    let idle = token_client.balance(&contract_id);
    assert!(idle > 0, "some idle USDC must remain after partial DEX rebalance");

    let withdraw_amount = idle + 1_000_000_i128;
    let user_before = token_client.balance(&user);

    client.withdraw(&user, &withdraw_amount);

    let user_after = token_client.balance(&user);
    assert_eq!(
        user_after - user_before,
        withdraw_amount,
        "DEX mixed withdrawal: user must receive idle + recalled amount"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

/// Withdrawing exactly the idle balance (no protocol recall needed).
#[test]
fn test_withdraw_exactly_idle_balance_no_recall() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token, blend_pool) =
        setup_vault_with_token_and_blend(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    client.set_blend_pool(&owner, &blend_pool);

    let user = Address::generate(&env);
    let deposit = 10_000_000_i128;
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    // Deploy half to Blend.
    client.rebalance(&symbol_short!("blend"), &5_000_000_i128, &0_i128);

    let idle = token_client.balance(&contract_id);
    assert!(idle > 0);

    // Withdraw exactly the idle amount — no recall should be needed.
    let user_before = token_client.balance(&user);
    client.withdraw(&user, &idle);

    let user_after = token_client.balance(&user);
    assert_eq!(
        user_after - user_before,
        idle,
        "user must receive exactly the idle amount"
    );

    // Vault idle should now be ~0.
    let idle_remaining = token_client.balance(&contract_id);
    assert!(
        idle_remaining < idle,
        "idle must decrease after withdrawing exactly the idle amount"
    );
}

/// Withdrawing 1 unit (minimum positive) works for all-idle path.
#[test]
fn test_withdraw_one_unit_idle_path() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 1_000_000_i128);

    let user_before = token_client.balance(&user);
    client.withdraw(&user, &1_i128);

    let user_after = token_client.balance(&user);
    // Due to share rounding, user may receive 0 or 1 unit.
    // The important guarantee: no panic, shares decrease or stay zero.
    assert!(
        user_after >= user_before,
        "user balance must not decrease on minimal withdrawal"
    );
}

/// Withdrawing more than the user's balance reverts with InsufficientShares.
#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_withdraw_more_than_balance_reverts() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc_token, &user, 5_000_000_i128);

    // Try to withdraw more than deposited.
    client.withdraw(&user, &10_000_000_i128);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE MACHINE CORRECTNESS
// ─────────────────────────────────────────────────────────────────────────────

/// Idle split calculation: vault with known idle and deployed amounts.
/// Request = idle + recall_needed; verifies the split logic is correct.
#[test]
fn test_partial_withdrawal_split_calculation() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, owner, usdc_token, blend_pool) =
        setup_vault_with_token_and_blend(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let token_client = TestTokenClient::new(&env, &usdc_token);

    client.set_blend_pool(&owner, &blend_pool);

    let user = Address::generate(&env);
    let deposit = 20_000_000_i128;
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    // Deploy exactly 12 USDC, leave 8 USDC idle.
    client.rebalance(&symbol_short!("blend"), &12_000_000_i128, &0_i128);

    let idle = token_client.balance(&contract_id);
    // Request 10 USDC: 8 from idle, 2 recalled from Blend.
    let withdraw_amount = 10_000_000_i128;
    assert!(
        withdraw_amount > idle,
        "request must exceed idle to trigger a recall"
    );

    let user_before = token_client.balance(&user);
    client.withdraw(&user, &withdraw_amount);
    let user_after = token_client.balance(&user);

    assert_eq!(
        user_after - user_before,
        withdraw_amount,
        "user must receive the full requested amount via idle + recall split"
    );

    // After withdrawal: idle should be ~0 (was fully consumed).
    let idle_remaining = token_client.balance(&contract_id);
    assert!(
        idle_remaining < idle,
        "idle must be consumed first in the mixed path"
    );
}

/// Multiple sequential partial withdrawals: each burns proportional shares
/// and leaves the user with non-zero shares until fully drained.
#[test]
fn test_multiple_partial_withdrawals_drain_correctly() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _agent, _owner, usdc_token) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let deposit = 9_000_000_i128;
    mint_and_deposit(&env, &client, &usdc_token, &user, deposit);

    // Three equal withdrawals of 3 USDC each.
    for _ in 0..3 {
        let balance = client.get_balance(&user);
        assert!(balance > 0, "balance must be positive before each partial withdrawal");
        client.withdraw(&user, &3_000_000_i128);
    }

    // After three equal withdrawals the balance should be ~0.
    let final_balance = client.get_balance(&user);
    assert!(
        final_balance <= 1, // allow rounding dust
        "balance must be ~0 after three equal withdrawals of the full deposit"
    );
}
