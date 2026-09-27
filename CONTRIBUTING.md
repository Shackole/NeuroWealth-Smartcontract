# Contributing to NeuroWealth

Thank you for your interest in contributing to NeuroWealth! We welcome contributions from everyone.

This guide covers environment setup, coding conventions, testing, and the PR review process.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Good First Issues](#good-first-issues)
- [Reporting Issues](#reporting-issues)
- [Development Environment Setup](#development-environment-setup)
  - [Prerequisites](#prerequisites)
  - [Smart Contract Setup](#smart-contract-setup)
  - [Backend / Agent Setup](#backend--agent-setup)
  - [Frontend Setup](#frontend-setup)
- [Building the Contract](#building-the-contract)
- [Running Tests](#running-tests)
  - [Smart Contract Tests](#smart-contract-tests)
  - [Running Individual Tests and Test Modules](#running-individual-tests-and-test-modules)
  - [Common Test Failures](#common-test-failures)
  - [Running Fuzz Tests](#running-fuzz-tests)
  - [Backend and Frontend Tests](#backend-and-frontend-tests)
- [E2E Devnet Tests](#e2e-devnet-tests)
- [CI Requirements](#ci-requirements)
- [Coding Standards](#coding-standards)
- [Branch Naming Convention](#branch-naming-convention)
- [Commit Message Format](#commit-message-format)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [PR Review SLA and Approval Requirements](#pr-review-sla-and-approval-requirements)
- [Updating CHANGELOG.md](#updating-changelogmd)

---

## Code of Conduct

By participating in this project you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.
We are committed to a welcoming, respectful, and inclusive environment.

---

## Good First Issues

If you're new to the project, a great place to start is our
[good first issues](https://github.com/Shackole/NeuroWealth-Smartcontract/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22).
These are typically smaller, well-scoped tasks that help you get familiar with the codebase.

---

## Reporting Issues

We use standardised issue templates. Choose the right template below:

### Bug Reports

Use the [bug report template](/.github/ISSUE_TEMPLATE/bug_report.md) when:
- You have found a defect in the smart contract, backend, or frontend.
- You have encountered unexpected behaviour with a reproducible test case.

Provide: Soroban network context, contract ID, affected function, steps to
reproduce, expected vs. actual behaviour, and CLI output.

### Feature Requests

Use the [feature request template](/.github/ISSUE_TEMPLATE/feature_request.md)
when proposing new capabilities, enhancements, or architecture improvements.

### Security Issues

**Do not open a public issue for security vulnerabilities.** Follow the
[Security Policy](SECURITY.md) and report via GitHub's private security
advisory system. We triage security reports within 48 hours.

### Issue Labels

| Label | Meaning |
|---|---|
| `bug` | Something is broken |
| `enhancement` | New feature or request |
| `documentation` | Docs improvements |
| `good first issue` | Suitable for newcomers |
| `security` | Security-related issues |
| `help wanted` | Extra attention needed |

---

## Development Environment Setup

### Prerequisites

Install all tools listed here **before** running any build or test command.
Version mismatches are the most common cause of local-vs-CI failures.

#### Smart contract development

| Tool | Required version | Install |
|---|---|---|
| **Rust** (stable) | ≥ 1.78.0 | [rustup.rs](https://rustup.rs/) |
| **WASM target** | `wasm32-unknown-unknown` | `rustup target add wasm32-unknown-unknown` |
| **Stellar CLI** | **21.2.0** (pinned in [`.stellar-version`](.stellar-version)) | see below |
| **cargo-deny** | latest | `cargo install --locked cargo-deny` |
| **cargo-fuzz** | latest (nightly) | `cargo +nightly install cargo-fuzz --locked` |
| **Kani** | latest | [kani-verifier.org](https://model-checking.github.io/kani/install-guide.html) |

Install the pinned Stellar CLI:

```bash
STELLAR_VERSION=$(cat .stellar-version | tr -d '[:space:]')
cargo install --locked stellar-cli --version "$STELLAR_VERSION" --features opt
stellar --version   # must print "stellar 21.2.0"
```

#### Backend / Agent development

| Tool | Required version | Install |
|---|---|---|
| **Node.js** | LTS (≥ 20.x) | [nodejs.org](https://nodejs.org/) or `nvm install --lts` |
| **npm** | ≥ 10.x | bundled with Node.js |

#### Frontend development

| Tool | Required version |
|---|---|
| **Node.js** | LTS (≥ 20.x) |
| **npm** | ≥ 10.x |

#### Optional tooling

| Tool | Purpose |
|---|---|
| **Docker** | Run a local Stellar quickstart node; deterministic WASM builds |
| **jq** | Parse JSON output from CLI commands |
| **Python 3** | Run spec-validation and storage-layout scripts |

---

### Smart Contract Setup

```bash
# 1. Clone the repository
git clone https://github.com/Shackole/NeuroWealth-Smartcontract.git
cd NeuroWealth-Smartcontract

# 2. Verify the Rust toolchain
rustc --version
rustup target list --installed | grep wasm32   # must show wasm32-unknown-unknown

# 3. Check Stellar CLI version matches the pin
stellar --version   # stellar 21.2.0

# 4. Build the smart contract
cd neurowealth-vault
stellar contract build
# Output WASM: target/wasm32-unknown-unknown/release/neurowealth_vault.wasm
```

---

### Backend / Agent Setup

```bash
# From the repo root
cd agent        # (planned directory — not yet in repo)
npm install
cp .env.example .env
# Edit .env with your Stellar key, Claude/OpenAI key, and database URL
npm run dev
```

---

### Frontend Setup

```bash
# From the repo root
cd frontend     # (planned directory — see README.md Planned Components)
npm install
cp .env.local.example .env.local
# Edit .env.local with your RPC URL and contract ID
npm run dev
# Open http://localhost:3000
```

---

## Building the Contract

```bash
cd neurowealth-vault
stellar contract build
```

The compiled WASM is written to:
```
neurowealth-vault/target/wasm32-unknown-unknown/release/neurowealth_vault.wasm
```

---

## Running Tests

Always run the full test suite before opening a PR.

### Smart Contract Tests

```bash
cd neurowealth-vault
cargo test
```

Run with all feature flags (matches CI exactly):

```bash
cargo test -p neurowealth-vault --all-features
```

### Running Individual Tests and Test Modules

All vault tests live under `contracts/vault/src/tests/` and are compiled as
library unit tests. Their full path prefix is `comprehensive_tests::`.

#### Run a single test

```bash
# Substring match — runs any test whose full path contains this string
cargo test test_confirm_before_timelock_rejected

# Exact match (useful when one name is a prefix of another)
cargo test comprehensive_tests::test_agent_timelock::test_cancel_clears_pending_agent -- --exact
```

#### Run a single test module

```bash
# All tests in test_deposit.rs
cargo test comprehensive_tests::test_deposit::

# Only the upgrade-timelock module
cargo test comprehensive_tests::test_upgrade_timelock::
```

#### Useful flags

```bash
# List every test without running any
cargo test -- --list

# Show stdout/stderr from passing tests
cargo test test_deposit -- --nocapture

# Run serially (required for some stress/ordering-sensitive tests)
cargo test -- --test-threads=1
```

#### Run tests with feature flags

Two optional feature flags gate production-interface pool tests.
Without the flag the module compiles to nothing and is silently skipped.

```bash
# Blend production-interface tests
cargo test -p neurowealth-vault --features blend-devnet

# DEX production-interface tests
cargo test -p neurowealth-vault --features dex-devnet

# Everything at once (run before pushing — Clippy CI uses --all-features)
cargo test -p neurowealth-vault --all-features
```

### Common Test Failures

| Symptom | Cause | Fix |
|---|---|---|
| ``error: no test target named `test_deposit` `` | Tests are library unit-test modules, not integration binaries. | Filter by module path: `cargo test comprehensive_tests::test_deposit::` |
| `0 passed; N filtered out` | Filter typo or feature-gated module. | Run `cargo test -- --list`; add `--features blend-devnet` or `dex-devnet` if needed. |
| Feature-gated tests appear not to exist | File is `cfg`'d out entirely without the flag. | Pass the matching `--features` flag. |
| `expected "Error(Contract, #41)"` wrong code | A different guard fired first, or error codes shifted. | Look up the discriminant in `VaultError` enum in `lib.rs`. |
| `test_budget.rs` fails on CPU/memory | Operation exceeded a ledger-resource ceiling. | Check baselines in [ARCHITECTURE.md](ARCHITECTURE.md). Raise or reduce the cost in the same PR. |
| Passes individually, fails in full run | Ordering/timing-sensitive stress test. | Reproduce with `--test-threads=1`. |
| `cargo fmt` fails in CI | Formatting drift. | Run `cargo fmt --all` and commit. |
| Clippy fails in CI but passes locally | CI runs `--all-targets --all-features -D warnings`; local run skips gated code. | Reproduce the exact CI command locally. |
| `stellar contract build` fails | Missing `wasm32-unknown-unknown` target or CLI version mismatch. | `rustup target add wasm32-unknown-unknown`; reinstall pinned CLI version. |
| `cargo fuzz` not recognised | Nightly toolchain and `cargo-fuzz` not installed. | `rustup toolchain install nightly && cargo +nightly install cargo-fuzz --locked` |

### Running Fuzz Tests

The vault's deposit/withdraw share-accounting logic is covered by a
[libFuzzer](https://llvm.org/docs/LibFuzzer.html) harness located at
`neurowealth-vault/fuzz/fuzz_targets/deposit_withdraw_sequence.rs`.

#### Prerequisites

```bash
rustup toolchain install nightly
cargo +nightly install cargo-fuzz --locked
```

#### Run locally

```bash
cd neurowealth-vault

# Quick smoke-run (~30 seconds, good for local iteration)
cargo +nightly fuzz run deposit_withdraw_sequence -- -runs=500 -max_total_time=30

# Longer run matching CI PR bounds
cargo +nightly fuzz run deposit_withdraw_sequence -- -runs=1000 -max_total_time=120

# Full weekly-schedule run
cargo +nightly fuzz run deposit_withdraw_sequence -- -runs=5000 -max_total_time=300
```

> **When to run:** CI triggers the fuzzer automatically on PRs that touch
> `neurowealth-vault/contracts/vault/src/**`. Run the smoke command locally
> before pushing any share-accounting change.

If the fuzzer finds a crash, reproduce it with:

```bash
cargo +nightly fuzz run deposit_withdraw_sequence \
  fuzz/artifacts/deposit_withdraw_sequence/<crash-file>
```

#### CI bounds

| Trigger | Bounds |
|---|---|
| PR touching `neurowealth-vault/contracts/vault/src/**` | `-runs=1000 -max_total_time=120` |
| Weekly schedule (`0 3 * * 0`) | `-runs=5000 -max_total_time=300` |

### Backend and Frontend Tests

```bash
# From the repo root
npm test
```

This runs the TypeScript off-chain security tests (`test/`) and any
`packages/vault-ui` axe-core / notification unit tests.

---

## E2E Devnet Tests

For the full end-to-end devnet test guide, including prerequisites, step-by-step
setup, individual scenario commands, and troubleshooting, see
[`scripts/README-E2E.md`](scripts/README-E2E.md).

Quick start:

```bash
cp .env.devnet.template .env.devnet
# Edit .env.devnet — set SOROBAN_SECRET_KEY to a funded testnet key

cd neurowealth-vault && stellar contract build && cd ..
./scripts/deploy-devnet.sh
./scripts/e2e-devnet.sh
```

---

## CI Requirements

Our CI pipeline (`.github/workflows/ci.yml`) runs on every push and pull request.
**All checks must pass before a PR can be merged.**

| Check | Command |
|---|---|
| Format | `cargo fmt --all -- --check` |
| Clippy lint | `cargo clippy --all-targets --all-features -- -D warnings` |
| Unit tests | `cargo test --verbose` |
| Build WASM | `stellar contract build` |
| Dependency audit | `cargo deny --manifest-path neurowealth-vault/Cargo.toml check --config deny.toml` |
| Fuzz tests (conditional) | Triggered on PRs touching `contracts/vault/src/**`; `–runs=1000 –max_total_time=120` |
| Kani proofs | `cargo kani -p share-math` (see [`docs/FORMAL_VERIFICATION.md`](docs/FORMAL_VERIFICATION.md)) |
| Vault UI tests | `packages/vault-ui` `npm test` (axe-core WCAG 2.1 AA + notification unit tests) |
| Public-function auth gate | `scripts/check-pub-fn-auth.sh` — every new state-changing function must have a `SECURITY.md` row |

### Adding a new state-changing function

When you add a new `pub fn` that modifies state, you must do **both** of the
following in the **same PR**:

1. Add a row to the Access Control Summary table in `SECURITY.md`.
2. Update `contract-spec.json` with `"state_changing": true`, the correct
   `"access"` value, and `"requires_auth": true/false`.

### Dependency Audit & Advisory Exceptions

To reproduce the audit locally:

```bash
cargo install --locked cargo-deny
cargo deny --manifest-path neurowealth-vault/Cargo.toml check --config deny.toml
```

For a time-limited advisory exception, add an `[[advisories.ignore]]` entry to
[`deny.toml`](deny.toml) with the RustSec `id`, affected `crate`, and a `reason`
linking to a tracking issue. Exceptions are reviewed every sprint.

---

## Coding Standards

- **Error messages:** Follow the [Error Message Style Guide](ERROR_STYLE_GUIDE.md).
- **Architecture:** Ensure changes align with [ARCHITECTURE.md](ARCHITECTURE.md).
- **Events:** Every state change must emit a corresponding event per [EVENTS.md](EVENTS.md).
- **Arithmetic:** Always use `checked_*` operations for financial calculations.
- **CEI pattern:** Enforce Checks-Effects-Interactions in all state-changing functions (see [SECURITY.md](SECURITY.md)).
- **Access control:** Every new state-changing function needs an auth guard and a `SECURITY.md` entry.

---

## Branch Naming Convention

Use one of the following prefixes:

| Prefix | Use for |
|---|---|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `docs/` | Documentation-only changes |
| `chore/` | Maintenance, tooling, CI |
| `security/` | Security fixes or hardening |
| `test/` | Adding or improving tests |
| `refactor/` | Code refactoring without behaviour change |

**Format:** `<prefix>/issue-<number>-short-description`

Examples:

```
feature/issue-228-dex-liquidity-integration
fix/issue-434-reject-zero-address-on-init
docs/issue-69-changelog-keep-a-changelog
chore/issue-330-github-issue-templates
```

---

## Commit Message Format

We use the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
specification.

### Format

```
<type>(<scope>): <short summary>

[optional body]

[optional footer — e.g. "Closes #N" or "BREAKING CHANGE: ..."]
```

### Types

| Type | Use for |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting (no logic change) |
| `refactor` | Refactoring (no feature or fix) |
| `test` | Adding or updating tests |
| `chore` | Build process, tooling, CI |
| `security` | Security fix or hardening |
| `perf` | Performance improvement |

### Scope (optional)

Scope narrows to the area changed: `vault`, `agent`, `frontend`, `ci`, `deps`, etc.

### Examples

```
feat(vault): add rebalance cooldown to prevent rapid protocol switches

Adds MinRebalanceInterval and LastRebalanceLedger storage keys.
The cooldown can be set via set_rebalance_cooldown(owner, interval).
Setting interval to 0 disables the guard.

Closes #59
```

```
fix(vault): reject zero address on initialize for all role params

Prevents a vault being deployed with a burned deployer, owner, agent,
or usdc_token address. Adds VaultError codes 62-65.

Closes #434
```

```
docs: back-fill CHANGELOG.md with keep-a-changelog format

Closes #69
```

### Breaking changes

Prefix the footer with `BREAKING CHANGE:` and describe the impact:

```
feat(vault): replace instant upgrade() with timelocked schedule/execute flow

BREAKING CHANGE: The upgrade() entrypoint has been removed. Callers must
use schedule_upgrade() + execute_upgrade() with a 24-hour timelock.
See ARCHITECTURE.md — Upgrade Safety for migration steps.

Closes #316
```

---

## Submitting a Pull Request

1. **Fork and branch** from `main` using the naming convention above.
2. **Make your changes**, adding or updating tests as needed.
3. **Verify locally:**
   ```bash
   cd neurowealth-vault
   cargo fmt --all
   cargo clippy --all-targets --all-features -- -D warnings
   cargo test --verbose
   ```
4. **Update CHANGELOG.md** — add your changes under `[Unreleased]` (see
   [Updating CHANGELOG.md](#updating-changelogmd)).
5. **Update `SECURITY.md` and `contract-spec.json`** if you added a
   state-changing function.
6. **Commit** using the Conventional Commits format above.
7. **Push your branch** and open a Pull Request against `main`.
8. **Fill in the PR template** — describe what changed, why, and what was tested.

### PR description checklist

- [ ] Summary of what changed and why
- [ ] Link to the related issue (`Closes #N`)
- [ ] Tests added or updated
- [ ] CHANGELOG.md updated under `[Unreleased]`
- [ ] SECURITY.md + contract-spec.json updated (if new state-changing function)
- [ ] `cargo test --verbose` passes locally
- [ ] `cargo fmt --all` applied
- [ ] `cargo clippy --all-targets --all-features -- -D warnings` passes

---

## PR Review SLA and Approval Requirements

| Requirement | Policy |
|---|---|
| **Minimum approvals** | **1 reviewer** for documentation and chore PRs; **2 reviewers** for contract logic, security, or dependency changes |
| **Security-related PRs** | Requires review from a maintainer with a `security` label on their GitHub profile |
| **Review SLA** | First review response within **48 hours** of PR opening on business days |
| **Merge SLA** | Approved PRs are merged within **72 hours** of the final approval, assuming CI is green |
| **Stale PRs** | PRs with no activity for **14 days** are labelled `stale` and may be closed after a further 7 days |
| **Force-push policy** | Rebase or squash only; no force-push to `main`. Amend only your own un-reviewed commits. |

Reviewers focus on: correctness, security, test coverage, and alignment with
[ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).

---

## Updating CHANGELOG.md

We follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.
The version number in each release header matches the `DataKey::Version`
stored on-chain.

### Rules

1. **Add entries under `[Unreleased]`**, never under a released version.
2. Use one of the standard sub-sections: **Added**, **Changed**, **Deprecated**,
   **Removed**, **Fixed**, **Security**.
3. Every entry must reference the issue number: `(Issue #N)`.
4. Mark breaking changes explicitly: prefix with `**BREAKING:**`.
5. If your PR bumps `get_version()`, note the new version value in the entry.

### Example entry

```markdown
## [Unreleased]

### Added

- `set_rebalance_cooldown(owner, interval)` and `get_rebalance_cooldown()` allow
  the owner to configure a minimum ledger interval between consecutive `rebalance()`
  calls; `0` disables the guard (Issue #59).

### Security

- `initialize` now rejects the zero address for all four role parameters
  (`deployer`, `owner`, `agent`, `usdc_token`) with `VaultError` codes 62–65,
  preventing a vault from being deployed with a burned address (Issue #434).
```

---

By contributing, you agree that your contributions will be licensed under the
project's open-source license.
