//! Comprehensive Soroban integration test covering the complete lifecycle
//! of funds through the vault: deposit -> rebalance -> harvest -> withdraw.
//!
//! Issue #82.

use super::utils::*;
use crate::{NeuroWealthVault, NeuroWealthVaultClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger},
    Address, BytesN, Env,
};

// ============================================================================
// TEST HELPER FUNCTIONS (Technical Notes)
// ============================================================================

/// Initializes a new Soroban test environment with mocked authorizations.
pub fn setup_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

/// Deploys a mock USDC token contract to the test environment.
pub fn deploy_usdc(env: &Env) -> Address {
    env.register_contract(None, TestToken)
}

/// Deploys and initializes the NeuroWealth Vault contract.
pub fn deploy_vault(
    env: &Env,
    usdc_token: &Address,
    owner: &Address,
    agent: &Address,
) -> Address {
    let deployer = Address::generate(env);
    let salt = BytesN::from_array(env, &[182u8; 32]);
    let contract_id = env
        .deployer()
        .with_address(deployer.clone(), salt.clone())
        .deployed_address();
    env.register_contract(&contract_id, NeuroWealthVault);

    let client = NeuroWealthVaultClient::new(env, &contract_id);
    client.initialize(&deployer, owner, agent, usdc_token, &salt);
    contract_id
}

/// Sets up the complete test environment returning the initialized vault client,
/// token client, blend mock client, and relevant addresses.
fn setup_lifecycle_suite(
    env: &Env,
) -> (
    NeuroWealthVaultClient<'_>,
    TestTokenClient<'_>,
    MockBlendPoolClient<'_>,
    Address, // vault_id
    Address, // usdc_token
    Address, // blend_pool
    Address, // owner
    Address, // agent
) {
    let usdc_token = deploy_usdc(env);
    let owner = Address::generate(env);
    let agent = Address::generate(env);
    let vault_id = deploy_vault(env, &usdc_token, &owner, &agent);

    let blend_pool = env.register_contract(None, MockBlendPool);

    let vault_client = NeuroWealthVaultClient::new(env, &vault_id);
    let token_client = TestTokenClient::new(env, &usdc_token);
    let blend_client = MockBlendPoolClient::new(env, &blend_pool);

    // Configure the Blend pool in the vault
    vault_client.set_blend_pool(&owner, &blend_pool);

    (
        vault_client,
        token_client,
        blend_client,
        vault_id,
        usdc_token,
        blend_pool,
        owner,
        agent,
    )
}

// ============================================================================
// LIFECYCLE TESTS (Acceptance Criteria)
// ============================================================================

/// AC-1: Deploy contract -> initialize -> deposit 100 USDC -> verify shares minted.
#[test]
fn test_lifecycle_deposit_100_usdc_mints_shares() {
    let env = setup_env();
    let (vault_client, token_client, _, _vault_id, _, _, _, _) = setup_lifecycle_suite(&env);

    let user = Address::generate(&env);
    let deposit_amount = 100_000_000_i128; // 100 USDC (7 decimals)

    // Mint USDC to user and approve vault
    token_client.mint(&user, &deposit_amount);
    assert_eq!(token_client.balance(&user), deposit_amount);

    // Deposit 100 USDC into the vault
    vault_client.deposit(&user, &deposit_amount);

    // Verify shares minted and deposits tracked
    let user_shares = vault_client.get_shares(&user);
    assert_eq!(
        user_shares, deposit_amount,
        "Deposit of 100 USDC must mint exactly 100 USDC worth of shares (1:1 bootstrap)"
    );
    assert_eq!(vault_client.get_total_deposits(), deposit_amount);
    assert_eq!(vault_client.get_total_assets(), deposit_amount);
    assert_eq!(vault_client.get_balance(&user), deposit_amount);
}

