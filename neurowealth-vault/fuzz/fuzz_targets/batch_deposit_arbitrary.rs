//! LibFuzzer harness: batch_deposit with arbitrary-length user/amount vectors.
//!
//! Acceptance criteria (#60):
//! - Fuzz target for batch_deposit with arbitrary-length user vectors
//!
//! Strategy:
//!   - Derive a batch of (token, amount) entries from fuzz bytes.
//!   - Batch length ranges from 0 to 64+ entries (exercises size-limit guard).
//!   - Amounts are arbitrary i128 values to exercise overflow checks.
//!   - All entries use the USDC token address (required by the contract).
//!
//! Invariants after each accepted batch:
//! - total_assets >= total_deposits
//! - total_shares >= 0
//! - per-user shares <= total_shares
//!
//! Allowed panics:
//! - `Error(Contract, #37)` — AmountMustBePositive
//! - `Error(Contract, #38)` — BelowMinimumDeposit
//! - `Error(Contract, #39)` — MaximumDepositExceeded
//! - `Error(Contract, #40)` — ExceedsUserDepositCap
//! - `Error(Contract, #41)` — ExceedsTvlCap
//! - `Error(Contract, #6)`  — SharesToMintMustBePositive
//! - `Error(Contract, #77)` — RateLimitExceeded
//! - `Error(Contract, #80)` — BatchSizeExceeded
//! - Token transfer failures

#![no_main]

use libfuzzer_sys::fuzz_target;
use neurowealth_vault::{NeuroWealthVault, NeuroWealthVaultClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{vec as svec, Address, BytesN, Env, Vec as SorobanVec};

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

const TOKEN_FLOAT: i128 = 1_000_000_000_000; // 100,000 USDC
const MIN_DEPOSIT: i128 = 1_000_000;

fn setup(env: &Env) -> (NeuroWealthVaultClient<'_>, Address, Address, Address) {
    let deployer = Address::generate(env);
    let salt = BytesN::from_array(env, &[17u8; 32]);
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
    token.mint(&user, &TOKEN_FLOAT);

    (client, user, owner, usdc)
}

fn is_allowed_panic(msg: &str) -> bool {
    const ALLOWED: &[&str] = &[
        "Error(Contract, #37)", // AmountMustBePositive
        "Error(Contract, #38)", // BelowMinimumDeposit
        "Error(Contract, #39)", // MaximumDepositExceeded
        "Error(Contract, #40)", // ExceedsUserDepositCap
        "Error(Contract, #41)", // ExceedsTvlCap
        "Error(Contract, #6)",  // SharesToMintMustBePositive
        "Error(Contract, #77)", // RateLimitExceeded
        "Error(Contract, #80)", // BatchSizeExceeded
        "batch_deposit: total amount overflow",
        "batch_deposit: token",
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

    assert!(total_shares >= 0);
    assert!(total_assets >= total_deposits);
    assert!(user_shares >= 0);
    assert!(user_shares <= total_shares);
}

fuzz_target!(|data: &[u8]| {
    if data.is_empty() {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let (client, user, _owner, usdc) = setup(&env);

    // Build a batch of entries from fuzz bytes.
    // Each entry uses 3 bytes: 1 byte for entry count selector, 2 bytes for amount.
    let num_entries = (data[0] as usize % 70).max(1); // 1..=69 (above default 50 cap)

    let mut entries: SorobanVec<(Address, i128)> = SorobanVec::new(&env);
    for i in 0..num_entries {
        let offset = 1 + i * 2;
        let raw = if offset + 1 < data.len() {
            u16::from(data[offset]) | (u16::from(data[offset + 1]) << 8)
        } else if offset < data.len() {
            u16::from(data[offset])
        } else {
            1000u16
        };
        // Scale to a range that includes sub-minimum, valid, and above-cap values.
        let amount: i128 = match raw % 4 {
            0 => 0,
            1 => MIN_DEPOSIT,
            2 => i128::from(raw) * MIN_DEPOSIT,
            3 => i128::MAX,
            _ => unreachable!(),
        };
        entries.push_back((usdc.clone(), amount));
    }

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.batch_deposit(&user, &entries);
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
                "unexpected panic for batch of {num_entries} entries: {msg}"
            );
        }
    }
});
