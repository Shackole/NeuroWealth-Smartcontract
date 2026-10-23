//! Table-driven authorization checks across both pause states (#479).
//!
//! `SECURITY.md` contains the complete mutator inventory and pause policy.
//! This matrix samples the distinct authorization classes—user, agent, and
//! owner—and requires every unauthenticated invocation to fail whether the
//! vault is paused or active. Pause recovery exceptions are exercised in
//! `test_pause.rs` and `test_upgrade_timelock.rs`.

use super::utils::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

#[derive(Clone, Copy)]
enum MutatorCase {
    UserDeposit,
    AgentRebalance,
    OwnerSetCap,
    UserPreference,
    OwnerRegisterAsset,
}

const AUTH_CASES: &[(&str, MutatorCase)] = &[
    ("deposit", MutatorCase::UserDeposit),
    ("rebalance", MutatorCase::AgentRebalance),
    ("set_tvl_cap", MutatorCase::OwnerSetCap),
    ("set_user_strategy", MutatorCase::UserPreference),
    ("add_supported_asset", MutatorCase::OwnerRegisterAsset),
];

#[test]
fn unauthenticated_mutators_fail_while_active_and_paused() {
    for paused in [false, true] {
        for (name, case) in AUTH_CASES {
            let env = Env::default();
            env.mock_all_auths();
            let (contract_id, agent, owner, token) = setup_vault_with_token(&env);
            let client = NeuroWealthVaultClient::new(&env, &contract_id);
            let user = Address::generate(&env);
            if paused {
                client.pause(&owner);
            }

            // setup_vault uses blanket mock auth for initialization. Replace
            // that allowance with an empty authorization set for the call.
            env.set_auths(&[]);
            let rejected = match case {
                MutatorCase::UserDeposit => client.try_deposit(&user, &1_000_000_i128).is_err(),
                MutatorCase::AgentRebalance => client
                    .try_rebalance(&Symbol::new(&env, "none"), &0_i128, &0_i128)
                    .is_err(),
                MutatorCase::OwnerSetCap => client.try_set_tvl_cap(&1_000_000_i128).is_err(),
                MutatorCase::UserPreference => client
                    .try_set_user_strategy(&user, &Symbol::new(&env, "growth"))
                    .is_err(),
                MutatorCase::OwnerRegisterAsset => {
                    let asset = Symbol::new(&env, "TEST");
                    client
                        .try_add_supported_asset(&asset, &token, &0_i128, &0_i128, &0_i128)
                        .is_err()
                }
            };
            assert!(
                rejected,
                "unauthorized {name} must fail while paused={paused}; actor={agent}"
            );
        }
    }
}