/// AC-2: Rebalance to Blend -> verify CurrentProtocol == blend.
#[test]
fn test_lifecycle_rebalance_to_blend() {
    let env = setup_env();
    let (vault_client, token_client, _, vault_id, _, blend_pool, _, _) =
        setup_lifecycle_suite(&env);

    let user = Address::generate(&env);
    let deposit_amount = 100_000_000_i128;

    token_client.mint(&user, &deposit_amount);
    vault_client.deposit(&user, &deposit_amount);

    // Rebalance vault funds into Blend at 8.5% expected APY
    let blend_protocol = symbol_short!("blend");
    vault_client.rebalance(&blend_protocol, &850_i128, &0_i128);

    // Verify CurrentProtocol is "blend"
    assert_eq!(
        vault_client.get_current_protocol(),
        blend_protocol,
        "CurrentProtocol must be updated to 'blend'"
    );

    // Verify fund routing: vault idle USDC is 0, Blend pool holds the 100 USDC
    assert_eq!(token_client.balance(&vault_id), 0);
    assert_eq!(token_client.balance(&blend_pool), deposit_amount);
}

/// AC-3: Harvest yield -> verify total_deposits / total_assets increased by yield amount.
#[test]
fn test_lifecycle_harvest_yield() {
    let env = setup_env();
    let (vault_client, token_client, _, vault_id, _, blend_pool, _, agent) =
        setup_lifecycle_suite(&env);

    let user = Address::generate(&env);
    let deposit_amount = 100_000_000_i128;

    token_client.mint(&user, &deposit_amount);
    vault_client.deposit(&user, &deposit_amount);

    let blend_protocol = symbol_short!("blend");
    vault_client.rebalance(&blend_protocol, &850_i128, &0_i128);

    // Accrue yield: simulate 10 USDC (10% yield) earned in Blend pool
    let yield_amount = 10_000_000_i128;
    token_client.mint(&blend_pool, &yield_amount);
    assert_eq!(token_client.balance(&blend_pool), deposit_amount + yield_amount);

    // Agent reports updated total assets backed by deployed funds + yield
    let new_total_assets = deposit_amount + yield_amount;
    vault_client.update_total_assets(&agent, &new_total_assets, &false, &0);

    // Advance ledger to satisfy rebalance cooldown before harvest
    env.ledger().with_mut(|l| l.sequence_number += 1000);

    // Execute harvest to compound yield back into Blend
    vault_client.harvest(&0_i128);

    // Verify total assets reflects the increased yield amount
    assert_eq!(
        vault_client.get_total_assets(),
        new_total_assets,
        "Total assets must increase by accrued yield amount"
    );
    assert_eq!(vault_client.get_current_protocol(), blend_protocol);
    assert_eq!(token_client.balance(&vault_id), 0);
    assert_eq!(token_client.balance(&blend_pool), new_total_assets);
}

/// AC-4: Withdraw 50 USDC -> verify shares burned and USDC received.
#[test]
fn test_lifecycle_withdraw_partial_50_usdc() {
    let env = setup_env();
    let (vault_client, token_client, _, _, _, _, _, _) = setup_lifecycle_suite(&env);

    let user = Address::generate(&env);
    let deposit_amount = 100_000_000_i128;
    let withdraw_amount = 50_000_000_i128; // 50 USDC

    token_client.mint(&user, &deposit_amount);
    vault_client.deposit(&user, &deposit_amount);

    // Rebalance to Blend
    vault_client.rebalance(&symbol_short!("blend"), &850_i128, &0_i128);

    let user_shares_before = vault_client.get_shares(&user);
    assert_eq!(user_shares_before, deposit_amount);
    assert_eq!(token_client.balance(&user), 0_i128);

    // Withdraw 50 USDC
    vault_client.withdraw(&user, &withdraw_amount);

    // Verify 50 USDC received by user
    assert_eq!(
        token_client.balance(&user),
        withdraw_amount,
        "User must receive exactly 50 USDC"
    );

    // Verify shares were burned proportionally (50 USDC burned from 100 USDC shares)
    let user_shares_after = vault_client.get_shares(&user);
    assert_eq!(
        user_shares_after, 50_000_000_i128,
        "50 USDC of shares must be burned, leaving 50 USDC worth of shares"
    );
    assert_eq!(
        vault_client.get_total_deposits(),
        deposit_amount - withdraw_amount
    );
}

