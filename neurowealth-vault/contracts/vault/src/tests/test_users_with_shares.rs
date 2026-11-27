//! Tests for `get_users_with_shares` indexer pagination (Issue #440).
//!
//! The vault keeps an append-only index of addresses that have ever held
//! non-zero shares. `get_users_with_shares(start, limit)` pages over that index
//! and filters out slots whose current share balance is zero (fully-withdrawn
//! holders that were never pruned). See the function's doc comment for the
//! stale-entry trade-off.

extern crate std;

use super::utils::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_empty_index_returns_empty() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, _usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    assert_eq!(client.get_users_with_shares(&0, &10).len(), 0);
}

#[test]
fn test_lists_all_holders_with_shares() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc, &u1, 5_000_000);
    mint_and_deposit(&env, &client, &usdc, &u2, 3_000_000);
    mint_and_deposit(&env, &client, &usdc, &u3, 7_000_000);

    let all = client.get_users_with_shares(&0, &10);
    assert_eq!(all.len(), 3, "all three holders should be listed");
    // First deposits are 1:1, so shares equal the deposited amounts, and the
    // index preserves deposit order.
    assert_eq!(all.get(0).unwrap(), (u1, 5_000_000));
    assert_eq!(all.get(1).unwrap(), (u2, 3_000_000));
    assert_eq!(all.get(2).unwrap(), (u3, 7_000_000));
}

#[test]
fn test_pagination_start_and_limit() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc, &u1, 5_000_000);
    mint_and_deposit(&env, &client, &usdc, &u2, 3_000_000);
    mint_and_deposit(&env, &client, &usdc, &u3, 7_000_000);

    // Page of 2 from the start.
    let page0 = client.get_users_with_shares(&0, &2);
    assert_eq!(page0.len(), 2);
    assert_eq!(page0.get(0).unwrap(), (u1, 5_000_000));
    assert_eq!(page0.get(1).unwrap(), (u2, 3_000_000));

    // Second page picks up where the first left off.
    let page1 = client.get_users_with_shares(&2, &2);
    assert_eq!(page1.len(), 1);
    assert_eq!(page1.get(0).unwrap(), (u3, 7_000_000));

    // Beyond the end returns empty.
    assert_eq!(client.get_users_with_shares(&4, &2).len(), 0);

    // limit == 0 returns empty.
    assert_eq!(client.get_users_with_shares(&0, &0).len(), 0);
}

#[test]
fn test_zero_share_holders_are_filtered_out() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc, &u1, 5_000_000);
    mint_and_deposit(&env, &client, &usdc, &u2, 3_000_000);
    mint_and_deposit(&env, &client, &usdc, &u3, 7_000_000);

    // u2 fully withdraws: shares -> 0, but the index slot stays.
    client.withdraw_all(&u2);
    assert_eq!(client.get_shares(&u2), 0);

    // The full listing omits the zero-share holder.
    let all = client.get_users_with_shares(&0, &10);
    assert_eq!(all.len(), 2, "fully-withdrawn holder must be filtered out");
    assert_eq!(all.get(0).unwrap(), (u1.clone(), 5_000_000));
    assert_eq!(all.get(1).unwrap(), (u3.clone(), 7_000_000));

    // The stale slot still occupies index position 1, so a page over just that
    // slot returns empty even though other holders exist (documented behaviour).
    assert_eq!(client.get_users_with_shares(&1, &1).len(), 0);
}

