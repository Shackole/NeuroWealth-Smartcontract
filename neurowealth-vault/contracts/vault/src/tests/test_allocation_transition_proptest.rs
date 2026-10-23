//! Property coverage for allocation changes interleaved with deposits,
//! withdrawals, and bounded idle yield. Native amounts are USDC stroops.

extern crate std;

use super::utils::*;
use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

const MAX_BPS: u32 = 10_000;
const MIN_DEPOSIT: i128 = 1_000_000;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(24))]

    #[test]
    fn prop_allocation_transitions_conserve_assets_and_shares(
        steps in prop::collection::vec((0u16..=10_000, 0u16..=10_000, 0u8..4, 0u16..500), 1..16)
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, agent, owner, usdc) = setup_vault_with_token(&env);
        let client = NeuroWealthVaultClient::new(&env, &contract_id);
        let blend_pool = env.register_contract(None, MockBlendPool);
        let dex_pool = env.register_contract(None, MockDexPool);
        client.set_blend_pool(&owner, &blend_pool);
        client.set_dex_pool(&owner, &dex_pool);

        let user = Address::generate(&env);
        let token = TestTokenClient::new(&env, &usdc);
        mint_and_deposit(&env, &client, &usdc, &user, 100_000_000);
        client.enable_multi_protocol(&true);

        for (raw_blend, raw_dex, action, raw_amount) in steps {
            let blend_bps = u32::from(raw_blend);
            let dex_bps = u32::from(raw_dex).min(MAX_BPS - blend_bps);
            let amount = MIN_DEPOSIT + i128::from(raw_amount) * MIN_DEPOSIT;

            match action {
                0 => client.rebalance_multi(&blend_bps, &dex_bps, &0_i128),
                1 => {
                    token.mint(&user, &amount);
                    client.deposit(&user, &amount);
                }
                2 => {
                    let balance = client.get_balance(&user);
                    if balance >= MIN_DEPOSIT * 2 {
                        let withdrawal = amount.min(balance - MIN_DEPOSIT);
                        client.withdraw(&user, &withdrawal);
                    }
                }
                _ => {
                    // A synthetic yield injection is only valid while all funds
                    // are idle; it models an externally realized, bounded gain.
                    if client.get_deployed_assets() == 0 {
                        let gain = i128::from(raw_amount + 1) * 10_000;
                        token.mint(&contract_id, &gain);
                        let total = client.get_total_assets() + gain;
                        client.update_total_assets(&agent, &total, &false, &0_i128);
                    }
                }
            }

            let idle = client.get_idle_balance();
            let deployed = client.get_deployed_assets();
            let assets = client.get_total_assets();
            let shares = client.get_total_shares();
            prop_assert!(idle >= 0 && deployed >= 0 && assets >= 0 && shares >= 0);
            prop_assert_eq!(idle + deployed, assets);
            prop_assert_eq!(client.get_shares(&user), shares);
            prop_assert!(client.convert_to_assets(&shares) <= assets);
        }

        // Force every requested mode into each generated history rather than
        // relying on the random generator to happen upon boundary allocations.
        for (blend_bps, dex_bps) in [(0, 0), (MAX_BPS, 0), (0, MAX_BPS), (5_000, 5_000)] {
            client.rebalance_multi(&blend_bps, &dex_bps, &0_i128);
            prop_assert_eq!(
                client.get_idle_balance() + client.get_deployed_assets(),
                client.get_total_assets(),
            );
            prop_assert_eq!(client.get_shares(&user), client.get_total_shares());
        }

        let before = (
            client.get_total_assets(), client.get_total_shares(),
            client.get_idle_balance(), client.get_deployed_assets(), client.get_allocation(),
        );
        prop_assert!(client.try_rebalance_multi(&10_001, &0, &0_i128).is_err());
        let after = (
            client.get_total_assets(), client.get_total_shares(),
            client.get_idle_balance(), client.get_deployed_assets(), client.get_allocation(),
        );
        prop_assert_eq!(after, before, "failed allocation must preserve accounting");
    }
}
