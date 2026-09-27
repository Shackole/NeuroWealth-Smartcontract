//! Property-based tests for vault share accounting math (Issue #87).
//!
//! Uses `proptest` to test invariant properties across 1000 arbitrary input
//! values within [1, i128::MAX / 1e7] to avoid arithmetic overflow.
//!
//! Invariants tested:
//! 1. `deposit(x)` then `withdraw(x)` returns original amount within 1 stroop rounding.
//! 2. Exchange rate never decreases after a deposit (assuming no slippage).
//! 3. `total_shares * exchange_rate ≈ total_deposits` within rounding tolerance.
//! 4. Minting shares for amount A, then redeeming, yields <= A assets (no inflation).
//! 5. Properties hold for inputs in [1, i128::MAX / 1e7].
//! 6. Each property runs 1000 cases.

extern crate std;

use proptest::prelude::*;
use share_math::{assets_from_shares, rate_non_decreasing, shares_ceil, shares_floor};

/// Bound input range to [1, i128::MAX / 1e7] as specified in acceptance criteria.
/// 1e7 corresponds to 10^7 (Stellar 7-decimal stroop precision).
const MAX_AMOUNT: i128 = i128::MAX / 10_000_000i128;
const SCALAR_1E7: i128 = 10_000_000i128;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(1000))]

    /// Property 1: deposit(x) then withdraw(x) returns the original amount
    /// within 1 stroop rounding tolerance.
    #[test]
    fn prop_deposit_then_withdraw_returns_original_within_one_stroop(
        x in 1i128..=MAX_AMOUNT,
        total_shares in 1i128..=MAX_AMOUNT,
        total_assets in 1i128..=MAX_AMOUNT,
    ) {
        // Skip invalid intermediate multiplications that would overflow i128
        prop_assume!(x.checked_mul(total_shares).is_some());

        let minted_shares = shares_floor(x, total_shares, total_assets)
            .expect("valid floor share conversion");
        prop_assume!(minted_shares > 0);

        prop_assume!(total_shares.checked_add(minted_shares).is_some());
        prop_assume!(total_assets.checked_add(x).is_some());

        let post_shares = total_shares.checked_add(minted_shares).expect("post shares add");
        let post_assets = total_assets.checked_add(x).expect("post assets add");

        // (a) User burns exactly the shares minted:
        let returned_assets = assets_from_shares(minted_shares, post_shares, post_assets)
            .expect("valid assets from shares");
        let diff_minted = (x.checked_sub(returned_assets).expect("diff sub")).abs();
        prop_assert!(
            diff_minted <= 1,
            "deposit({}) then redeeming minted shares ({}) returned {} (diff > 1)",
            x, minted_shares, returned_assets
        );

        // (b) User requests withdrawal of original asset amount x:
        let shares_to_burn = shares_ceil(x, post_shares, post_assets)
            .expect("valid ceil share conversion");
        let assets_out = assets_from_shares(shares_to_burn, post_shares, post_assets)
            .expect("valid assets out");
        let diff_requested = (assets_out.checked_sub(x).expect("diff sub")).abs();
        prop_assert!(
            diff_requested <= 1,
            "withdrawing amount {} burned {} shares and returned {} (diff > 1)",
            x, shares_to_burn, assets_out
        );
    }

    /// Property 2: Exchange rate never decreases after a deposit (assuming no slippage).
    #[test]
    fn prop_exchange_rate_never_decreases_after_deposit(
        assets in 1i128..=MAX_AMOUNT,
        total_shares in 1i128..=MAX_AMOUNT,
        total_assets in 1i128..=MAX_AMOUNT,
    ) {
        prop_assume!(assets.checked_mul(total_shares).is_some());

        let minted_shares = shares_floor(assets, total_shares, total_assets)
            .expect("valid floor shares");

        prop_assume!(total_shares.checked_add(minted_shares).is_some());
        prop_assume!(total_assets.checked_add(assets).is_some());

        let post_shares = total_shares.checked_add(minted_shares).expect("post shares add");
        let post_assets = total_assets.checked_add(assets).expect("post assets add");

        let is_non_decreasing = rate_non_decreasing(
            total_assets,
            total_shares,
            post_assets,
            post_shares,
        );

        prop_assert_eq!(
            is_non_decreasing,
            Some(true),
            "exchange rate decreased after depositing {} assets (before: {}/{}, after: {}/{})",
            assets, total_assets, total_shares, post_assets, post_shares
        );
    }

    /// Property 3: total_shares * exchange_rate ≈ total_deposits (within rounding tolerance).
    #[test]
    fn prop_total_shares_times_exchange_rate_approx_total_deposits(
        total_shares in 1i128..=MAX_AMOUNT,
        total_deposits in 1i128..=MAX_AMOUNT,
    ) {
        prop_assume!(total_deposits.checked_mul(SCALAR_1E7).is_some());

        // exchange_rate = (total_deposits * SCALAR_1E7) / total_shares
        let exchange_rate = (total_deposits.checked_mul(SCALAR_1E7).expect("mul scalar"))
            .checked_div(total_shares)
            .expect("div shares");

        prop_assume!(total_shares.checked_mul(exchange_rate).is_some());

        let reconstructed = (total_shares.checked_mul(exchange_rate).expect("mul rate"))
            .checked_div(SCALAR_1E7)
            .expect("div scalar");

        // The integer division loses at most (total_shares - 1) in the remainder.
        // Scaled back, the maximum discrepancy is (total_shares / SCALAR_1E7) + 1.
        let tolerance = (total_shares.checked_div(SCALAR_1E7).expect("div tolerance"))
            .checked_add(1)
            .expect("add tolerance");
        let diff = (total_deposits.checked_sub(reconstructed).expect("sub diff")).abs();

        prop_assert!(
            diff <= tolerance,
            "total_shares ({}) * exchange_rate ({}) / 1e7 = {} != total_deposits ({}), diff {} exceeds tolerance {}",
            total_shares, exchange_rate, reconstructed, total_deposits, diff, tolerance
        );

        // In exact share-to-asset conversion, converting all shares must yield all deposits:
        let exact_assets = assets_from_shares(total_shares, total_shares, total_deposits)
            .expect("exact conversion");
        prop_assert_eq!(
            exact_assets,
            total_deposits,
            "converting all shares back must yield exact total deposits"
        );
    }

    /// Property 4: Minting shares for amount A, then redeeming, yields <= A assets (no inflation).
    #[test]
    fn prop_minting_shares_then_redeeming_yields_lte_assets_no_inflation(
        a in 1i128..=MAX_AMOUNT,
        total_shares in 1i128..=MAX_AMOUNT,
        total_assets in 1i128..=MAX_AMOUNT,
    ) {
        prop_assume!(a.checked_mul(total_shares).is_some());

        let minted_shares = shares_floor(a, total_shares, total_assets)
            .expect("valid floor shares");

        // Case A: Redeeming against current state
        let redeemed_current = assets_from_shares(minted_shares, total_shares, total_assets)
            .expect("valid assets current");
        prop_assert!(
            redeemed_current <= a,
            "inflation detected: redeemed {} assets for initial deposit of {}",
            redeemed_current, a
        );

        // Case B: Redeeming against post-deposit state
        prop_assume!(total_shares.checked_add(minted_shares).is_some());
        prop_assume!(total_assets.checked_add(a).is_some());

        let post_shares = total_shares.checked_add(minted_shares).expect("post shares");
        let post_assets = total_assets.checked_add(a).expect("post assets");

        let redeemed_post = assets_from_shares(minted_shares, post_shares, post_assets)
            .expect("valid assets post");
        prop_assert!(
            redeemed_post <= a,
            "post-deposit inflation detected: redeemed {} assets for initial deposit of {}",
            redeemed_post, a
        );
    }
}