#[test]
fn test_redeposit_does_not_duplicate_index_entry() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _agent, _owner, usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    mint_and_deposit(&env, &client, &usdc, &u1, 5_000_000);
    mint_and_deposit(&env, &client, &usdc, &u2, 3_000_000);

    let token = soroban_sdk::token::Client::new(&env, &usdc);
    assert_eq!(client.get_shares(&u2), 3_000_000);
    assert_eq!(client.get_balance(&u2), 3_000_000);
    assert_eq!(client.get_total_shares(), 8_000_000);
    assert_eq!(client.get_total_assets(), 8_000_000);
    assert_eq!(token.balance(&u2), 0);

    assert_eq!(client.withdraw_all(&u2), 3_000_000);
    assert_eq!(client.get_shares(&u2), 0);
    assert_eq!(client.get_balance(&u2), 0);
    assert_eq!(client.get_total_shares(), 5_000_000);
    assert_eq!(client.get_total_assets(), 5_000_000);
    assert_eq!(token.balance(&u2), 3_000_000);
    let remaining = client.get_users_with_shares(&0, &10);
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining.get(0).unwrap(), (u1.clone(), 5_000_000));

    client.deposit(&u2, &2_000_000);
    assert_eq!(client.get_shares(&u2), 2_000_000);
    assert_eq!(client.get_balance(&u2), 2_000_000);
    assert_eq!(client.get_total_shares(), 7_000_000);
    assert_eq!(client.get_total_assets(), 7_000_000);
    assert_eq!(token.balance(&u2), 1_000_000);

    let all = client.get_users_with_shares(&0, &10);
    assert_eq!(all.len(), 2, "re-deposit must not create a duplicate entry");
    assert_eq!(all.get(0).unwrap(), (u1, 5_000_000));
    assert_eq!(all.get(1).unwrap(), (u2, 2_000_000));

    // Only two index slots exist: a page starting at slot 2 is empty.
    assert_eq!(client.get_users_with_shares(&2, &10).len(), 0);
}

/// At four slots per page with four active holders:
///
/// | Inactive:active | Index slots scanned | Pages | Active results | Slots per result |
/// |---|---:|---:|---:|---:|
/// | 0:1 | 4 | 1 | 4 | 1 |
/// | 1:1 | 8 | 2 | 4 | 2 |
/// | 3:1 | 16 | 4 | 4 | 4 |
///
/// Each scanned slot incurs a persistent share lookup. Soroban host CPU and
/// memory per page are printed when test output is shown (`--nocapture`).
#[test]
fn test_enumeration_scan_cost_across_inactive_ratios() {
    use std::vec::Vec;

    const ACTIVE_USERS: u32 = 4;
    const PAGE_LIMIT: u32 = 4;
    const DEPOSIT: i128 = 10_000_000;

    for inactive_per_active in [0, 1, 3] {
        let env = Env::default();
        env.mock_all_auths();
        env.budget().reset_unlimited();
        let (contract_id, _agent, _owner, usdc) = setup_vault_with_token(&env);
        let client = NeuroWealthVaultClient::new(&env, &contract_id);

        let mut expected = Vec::new();
        for _ in 0..ACTIVE_USERS {
            let holder = Address::generate(&env);
            mint_and_deposit(&env, &client, &usdc, &holder, DEPOSIT);
            expected.push(Some((holder, DEPOSIT)));

            for _ in 0..inactive_per_active {
                let exited = Address::generate(&env);
                mint_and_deposit(&env, &client, &usdc, &exited, DEPOSIT);
                assert_eq!(client.withdraw_all(&exited), DEPOSIT);
                assert_eq!(client.get_shares(&exited), 0);
                expected.push(None);
            }
        }

        let index_slots = ACTIVE_USERS * (1 + inactive_per_active);
        let mut returned = 0;
        let mut total_cpu = 0;
        let mut total_memory = 0;
        for start in (0..index_slots).step_by(PAGE_LIMIT as usize) {
            env.budget().reset_unlimited();
            let page = client.get_users_with_shares(&start, &PAGE_LIMIT);
            let cpu = env.budget().cpu_instruction_cost();
            let memory = env.budget().memory_bytes_cost();
            let end = start + PAGE_LIMIT;
            let expected_page: Vec<_> = expected[start as usize..end as usize]
                .iter()
                .flatten()
                .cloned()
                .collect();
            assert!(page.iter().eq(expected_page));
            returned += page.len();
            total_cpu += cpu;
            total_memory += memory;
            std::println!(
                "inactive:active={inactive_per_active}:1 start={start} scanned={PAGE_LIMIT} returned={} cpu={cpu} memory={memory}",
                page.len()
            );
        }
        assert_eq!(returned, ACTIVE_USERS);
        assert!(client.get_users_with_shares(&index_slots, &PAGE_LIMIT).is_empty());
        std::println!(
            "inactive:active={inactive_per_active}:1 scanned={index_slots} returned={returned} total_cpu={total_cpu} total_memory={total_memory}"
        );
    }
}
