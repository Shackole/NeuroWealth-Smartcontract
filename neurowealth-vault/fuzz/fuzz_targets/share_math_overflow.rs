//! LibFuzzer harness: share math overflow checks for preview_deposit_to_shares.
//!
//! Acceptance criteria (#60):
//! - Fuzz target for share math: preview_deposit_to_shares overflow checks
//!
//! Strategy:
//!   - Seed the vault with varying total_assets by depositing or via
//!     update_total_assets calls.
//!   - Feed arbitrary i128 values to preview_deposit_to_shares,
//!     preview_shares_to_assets, convert_to_shares, and convert_to_assets.
//!   - Verify no unexpected panics occur (arithmetic overflow must be caught
//!     and returned as a proper VaultError, not an uncaught Rust overflow).
//!   - Assert monotonicity and non-negativity invariants on successful calls.
//!
//! Allowed panics:
//! - `Error(Contract, #37)` — AmountMustBePositive
//! - `Error(Contract, #47)` — InvalidStrategy (covers ShareConversionOverflow alias)
//! - `Error(Contract, #77)` — RateLimitExceeded (preview rate-limit bucket)
//! - Token / math panics from soroban_sdk internals are NOT allowed.

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

fn setup(env: &Env, seed_deposit: i128) -> (NeuroWealthVaultClient<'_>, Address, Address) {
    let deployer = Address::generate(env);
    let salt = BytesN::from_array(env, &[99u8; 32]);
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
    if seed_deposit > 0 {
        token.mint(&user, &seed_deposit);
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.deposit(&user, &seed_deposit);
        }));
    }

    (client, user, usdc)
}

fn is_allowed_panic(msg: &str) -> bool {
    const ALLOWED: &[&str] = &[
        "Error(Contract, #37)", // AmountMustBePositive
        "Error(Contract, #47)", // InvalidStrategy (ShareConversionOverflow alias)
        "Error(Contract, #77)", // RateLimitExceeded
        "Error(Contract, #6)",  // SharesToMintMustBePositive
        "Error(Contract, #38)", // BelowMinimumDeposit
        "Error(Contract, #39)", // MaximumDepositExceeded
        "Error(Contract, #40)", // ExceedsUserDepositCap
        "Error(Contract, #41)", // ExceedsTvlCap
    ];
    ALLOWED.iter().any(|needle| msg.contains(needle))
}

fn bytes_to_i128(data: &[u8]) -> i128 {
    let mut buf = [0u8; 16];
    let len = data.len().min(16);
    buf[..len].copy_from_slice(&data[..len]);
    i128::from_le_bytes(buf)
}

fuzz_target!(|data: &[u8]| {
    if data.len() < 3 {
        return;
    }

    // Use first 2 bytes to decide the seed deposit and the next 16 as the query value.
    let seed_raw = u16::from(data[0]) | (u16::from(data[1]) << 8);
    // Use interesting seeds: 0 (empty vault), 1, small, large.
    let seed_deposit: i128 = match seed_raw % 4 {
        0 => 0,
        1 => 1_000_000,       // 1 USDC — minimum viable deposit
        2 => 100_000_000_000, // 100,000 USDC
        3 => i128::from(seed_raw) * 1_000_000,
        _ => unreachable!(),
    };

    let env = Env::default();
    env.mock_all_auths();

    let (client, _user, _usdc) = setup(&env, seed_deposit);

    // Build the query amount — include overflow-triggering extremes.
    let query: i128 = match data[2] % 5 {
        0 => 0,
        1 => 1,
        2 => i128::MAX,
        3 => -1,
        4 => bytes_to_i128(&data[3..]),
        _ => unreachable!(),
    };

    // --- preview_deposit_to_shares ---
    let r1 = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.preview_deposit_to_shares(&query)
    }));
    if let Ok(shares) = r1 {
        assert!(shares >= 0, "preview_deposit_to_shares must be non-negative");
        // Monotonicity: larger deposit → at least as many shares (for positive values).
        if query > 0 && query < i128::MAX {
            let r2 = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.preview_deposit_to_shares(&(query + 1))
            }));
            if let Ok(shares2) = r2 {
                assert!(
                    shares2 >= shares,
                    "preview_deposit_to_shares must be monotone non-decreasing"
                );
            }
        }
    } else {
        let payload = r1.unwrap_err();
        let msg = payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("unknown panic");
        assert!(
            is_allowed_panic(msg),
            "unexpected panic in preview_deposit_to_shares({query}): {msg}"
        );
    }

    // --- preview_shares_to_assets ---
    let r3 = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.preview_shares_to_assets(&query)
    }));
    if let Ok(assets) = r3 {
        assert!(assets >= 0, "preview_shares_to_assets must be non-negative");
    } else {
        let payload = r3.unwrap_err();
        let msg = payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("unknown panic");
        assert!(
            is_allowed_panic(msg),
            "unexpected panic in preview_shares_to_assets({query}): {msg}"
        );
    }

    // --- convert_to_shares ---
    let r4 = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.convert_to_shares(&query)
    }));
    if let Ok(s) = r4 {
        assert!(s >= 0, "convert_to_shares must be non-negative");
    } else {
        let payload = r4.unwrap_err();
        let msg = payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("unknown panic");
        assert!(
            is_allowed_panic(msg),
            "unexpected panic in convert_to_shares({query}): {msg}"
        );
    }

    // --- convert_to_assets ---
    let r5 = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.convert_to_assets(&query)
    }));
    if let Ok(a) = r5 {
        assert!(a >= 0, "convert_to_assets must be non-negative");
    } else {
        let payload = r5.unwrap_err();
        let msg = payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("unknown panic");
        assert!(
            is_allowed_panic(msg),
            "unexpected panic in convert_to_assets({query}): {msg}"
        );
    }
});
