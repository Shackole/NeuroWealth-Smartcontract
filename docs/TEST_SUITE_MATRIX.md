# Test suite and command matrix (Issue #465)

This inventory is based on the checked-in package manifests and workflow
commands. Run commands from the listed working directory. `npm ci` (or the
package's documented install command) is a prerequisite unless dependencies
are already installed. This file records commands; it does not imply that any
suite was run for this change.

## Repository and contract suites

| Suite | Working directory | Command | Prerequisites / scope | CI status |
|---|---|---|---|---|
| Soroban vault unit/property tests | `neurowealth-vault` | `cargo test --verbose` | Stable Rust and workspace dependencies. Includes contract tests under `contracts/vault/src/tests/` and workspace crate tests. No network credentials for normal local tests. | `ci.yml` matrix |
| Feature-gated Blend/DEX tests | `neurowealth-vault` | `cargo test -p neurowealth-vault --features blend-devnet` or `cargo test -p neurowealth-vault --features dex-devnet` | Contract test feature flags; follow the test module's documented local/testnet setup. | Optional local variants; not separate matrix entries |
| Root Mocha security tests | Repository root | `npm test` | Root `package.json`; Node.js and root npm dependencies. Runs `test/*.test.ts` only. It does not run agent, WhatsApp, frontend, or vault-ui suites. | Not in the `ci.yml` test matrix |
| Agent tests | `agent` | `npm test` | Node.js and agent dependencies; uses `ts-node`. The current script runs `openAiKeyManager.test.ts`, `rateLimiter.test.ts`, and `db.test.ts`; other `*.test.ts` files are not included by that script. | Not in the `ci.yml` test matrix |
| WhatsApp tests | `whatsapp` | `npm test` | Node.js and WhatsApp dependencies; exercises `webhook.test.ts` and `conversationFlow.test.ts`. Configure isolated test credentials/mocks as required by the fixtures; do not use a production Twilio account. | Not in the `ci.yml` test matrix |
| Playwright end-to-end | `frontend` | `npm run test:e2e` | `npm ci`; Playwright Chromium (`npx playwright install chromium`). `playwright.config.ts` starts the local Next.js dev server and uses mocked wallet helpers where the spec does so. Staging E2E additionally requires protected Vercel/Railway staging configuration and a testnet contract. | `staging.yml` after staging deploy; local use optional |
| Frontend axe accessibility scans | `frontend` | `npm run test:a11y` | `npm ci`; Playwright Chromium. Scans the configured pages for WCAG 2.1 A/AA axe violations. `npm run build` is run by the CI job before this command. | `ci.yml` accessibility job; no physical screen reader or keyboard judgment |

## Package suites

| Suite | Working directory | Command | Prerequisites / scope | CI status |
|---|---|---|---|---|
| Generated vault-client | `packages/vault-client` | `npm run typecheck && npm test` | Node.js/npm; `npm ci`. The test script builds the package then runs Node's test runner on `test/**/*.test.js`. | `ci.yml` matrix runs typecheck and test |
| Vault UI component and axe tests | `packages/vault-ui` | `npm test` | Node.js/npm and package dependencies (`npm install` is what the current CI step uses). Runs `vitest run`, including `src/a11y.test.tsx` and notification tests. | `ci.yml` matrix |
| Bridge | `packages/bridge` | Script declares `npm test` | No tracked test files are present, and its `workspace:*` dependency has no root workspace configuration. The declared command is not a runnable suite in the current checkout; add tests and a supported workspace/install setup before claiming coverage. | No test suite/job currently present |
| Monitoring | `packages/monitoring` | Script declares `npm test` | No tracked test files are present, and its `workspace:*` dependency has no root workspace configuration. The declared command is not a runnable suite in the current checkout; add tests and a supported workspace/install setup before claiming coverage. | No test suite/job currently present |
| Admin panel | `packages/admin-panel` | No test script is declared | Use build/lint review for changes until a test command is added. | No test job declared |

## Formal, fuzz, coverage, and interface checks

| Suite | Working directory | Command | Prerequisites / scope | CI status |
|---|---|---|---|---|
| Kani share-math proofs | Repository root | `cargo kani --manifest-path neurowealth-vault/Cargo.toml -p share-math` | Kani installed/configured for the Rust toolchain. No network secrets. | `ci.yml` Kani job |
| libFuzzer targets | `neurowealth-vault` | `cargo +nightly fuzz run <target> -- -runs=1000 -max_total_time=120` | Rust nightly and `cargo-fuzz`; CI targets are `deposit_withdraw_sequence`, `rebalance_transitions`, `rounding_boundaries`, `share_accounting_invariants`, and `agent_update_timelock`. Longer scheduled bound: `-runs=5000 -max_total_time=300`. | Conditional on contract-source PRs and scheduled workflow |
| Rust coverage | `neurowealth-vault` | `cargo llvm-cov --workspace --exclude share-math --lcov --output-path lcov.info --html --output-dir coverage-html -- --test-threads=1` | `cargo-llvm-cov` and LLVM tools. Runs Rust tests while collecting coverage. | `coverage.yml`; line threshold is enforced there |
| Contract spec consistency | Repository root | `python3 scripts/generate-spec.py && python3 scripts/validate-spec.py` | Python 3; source/spec review. This is an interface consistency check, not a test suite. | `contract-spec.yml` on contract paths/manual dispatch |
| Generated TypeScript drift | Repository root, after spec generation | `node scripts/generate-client.js && node scripts/bump-client-version.js` then inspect `git diff --exit-code -- contract-spec.json packages/vault-client/src/generated/vault.ts packages/vault-client/package.json packages/vault-client/package-lock.json` | Node.js and Python 3; do not hand-edit generated client output. | `contract-spec.yml` checks the generated files on PRs |

## CI and local-run boundaries

The workflow files are the source of truth for automated CI coverage:

- `ci.yml` runs the Rust workspace test job, vault-client typecheck/tests,
  vault-ui tests, frontend lint, Kani, and the conditional fuzz job. It also
  builds the WASM and runs static gates.
- `coverage.yml` independently runs Rust coverage and its threshold check.
- `contract-spec.yml` regenerates/validates contract metadata and typechecks
  the generated client when contract paths change or it is manually dispatched.
- `staging.yml` deploys to protected staging and runs browser E2E against that
  deployment. Its secrets and testnet contract are environment requirements.
- Root Mocha, agent, WhatsApp, bridge, and monitoring package tests have
  manifest commands but are not listed in the current `ci.yml` matrix.

Do not infer suite coverage from README badges or a package having a `test`
script. Conversely, a CI job only covers the command and paths shown in its
workflow. Keep this matrix aligned with package scripts and CI workflow edits.
