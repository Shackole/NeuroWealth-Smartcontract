# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Contract versions correspond to the `DataKey::Version` value stored on-chain.

> **Contributors:** Any PR that changes on-chain contract behavior, emitted events, error codes,
> or the `Version` storage value **must** update this file. Add your changes under `[Unreleased]`
> and note the target `Version` value if an upgrade is planned. See the PR checklist in
> `.github/pull_request_template.md`.

---

## [Unreleased]

[unreleased]: https://github.com/Shackole/NeuroWealth-Smartcontract/compare/v1.0.0...HEAD

### Added

- **Agent-compromise adversarial suite (Issue #673):** Added `test_agent_compromise_scenarios.rs`
  covering owner-only calls, victim withdrawals, storage mutation, pause/upgrade/pool retarget,
  arbitrary `TotalAssets` manipulation, and deposit front-running. Documented the threat model in
  `SECURITY.md`.
- **Formal verification of share accounting (Issue #672):** Extracted mint/burn/redeem math into
  the `share-math` crate, added Kani proofs for conservation, non-negative balances, monotonic
  exchange rate, round-trip value, and vault-favouring rounding. Wired `cargo kani -p share-math`
  into CI. Spec and maintenance process: `docs/FORMAL_VERIFICATION.md`.
- **WCAG 2.1 AA vault UI (Issue #668):** Keyboard access, skip link, ARIA labels, AA contrast,
  rem-based type, axe-core in Vitest. Spec: `docs/ACCESSIBILITY.md`.
- **Push notifications (Issue #669):** Web Push + PWA service worker, per-type preferences,
  batching, email fallback (Resend/SendGrid). Spec: `docs/NOTIFICATIONS.md`.
- **Cross-contract call surface audit (Issue #566):** Comprehensive table of all 8 external
  contract invocations across USDC Token, Blend Pool, and DEX Pool contracts in `ARCHITECTURE.md`.
- **Defense-in-depth reentrancy test suite (Issue #567):** Added `test_reentrancy_defense.rs` with
  a mock re-entrant token (`ReentrantMockToken`) asserting CEI ordering prevents double-withdrawals
  and share-accounting corruption.
- **Threat model & trust boundaries documentation (Issue #563):** Comprehensive threat model,
  visual trust-boundary diagram, actor capabilities matrix, and external call-site trust
  assumptions in `SECURITY.md`.
- **Stale-state audit & CEI enforcement (Issue #568):** Refactored `deposit`, `batch_deposit`,
  `withdraw`, `withdraw_all`, `rebalance`, and `update_total_assets` to enforce
  Checks-Effects-Interactions ordering. Regression suite `test_stale_state_audit.rs` and CI check
  script `scripts/check-stale-state-audit.sh` added.
- `harvest()` documented in README, ARCHITECTURE, SECURITY, and the state machine; dedicated
  idle/deployed asset breakdown tests added (Issues #499, #498, #501).
- DEX event snapshot tests for `DexSupplyEvent`, `DexWithdrawEvent`, and `DexPoolConfiguredEvent`
  (Issue #340).
- `ApprovalTtl` test coverage for the DEX supply path: default TTL, configured TTL, min/max bound
  rejection (Issue #341).
- GitHub issue templates as structured YAML forms (Issue #330).
- **DEX liquidity pool integration (Issue #228):** Vault can now deploy USDC to a Stellar DEX
  liquidity pool in addition to Blend, implementing the on-chain side of the Balanced/Growth
  strategies.
  - `set_dex_pool` / `get_dex_pool` owner-configurable `DataKey::DexPool`.
  - `supply_to_dex` / `withdraw_from_dex` internal helpers mirroring Blend.
  - `rebalance` now accepts the `"dex"` protocol symbol with `min_out` slippage protection.
  - New events: `DexSupplyEvent` (`dex_sup`), `DexWithdrawEvent` (`dex_wd`), `DexPoolConfiguredEvent` (`dex_cfg`).
  - New errors: `DexPoolNotConfigured` (#46), `OnlyOwnerCanSetDexPool` (#47).
  - See `docs/DEX_INTEGRATION.md`.

### Changed

- Migrated weak `!events.is_empty()` test assertions to strict payload checks (Issue #333).
- `deploy-devnet.sh` now writes `OWNER_ADDRESS` to `devnet-contracts.env` so
  `verify-deployment.sh` can run without missing-variable errors (Issue #298).
- Documented the `TotalDeposits` vs `TotalAssets` design decision in `lib.rs`,
  `ARCHITECTURE.md`, and `test_total_assets_cap.rs` (Issue #299).
- CHANGELOG.md tied to contract `Version` with PR template reminder (Issue #335).

### Security

- `initialize` now rejects the zero address for `deployer`, `owner`, `agent`, and `usdc_token`
  with dedicated `VaultError` codes 62–65 (Issue #434).
- `set_deposit_limits` now rejects a `max` above `MAX_DEPOSIT_CEILING` (100,000,000,000 raw
  units) via `VaultError::MaximumDepositExceedsCeiling` (code 66) (Issue #435).
- **Timelocked contract upgrade (Issue #316):** Instant `upgrade()` replaced by a two-step,
  timelocked flow — `schedule_upgrade` → 24 h wait → `execute_upgrade`, with `cancel_upgrade`
  as recovery path.
  - New storage keys `DataKey::PendingUpgradeHash` / `UpgradeTimelockExpiry`.
  - New events `UpgradeScheduledEvent` (`upg_sched`) and `UpgradeCancelledEvent` (`upg_cncl`).
  - Error codes 48–50: `TimelockAlreadyPending`, `NoTimelockPending`, `TimelockNotExpired`.
  - See `EVENTS.md`.
- **Shares-only balance accounting (Issue #184):** `DataKey::Balance(Address)` confirmed
  deprecated; `get_balance(user)` now derives principal purely from shares + exchange rate.
  `test_balance_shares_invariant.rs` asserts no drift between principal and shares.
- `set_rebalance_cooldown` now emits `RebalanceCooldownUpdatedEvent` (`reb_cd`) (Issue #436).
- `set_approval_ttl` now emits `ApprovalTtlUpdatedEvent` (`ttl_upd`) (Issue #437).
- Dedicated `TvlCapUpdatedEvent` / `UserDepositCapUpdatedEvent` replace `LimitsUpdatedEvent`
  for cap-only updates; indexer migration note in `EVENTS.md` (Issue #328).

---

## [1.0.0] — 2024-01-01

[1.0.0]: https://github.com/Shackole/NeuroWealth-Smartcontract/releases/tag/v1.0.0

> **Contract `Version`:** `1`

### Added

- Initial vault implementation with ERC-4626-inspired share accounting.
- `initialize(deployer, owner, agent, usdc_token, salt)` — anti-front-running deployment
  using a cryptographic deployer-salt commitment. Requires live `deployer.require_auth()`.
- `deposit(user, amount)` — deposit USDC and mint proportional vault shares.
- `withdraw(user, amount)` — burn shares and return USDC; partial withdrawals supported.
- `withdraw_all(user)` — burn all shares and return full proportional balance.
- `rebalance(agent, protocol, expected_apy, min_out)` — AI agent moves funds between yield
  strategies (`blend`, `dex`, `none`).
- `harvest(agent, min_out)` — AI agent withdraws accrued yield from `CurrentProtocol` and
  re-supplies it with slippage protection.
- `get_balance(user)` — read a user's current USDC balance derived from shares.
- `get_total_deposits()` — read total principal deposited (excludes yield).
- `get_exchange_rate()` — read current exchange rate (assets per share × 10,000,000).
- `get_idle_balance()` — USDC held in vault not yet deployed to a protocol.
- `get_deployed_assets()` — USDC currently supplied to the active protocol.
- `get_asset_breakdown()` — both figures in one call as `(idle, deployed)`.
- `preview_deposit_to_shares(amount)` — preview share mint for a given asset amount (rounds down).
- `preview_shares_to_assets(shares)` — preview asset return for a given share amount (rounds down).
- `preview_withdraw(amount)` — preview shares burned to withdraw assets (rounds up).
- `convert_to_shares(assets)` — ERC-4626 asset → share conversion (rounds down).
- `convert_to_assets(shares)` — ERC-4626 share → asset conversion (rounds down).
- `set_blend_pool(owner, pool_address)` / `get_blend_pool()` — configure Blend lending pool.
- `set_dex_pool(owner, pool_address)` / `get_dex_pool()` — configure DEX liquidity pool.
- `set_caps(owner, user_deposit_cap, tvl_cap)` — set both caps in a single transaction.
- `set_deposit_limits(owner, min, max)` — set per-transaction deposit floor and ceiling.
- `set_tvl_cap(owner, tvl_cap)` — set the maximum total TVL.
- `set_user_deposit_cap(owner, cap)` — set the maximum deposit amount per user.
- `set_limits(owner, user_deposit_cap, tvl_cap)` — **Deprecated**; use `set_caps` instead.
- `set_rebalance_cooldown(owner, interval)` / `get_rebalance_cooldown()` — minimum ledgers
  between `rebalance()` calls; `0` disables.
- `get_last_rebalance_ledger()` — ledger of the most recent successful `rebalance()`.
- `set_approval_ttl(owner, ttl)` / `get_approval_ttl()` — configure Blend/DEX token approval
  lifetime (bounded to 1,000–500,000 ledgers).
- `set_rate_limit(owner, category, max_calls, window_ledgers)` — fixed-window rate limits per
  call category; `max_calls == 0` disables.
- `set_max_batch_size(owner, size)` — maximum entries for `batch_deposit` (default 50).
- `batch_deposit(agent, deposits[])` — atomic multi-user deposit from the agent.
- `set_user_strategy(user, strategy)` / `get_user_strategy(user)` — store AI strategy preference
  (`conservative`, `balanced`, `growth`) on-chain; read by the off-chain agent.
- `transfer_ownership(owner, new_owner)` / `accept_ownership(pending_owner)` — two-step
  ownership transfer preventing accidental ownership loss.
- `schedule_upgrade(owner, new_wasm_hash)` / `execute_upgrade(owner)` / `cancel_upgrade(owner)`
  / `get_pending_upgrade()` — timelocked WASM upgrade flow (24 h, ~17,280 ledgers).
- `update_agent(owner, new_agent)` / `confirm_agent_update(owner)` / `cancel_agent_update(owner)`
  / `get_pending_agent_update()` — timelocked agent rotation (24 h, ~17,280 ledgers).
- `pause(owner)` / `unpause(owner)` / `is_paused()` — emergency pause blocks deposits,
  withdrawals, and rebalances.
- `touch_user_ttl(user)` — extend persistent `Shares(user)` entry TTL; returns `false` when no
  entry exists.
- `get_version()` — read the contract `DataKey::Version`.
- `UpgradedEvent` emits both `old_version` and `new_version` for on-chain auditability.
- Strict Checks-Effects-Interactions (CEI) pattern throughout to prevent reentrancy.