/// AC-5: Withdraw_all -> verify user balance is zero and shares burned fully.
#[test]
fn test_lifecycle_withdraw_all() {
    let env = setup_env();
    let (vault_client, token_client, _, _, _, _, _, _) = setup_lifecycle_suite(&env);

    let user = Address::generate(&env);
    let deposit_amount = 100_000_000_i128;

    token_client.mint(&user, &deposit_amount);
    vault_client.deposit(&user, &deposit_amount);

    vault_client.rebalance(&symbol_short!("blend"), &850_i128, &0_i128);

    // Execute full withdraw_all
    vault_client.withdraw_all(&user);

    // Verify user balance is zero and all shares are burned fully
    assert_eq!(
        vault_client.get_shares(&user),
        0_i128,
        "User shares must be fully burned to zero"
    );
    assert_eq!(
        vault_client.get_balance(&user),
        0_i128,
        "User claimable asset balance must be zero"
    );
    assert_eq!(
        token_client.balance(&user),
        deposit_amount,
        "User must receive their full deposited USDC principal back"
    );
    assert_eq!(vault_client.get_total_deposits(), 0_i128);
    assert_eq!(vault_client.get_total_shares(), 0_i128);
}

/// Master Integration Test: Full Complete Lifecycle
/// deposit 100 USDC -> rebalance to Blend -> harvest yield -> withdraw 50 USDC -> withdraw_all.
#[test]
fn test_complete_deposit_rebalance_harvest_withdraw_lifecycle() {
    let env = setup_env();
    let (vault_client, token_client, _, vault_id, _, blend_pool, _, agent) =
        setup_lifecycle_suite(&env);

    let user = Address::generate(&env);
    let initial_deposit = 100_000_000_i128; // 100 USDC

    // ------------------------------------------------------------------------
    // Step 1: Deposit 100 USDC
    // ------------------------------------------------------------------------
    token_client.mint(&user, &initial_deposit);
    vault_client.deposit(&user, &initial_deposit);

    assert_eq!(vault_client.get_shares(&user), initial_deposit);
    assert_eq!(vault_client.get_total_deposits(), initial_deposit);
    assert_eq!(vault_client.get_total_assets(), initial_deposit);
    assert_eq!(token_client.balance(&vault_id), initial_deposit);
    assert_eq!(token_client.balance(&user), 0);

    // ------------------------------------------------------------------------
    // Step 2: Rebalance to Blend
    // ------------------------------------------------------------------------
    let blend_protocol = symbol_short!("blend");
    vault_client.rebalance(&blend_protocol, &850_i128, &0_i128);

    assert_eq!(vault_client.get_current_protocol(), blend_protocol);
    assert_eq!(token_client.balance(&vault_id), 0);
    assert_eq!(token_client.balance(&blend_pool), initial_deposit);

    // ------------------------------------------------------------------------
    // Step 3: Yield Accrual and Harvest
    // ------------------------------------------------------------------------
    let yield_amount = 10_000_000_i128; // 10 USDC yield (10%)
    token_client.mint(&blend_pool, &yield_amount);

    let total_with_yield = initial_deposit + yield_amount;
    vault_client.update_total_assets(&agent, &total_with_yield, &false, &0);

    env.ledger().with_mut(|l| l.sequence_number += 1000);
    vault_client.harvest(&0_i128);

    assert_eq!(vault_client.get_total_assets(), total_with_yield);
    assert_eq!(vault_client.get_current_protocol(), blend_protocol);

    // ------------------------------------------------------------------------
    // Step 4: Partial Withdraw of 50 USDC
    // ------------------------------------------------------------------------
    let partial_withdraw = 50_000_000_i128;
    vault_client.withdraw(&user, &partial_withdraw);

    assert_eq!(token_client.balance(&user), partial_withdraw);
    let remaining_shares = vault_client.get_shares(&user);
    assert!(
        remaining_shares > 0 && remaining_shares < initial_deposit,
        "Shares must be burned proportionally"
    );

    // ------------------------------------------------------------------------
    // Step 5: Withdraw All Remaining Funds
    // ------------------------------------------------------------------------
    vault_client.withdraw_all(&user);

    assert_eq!(
        vault_client.get_shares(&user),
        0_i128,
        "All user shares must be burned"
    );
    assert_eq!(
        vault_client.get_balance(&user),
        0_i128,
        "User balance in vault must be zero"
    );
    assert_eq!(
        token_client.balance(&user),
        total_with_yield,
        "User must have received all original principal plus yield"
    );
}
