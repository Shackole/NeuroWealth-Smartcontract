# Coverage Exclusions

This document records which files and directories are excluded from the coverage threshold
checks in each test suite, and explains why.

---

## Rust / Soroban (`cargo-llvm-cov`)

The `cargo llvm-cov` command is run with `--workspace --exclude share-math`.

| Exclusion | Reason |
|-----------|--------|
| `share-math` crate | Separate mathematical verification library; covered by its own Kani proofs (see `docs/FORMAL_VERIFICATION.md`). |
| `fuzz/` targets | Fuzz targets are drivers, not production logic. They are excluded automatically because they are in a separate workspace member that is not part of `--workspace`. |
| `#[cfg(test)]` blocks | Test-only helpers are excluded from production coverage by the Rust compiler when not in test mode. |

The 80% threshold applies to `neurowealth-vault/contracts/vault/src/**`.

---

## Agent (Node.js / Jest)

Coverage is collected from `src/**/*.ts` with the following exclusions:

| Exclusion pattern | Reason |
|-------------------|--------|
| `src/**/*.test.ts` | Test files themselves should not count towards production coverage. |
| `src/**/*.d.ts` | TypeScript declaration files contain no executable code. |
| `src/index.ts` | Application entry-point wires together modules; it is an integration concern, not a unit-testable unit. |

The 80% threshold is enforced globally across `lines` and `functions` via Jest's `coverageThreshold`.

---

## Frontend (Next.js / Vitest)

Coverage is collected from all source files under `src/` with the following exclusions:

| Exclusion pattern | Reason |
|-------------------|--------|
| `.next/**` | Next.js build output — generated, not authored code. |
| `node_modules/**` | Third-party dependencies. |
| `src/app/globals.css` | CSS file; not JavaScript/TypeScript. |
| `postcss.config.js`, `tailwind.config.js`, `next.config.js`, `vitest.config.ts` | Build/tool configuration files. |
| `src/**/*.d.ts` | TypeScript declaration files — no executable code. |
| `src/**/*.test.{ts,tsx}`, `src/**/*.spec.{ts,tsx}` | Test files themselves. |
| `src/i18n/**` | Thin i18n request wrapper; its only logic is framework-plumbing not under test. |

The 80% threshold is enforced across `lines` and `functions` via `vitest.config.ts` → `coverage.thresholds`.

---

## Changing thresholds

If a justified decrease is needed (e.g., new generated code added to a tracked path), update
the relevant configuration and document the reason here in the same PR. Silently dropping the
threshold without documentation is not permitted.
