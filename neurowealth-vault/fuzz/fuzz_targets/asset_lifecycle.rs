//! LibFuzzer harness for supported-asset registration and removal lifecycle.
//!
//! Operations interleave deposits, partial/full exits, removal, re-registration,
//! duplicate registration, and invalid limits. Removal with outstanding shares
//! must fail without dropping config or accounting; after a valid removal and
//! re-registration, no prior non-zero position may be resurrected.

#![no_main]

use libfuzzer_sys::fuzz_target;
use neurowealth_vault::{NeuroWealthVault, NeuroWealthVaultClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol};

mod token {
    use super::*;

    #[contracttype]
    enum Key {
        Balance(Address),
    }

    #[contract]
    pub struct FuzzToken;

    #[contractimpl]
    impl FuzzToken {
        pub fn mint(env: Env, user: Address, amount: i128) {
            let key = Key::Balance(user.clone());
            let old: i128 = env.storage().persistent().get(&key).unwrap_or(0);
            env.storage().persistent().set(&key, &old.saturating_add(amount));
        }

        pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
            from.require_auth();
            let from_key = Key::Balance(from.clone());
            let to_key = Key::Balance(to.clone());
            let from_balance: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
            let to_balance: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
            assert!(amount > 0 && from_balance >= amount, "invalid transfer");
            env.storage().persistent().set(&from_key, &(from_balance - amount));
            env.storage().persistent().set(&to_key, &to_balance.saturating_add(amount));
        }

        pub fn balance(env: Env, owner: Address) -> i128 {
            env.storage().persistent().get(&Key::Balance(owner)).unwrap_or(0)
        }
    }
}

use token::{FuzzToken, FuzzTokenClient};

const MIN_DEPOSIT: i128 = 1_000_000;

fn check_asset(
    client: &NeuroWealthVaultClient,
    user: &Address,
    asset: &Symbol,
) {
    let shares = client.get_asset_balance(user, asset).shares;
    let totals = client.get_asset_totals(asset);
    assert!(shares >= 0, "user asset shares became negative");
    assert!(totals.shares >= shares, "user shares exceed aggregate supply");
    assert!(totals.assets >= 0, "asset total became negative");
    assert!(totals.deposits >= 0, "asset deposits became negative");

    if shares > 0 || totals.assets > 0 || totals.shares > 0 {
        assert!(
            client.get_asset_config(asset).is_some(),
            "asset with an outstanding position must remain registered"
        );
    }
}

fuzz_target!(|data: &[u8]| {
    let env = Env::default();
    env.mock_all_auths();
    let deployer = Address::generate(&env);
    let salt = BytesN::from_array(&env, &[0x4a; 32]);
    let contract_id = env
        .deployer()
        .with_address(deployer.clone(), salt.clone())
        .deployed_address();
    env.register_contract(&contract_id, NeuroWealthVault);
    let client = NeuroWealthVaultClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let usdc = env.register_contract(None, FuzzToken);
    client.initialize(&deployer, &owner, &agent, &usdc, &salt);

    let user = Address::generate(&env);
    let usdt = env.register_contract(None, FuzzToken);
    let tokens = [usdc, usdt];
    let assets = [Symbol::new(&env, "USDC"), Symbol::new(&env, "USDT")];
    for i in 0..assets.len() {
        client.add_supported_asset(&assets[i], &tokens[i], &0, &0, &0);
    }
    let token_clients = [FuzzTokenClient::new(&env, &tokens[0]), FuzzTokenClient::new(&env, &tokens[1])];

    for chunk in data.chunks(3) {
        if chunk.len() < 3 {
            continue;
        }
        let op = chunk[0] % 6;
        let index = (chunk[1] as usize) % assets.len();
        let amount = ((chunk[2] as i128) + 1) * MIN_DEPOSIT;
        let asset = &assets[index];
        let token = &token_clients[index];

        match op {
            0 => {
                token.mint(&user, &amount);
                let _ = client.try_deposit_asset(&user, asset, &amount);
            }
            1 => {
                let available = client.get_balance_asset(&user, asset).assets;
                if available > 0 {
                    let payout = amount.min(available).max(1);
                    let _ = client.try_withdraw_asset(&user, asset, &payout);
                }
            }
            2 => {
                let before = client.get_asset_totals(asset);
                let result = client.try_remove_supported_asset(asset);
                if before.assets > 0 || before.shares > 0 {
                    assert!(result.is_err(), "cannot remove an asset with open positions");
                    assert!(client.get_asset_config(asset).is_some());
                } else if result.is_ok() {
                    assert!(client.get_asset_config(asset).is_none());
                }
            }
            3 => {
                if client.get_asset_config(asset).is_none() {
                    client.add_supported_asset(asset, &tokens[index], &0, &0, &0);
                    assert_eq!(client.get_asset_totals(asset).shares, 0);
                    assert_eq!(client.get_asset_totals(asset).assets, 0);
                }
            }
            4 => {
                let duplicate = client.try_add_supported_asset(
                    asset,
                    &tokens[index],
                    &0,
                    &0,
                    &0,
                );
                assert!(duplicate.is_err(), "duplicate asset metadata must be rejected");
            }
            _ => {
                let invalid = Symbol::new(&env, "BAD");
                let result = client.try_add_supported_asset(
                    &invalid,
                    &tokens[index],
                    &-1,
                    &0,
                    &0,
                );
                assert!(result.is_err(), "negative asset limits must be rejected");
                assert!(client.get_asset_config(&invalid).is_none());
            }
        }
        for i in 0..assets.len() {
            check_asset(&client, &user, &assets[i]);
        }
    }
});
