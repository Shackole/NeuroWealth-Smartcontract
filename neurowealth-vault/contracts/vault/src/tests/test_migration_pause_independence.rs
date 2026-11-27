//! Public behavior of the vault and migration pause controls.

use super::utils::*;
use crate::VaultError;
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env, Error};

#[contract]
struct MigrationReceiver;

#[contractimpl]
impl MigrationReceiver {
    // The source vault transfers the assets before calling this entrypoint.
    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        env.storage().persistent().set(&user, &amount);
    }

    pub fn received(env: Env, user: Address) -> i128 {
        env.storage().persistent().get(&user).unwrap_or(0)
    }
}

#[test]
fn migration_and_vault_pause_flags_gate_their_own_actions() {
    const AMOUNT: i128 = 10_000_000;

    for (vault_paused, migration_paused) in
        [(false, false), (false, true), (true, false), (true, true)]
    {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _agent, owner, usdc) = setup_vault_with_token(&env);
        let client = NeuroWealthVaultClient::new(&env, &contract_id);
        let token = TestTokenClient::new(&env, &usdc);
        let target = env.register_contract(None, MigrationReceiver);
        let receiver = MigrationReceiverClient::new(&env, &target);

        let migrating_user = Address::generate(&env);
        let vault_user = Address::generate(&env);
        mint_and_deposit(&env, &client, &usdc, &migrating_user, AMOUNT);
        mint_and_deposit(&env, &client, &usdc, &vault_user, AMOUNT);
        token.mint(&vault_user, &AMOUNT);
        client.set_migration_target(&target);

        if vault_paused {
            client.pause(&owner);
        }
        client.set_migration_paused(&migration_paused);
        assert_eq!(client.is_paused(), vault_paused);

        if migration_paused {
            assert_eq!(
                client.try_migrate_shares(&migrating_user),
                Err(Ok(Error::from_contract_error(
                    VaultError::MigrationPaused as u32
                )))
            );
            assert_eq!(client.get_shares(&migrating_user), AMOUNT);
            assert_eq!(receiver.received(&migrating_user), 0);
            assert_eq!(token.balance(&target), 0);
        } else {
            client.migrate_shares(&migrating_user);
            assert_eq!(client.get_shares(&migrating_user), 0);
            assert_eq!(receiver.received(&migrating_user), AMOUNT);
            assert_eq!(token.balance(&target), AMOUNT);
        }

        if vault_paused {
            let paused = Error::from_contract_error(VaultError::Paused as u32);
            assert_eq!(client.try_deposit(&vault_user, &AMOUNT), Err(Ok(paused)));
            assert_eq!(client.try_withdraw_all(&vault_user), Err(Ok(paused)));
            assert_eq!(client.get_shares(&vault_user), AMOUNT);
        } else {
            client.deposit(&vault_user, &AMOUNT);
            assert_eq!(client.get_shares(&vault_user), 2 * AMOUNT);
            assert_eq!(client.withdraw_all(&vault_user), 2 * AMOUNT);
            assert_eq!(client.get_shares(&vault_user), 0);
        }
    }
}
