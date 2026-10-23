//! LibFuzzer harness: withdraw with amounts exceeding balance.
//!
//! Acceptance criteria (#60):
//! - Fuzz target for withdraw with amounts exceeding balance
//!
//! Strategy:
//!   1. Deposit a known amount to establish a balance.
//!   2. Attempt to withdraw with an arbitrary (possibly exceeding) amount.
//!   3. Assert invariants hold on success; only documented errors are permitted.
//!
//! Invariants:
//! - user_shares >= 0 at all times
//! - user_balance <= total_assets after any operation
//! - total_assets >= total_deposits
//!
//! Allowed panics:
//! - `Error(Contract, #7)`  — InsufficientLiquidity
//! - `Error(Contract, #8)`  — InsufficientShares
//! - `Error(Contract, #9)`  — NoAssetsToWithdraw
//! - `Error(Contract, #10)` — SharesToBurnMustBePositive
//! - `Error(Contract, #11)` — InsufficientSharesForAmount
//! - `Error(Contract, #12)` — NoSharesToWithdraw
//! - `Error(Contract, #37)` — AmountMustBePositive
//! - `Error(Contract, #77)` — RateLimitExceeded
//! - Token transfer failures

#![no_main]

use libfuzzer_sys::fuzz_target;
use neurowealth_vault::{NeuroWealthVault, NeuroWealthVaultClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env};

mod token {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    enum TokenDataKey {
        Balance(Address),
    }

    #[contract]
    pub struct FuzzToken;

    #[contractimpl]
    impl FuzzToken {
        pub fn mint(env: Env, to: Address, amount: i128) {
            let balance: i128 = env
                .storage()
                .persistent()
                .get(&TokenDataKey::Balance(to.clone()))
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&TokenDataKey::Balance(to), &(balance + amount));
        }

        pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
            from.require_auth();
            assert!(amount > 0, "amount must be positive");
            let from_bal: i128 = env
                .storage()
                .persistent()
                .get(&TokenDataKey::Balance(from.clone()))
                .unwrap_or(0);
            assert!(from_bal >= amount, "insufficient balance");
            let to_bal: i128 = env
                .storage()
                .persistent()
                .get(&TokenDataKey::Balance(to.clone()))
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&TokenDataKey::Balance(from), &(from_bal - amount));
            env.storage()
                .persistent()
                .set(&TokenDataKey::Balance(to), &(to_bal + amount));
        }

        pub fn balance(env: Env, owner: Address) -> i128 {
            env.storage()
                .persistent()
                .get(&TokenDataKey::Balance(owner))
                .unwrap_or(0)
        }
    }
}

use token::{FuzzToken, FuzzTokenClient};

const MIN_DEPOSIT: i128 = 1_000_000;
const DEPOSIT_AMOUNT: i128 = 10_000_000; // 10 USDC — a known stable deposit

fn setup(env: &Env) -> (NeuroWealthVaultClient<'_>, Address, Address) {
    let deployer = Address::generate(env);
    let salt = BytesN::from_array(env, &[13u8; 32]);
    let contract_id = env
        .deployer()
        .with_address(deployer.clone(), salt.clone())
        .deployed_address();
    env.register_contract(&contract_id, NeuroWealthVault);

    let client = NeuroWealthVaultClient::new(env, &contract_id);
    let agent = Address::generate(env);
    let owner = Address::generate(env);
    let usdc = env.register_contract(None, FuzzToken);
    let user = Address::generate(env);

    client.initialize(&deployer, &owner, &agent, &usdc, &salt);

    let token = FuzzTokenClient::new(env, &usdc);
    // Give user enough to make the initial deposit.
    token.mint(&user, &(DEPOSIT_AMOUNT * 2));

    // Make an initial deposit so there is always a balance to over-withdraw against.
    client.deposit(&user, &DEPOSIT_AMOUNT);

    (client, user, usdc)
}

fn is_allowed_panic(msg: &str) -> bool {
    const ALLOWED: &[&str] = &[
        "Error(Contract, #7)",  // InsufficientLiquidity
        "Error(Contract, #8)",  // InsufficientShares
        "Error(Contract, #9)",  // NoAssetsToWithdraw
        "Error(Contract, #10)", // SharesToBurnMustBePositive
        "Error(Contract, #11)", // InsufficientSharesForAmount
        "Error(Contract, #12)", // NoSharesToWithdraw
        "Error(Contract, #37)", // AmountMustBePositive
        "Error(Contract, #77)", // RateLimitExceeded
        "Error(Contract, #75)", // HoldingPeriodNotElapsed
        "insufficient balance",
        "amount must be positive",
    ];
    ALLOWED.iter().any(|needle| msg.contains(needle))
}

fn assert_invariants(client: &NeuroWealthVaultClient, user: &Address) {
    let total_shares = client.get_total_shares();
    let total_assets = client.get_total_assets();
    let total_deposits = client.get_total_deposits();
    let user_shares = client.get_shares(user);
    let user_balance = client.get_balance(user);

    assert!(total_shares >= 0, "total_shares must be non-negative");
    assert!(
        total_assets >= total_deposits,
        "total_assets must be >= total_deposits"
    );
    assert!(user_shares >= 0, "user_shares must be non-negative");
    assert!(
        user_shares <= total_shares,
        "user_shares cannot exceed total_shares"
    );
    assert!(user_balance >= 0, "user_balance must be non-negative");
    if total_shares > 0 {
        assert!(
            user_balance <= total_assets,
            "user_balance cannot exceed total_assets"
        );
    }
}

fn bytes_to_i128(data: &[u8]) -> i128 {
    let mut buf = [0u8; 16];
    let len = data.len().min(16);
    buf[..len].copy_from_slice(&data[..len]);
    i128::from_le_bytes(buf)
}

fuzz_target!(|data: &[u8]| {
    if data.len() < 2 {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let (client, user, _usdc) = setup(&env);

    // Build a withdrawal amount — bias towards values that exceed the balance.
    let user_balance = client.get_balance(&user);
    let selector = data[0];
    let withdraw_amount: i128 = match selector % 6 {
        // Exact balance (should succeed).
        0 => user_balance,
        // Slightly above balance (should fail with InsufficientShares / Liquidity).
        1 => user_balance.saturating_add(MIN_DEPOSIT),
        // Far exceeding balance.
        2 => i128::MAX,
        // Zero (should fail with AmountMustBePositive).
        3 => 0,
        // Negative (should fail with AmountMustBePositive).
        4 => -1,
        // Arbitrary raw value from fuzzer bytes.
        5 => bytes_to_i128(&data[1..]),
        _ => unreachable!(),
    };

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.withdraw(&user, &withdraw_amount);
    }));

    match result {
        Ok(()) => assert_invariants(&client, &user),
        Err(payload) => {
            let msg = payload
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| payload.downcast_ref::<String>().map(|s| s.as_str()))
                .unwrap_or("unknown panic");
            assert!(
                is_allowed_panic(msg),
                "unexpected panic for withdraw_amount={withdraw_amount}: {msg}"
            );
        }
    }
});
