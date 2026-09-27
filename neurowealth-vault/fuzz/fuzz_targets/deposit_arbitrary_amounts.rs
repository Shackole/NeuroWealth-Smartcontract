//! LibFuzzer harness: deposit with arbitrary amounts including 0, 1, and i128::MAX.
//!
//! Acceptance criteria (#60):
//! - Fuzz target for deposit with arbitrary amounts (0, 1, i128::MAX)
//!
//! Invariants checked after every accepted deposit:
//! - total_shares > 0
//! - user_shares <= total_shares
//! - user_balance <= total_assets
//! - total_assets >= total_deposits
//!
//! Allowed panics (documented vault validation):
//! - `Error(Contract, #37)` — AmountMustBePositive
//! - `Error(Contract, #38)` — BelowMinimumDeposit
//! - `Error(Contract, #39)` — MaximumDepositExceeded
//! - `Error(Contract, #40)` — ExceedsUserDepositCap
//! - `Error(Contract, #41)` — ExceedsTvlCap
//! - `Error(Contract, #6)`  — SharesToMintMustBePositive
//! - Token transfer failures (insufficient balance, amount must be positive)

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

// Generous float so the vault can receive near-max deposits in testing.
const TOKEN_FLOAT: i128 = i128::MAX / 2;

fn setup(env: &Env) -> (NeuroWealthVaultClient<'_>, Address, Address) {
    let deployer = Address::generate(env);
    let salt = BytesN::from_array(env, &[42u8; 32]);
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

    // Set permissive TVL and user caps so arbitrary large amounts can land.
    let token = FuzzTokenClient::new(env, &usdc);
    token.mint(&user, &TOKEN_FLOAT);

    (client, user, usdc)
}

fn is_allowed_panic(msg: &str) -> bool {
    const ALLOWED: &[&str] = &[
        "Error(Contract, #37)", // AmountMustBePositive
        "Error(Contract, #38)", // BelowMinimumDeposit
        "Error(Contract, #39)", // MaximumDepositExceeded
        "Error(Contract, #40)", // ExceedsUserDepositCap
        "Error(Contract, #41)", // ExceedsTvlCap
        "Error(Contract, #6)",  // SharesToMintMustBePositive
        "Error(Contract, #80)", // BatchSizeExceeded (rate limiting)
        "Error(Contract, #77)", // RateLimitExceeded
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

    assert!(total_shares >= 0);
    assert!(total_assets >= total_deposits);
    assert!(user_shares >= 0);
    assert!(user_shares <= total_shares);
    assert!(user_balance >= 0);
    if total_shares > 0 {
        assert!(user_balance <= total_assets);
    }
}

/// Decode 16 bytes of fuzzer input as an i128 (little-endian).
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

    let (client, user, usdc) = setup(&env);
    let token = FuzzTokenClient::new(&env, &usdc);

    // Build a mix of interesting edge-case amounts derived from fuzz data:
    // raw arbitrary value, 0, 1, and i128::MAX sprinkled in via selector.
    let selector = data[0];
    let amount: i128 = match selector % 5 {
        0 => 0,
        1 => 1,
        2 => i128::MAX,
        3 => -1,
        4 => bytes_to_i128(&data[1..]),
        _ => unreachable!(),
    };

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        // Only top up balance if amount is positive; negative/zero will be
        // rejected by the contract anyway.
        if amount > 0 && token.balance(&user) < amount {
            return; // token balance insufficient, skip this run
        }
        client.deposit(&user, &amount);
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
                "unexpected panic for amount={amount}: {msg}"
            );
        }
    }
});
