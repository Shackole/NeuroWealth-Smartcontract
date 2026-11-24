use super::utils::{setup_vault_with_token, NeuroWealthVaultClient, TestTokenClient};
use crate::BatchDepositItem;
use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

#[test]
fn test_batch_deposit_multiple_users() {
    let env = Env::default();
    env.mock_all_auths();

    let (vault, agent, _owner, usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &vault);
    let token = TestTokenClient::new(&env, &usdc);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    token.mint(&agent, &1000_0000000);

    let mut deposits = Vec::new(&env);
    deposits.push_back(BatchDepositItem {
        user: user1.clone(),
        amount: 100_0000000,
    });
    deposits.push_back(BatchDepositItem {
        user: user2.clone(),
        amount: 200_0000000,
    });

    client.batch_deposit(&agent, &deposits);

    assert_eq!(client.get_shares(&user1), 100_0000000);
    assert_eq!(client.get_shares(&user2), 200_0000000);
}

#[test]
fn test_batch_deposit_mixed_entries_respect_tvl_cap_and_skip_invalid_user() {
    let env = Env::default();
    env.mock_all_auths();

    let (vault, agent, _owner, usdc) = setup_vault_with_token(&env);
    let client = NeuroWealthVaultClient::new(&env, &vault);
    let token = TestTokenClient::new(&env, &usdc);
    let valid_user = Address::generate(&env);
    let invalid_user = Address::generate(&env);
    let valid_amount = 10_000_000_i128;
    let invalid_amount = client.get_min_deposit() - 1;
    let funding = valid_amount + invalid_amount;
    token.mint(&agent, &funding);

    let mut deposits = Vec::new(&env);
    deposits.push_back(BatchDepositItem {
        user: valid_user.clone(),
        amount: valid_amount,
    });
    deposits.push_back(BatchDepositItem {
        user: invalid_user.clone(),
        amount: invalid_amount,
    });

    client.set_tvl_cap(&(valid_amount - 1));
    assert_eq!(
        client.try_batch_deposit(&agent, &deposits),
        Err(Ok(soroban_sdk::Error::from_contract_error(41)))
    );
    for user in [&valid_user, &invalid_user] {
        assert_eq!(client.get_user_info(user).principal, 0);
        assert_eq!(client.get_shares(user), 0);
    }
    assert_eq!(client.get_total_assets(), 0);
    assert_eq!(client.get_total_shares(), 0);
    assert_eq!(client.get_total_deposits(), 0);
    assert_eq!(token.balance(&vault), 0);
    assert_eq!(token.balance(&agent), funding);

    client.set_tvl_cap(&valid_amount);
    client.batch_deposit(&agent, &deposits);

    assert_eq!(client.get_user_info(&valid_user).principal, valid_amount);
    assert_eq!(client.get_shares(&valid_user), valid_amount);
    assert_eq!(client.get_user_info(&invalid_user).principal, 0);
    assert_eq!(client.get_shares(&invalid_user), 0);
    assert_eq!(client.get_total_assets(), valid_amount);
    assert_eq!(client.get_total_shares(), valid_amount);
    assert_eq!(client.get_total_deposits(), valid_amount);
    assert_eq!(token.balance(&vault), valid_amount);
    assert_eq!(token.balance(&agent), invalid_amount);
}
