# Secrets Hygiene (#605, #77)

This document records the full-history secret scan of this repository, the
triage of its findings, and the enforcement now in place to prevent future
leaks of Stellar secret seeds (`S...`) and `.env` contents.

## Full-history scan

- **Tool:** [gitleaks](https://github.com/gitleaks/gitleaks) v8.30.1, default
  ruleset plus the repo config in [`.gitleaks.toml`](../.gitleaks.toml)
  (adds a `stellar-secret-key` rule for `S` + 55 base32 characters).
- **Scope:** entire git history (260 commits, ~174 MB scanned), all branches
  reachable from `main`.
- **Command:** `gitleaks git --redact -v .`

### Findings and triage

| # | Finding | Location | Triage | Rotation needed |
|---|---------|----------|--------|------------------|
| 1 | `generic-api-key`: `ETHEREUM_USDC_TOKEN_ADDRESS` | `packages/bridge/.env.example` @ `9e8ebfd` | **False positive.** The value is the *public* Ethereum mainnet USDC token contract address, not a credential. Suppressed by fingerprint in [`.gitleaksignore`](../.gitleaksignore). | No |
| 2 | Stellar-format seeds (e.g. `SDAKFNYE…`, `SOWQ3GLR…AAAA…`) | vendored `packages/vault-client/node_modules/@stellar/stellar-base/**` in historical commits `a3e0617` / `147069a` | **Not project secrets.** These are the Stellar SDK's own published documentation/test example seeds inside an accidentally committed `node_modules` tree (since removed from the working tree). They are public upstream. The `stellar-secret-key` rule allowlists `node_modules/` paths. | No |

**Conclusion:** no live project credentials were found anywhere in history.
Nothing required rotation. `scripts/deploy-devnet.sh` reads keys from the
environment at runtime and no invocation ever committed a real seed.

If a future scan *does* find a real seed: treat it as compromised
immediately (history rewrite does not un-leak it), rotate the key, move any
funds/authority off the account, and follow
[`docs/AGENT_KEY_COMPROMISE_RUNBOOK.md`](AGENT_KEY_COMPROMISE_RUNBOOK.md)
for agent keys.

## Developer Education

### What counts as a secret

The following must **never** be committed to the repository:

| Category | Examples |
|----------|---------|
| Private / secret keys | Stellar secret seeds (`S…`), Ethereum private keys (`0x…`), SSH private keys |
| API keys & tokens | Twilio auth tokens, OpenAI API keys, GitHub PATs, Supabase service-role keys |
| Passwords & passphrases | Database passwords, wallet passphrases, admin credentials |
| JWTs with embedded credentials | Signed tokens that encode service credentials or long-lived session tokens |
| Connection strings with credentials | `postgresql://user:password@host/db`, `redis://:password@host` |
| Webhook secrets | Twilio webhook signing secrets, GitHub webhook secrets |

### Where to store secrets

| Environment | Recommended storage |
|-------------|-------------------|
| Local development | `.env` file (git-ignored); never committed |
| CI/CD (GitHub Actions) | [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) — referenced as `${{ secrets.MY_SECRET }}` |
| Production (Railway / Render) | Platform environment variables set via the dashboard or CLI, never in config files |
| Production (self-hosted / VPS) | [HashiCorp Vault](https://www.vaultproject.io/) or [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) with IAM-scoped access |
| Shared team secrets | A secrets manager (HashiCorp Vault, AWS Secrets Manager, 1Password Teams) — not a shared `.env` file in Slack |

### What does NOT count as a secret

These values are public and safe to commit:

| Value | Why it is safe |
|-------|---------------|
| Stellar public keys (`G…`) | Derived from the secret seed; cannot be used to sign transactions |
| USDC / XLM token contract addresses | Public on-chain addresses; no signing capability |
| Stellar network passphrases | e.g. `Test SDF Network ; September 2015` — these are well-known public strings |
| Stellar RPC / Horizon URLs | Public endpoints (e.g. `https://soroban-testnet.stellar.org`); no credentials embedded |
| Public Ethereum contract addresses | e.g. USDC on mainnet `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| SDK documentation / test example keys | Keys published in the Stellar SDK docs as illustrative examples |

When in doubt, ask: *"Does this value give signing authority or grant API access?"* If yes, treat it as a secret.

## Allowed patterns / false-positive register

Gitleaks may flag values that look like secrets but are intentionally public or
test-only. Before adding a new suppression, confirm it belongs to one of these
categories and document it here **and** in [`.gitleaksignore`](../.gitleaksignore).

| Pattern | Where used | Rule triggered | Justification | `.gitleaksignore` fingerprint required? |
|---------|-----------|---------------|---------------|-----------------------------------------|
| Stellar SDK documentation seeds (e.g. `SDAKFNYEZEKWIQK2ZJYNFYEKDXHZ7BHM5M7HOCW6VFXDVNWFBZCFABSC`) | `packages/vault-client/node_modules/@stellar/stellar-base/` | `stellar-secret-key` | Published upstream example keys; not project credentials. Path allowlisted via `node_modules/` rule in `.gitleaks.toml`. | No (path rule covers it) |
| Stellar test/unit-test keys derived from SDK docs | `neurowealth-vault/contracts/vault/src/tests/` | `stellar-secret-key` | Deterministic test accounts only; zero-funded on mainnet. Add individual fingerprints per file if flagged. | Yes (per occurrence) |
| Public USDC token contract address on Ethereum (`0xA0b86…`) | `packages/bridge/.env.example` | `generic-api-key` | Public mainnet contract address; no signing capability. Fingerprint `9e8ebfd…` already suppressed. | Yes (already added) |
| Stellar network passphrases | Any config or test file | `generic-api-key` | Well-known public strings (`Test SDF Network ; September 2015`, `Public Global Stellar Network ; September 2015`). | Yes (per occurrence) |
| Public Soroban RPC / Horizon endpoint URLs | Any config file | `url-credentials` (if triggered) | No credentials embedded; fully public endpoints. | Yes (per occurrence) |

To add a new suppression:

1. Run `gitleaks git --redact -v . 2>&1 | grep Fingerprint` to get the fingerprint.
2. Add it to `.gitleaksignore` with a comment: `# <reason> — approved by <author> on <date>`.
3. Add a row to the table above.
4. Open a PR so the addition is reviewed.

## Enforcement

Two independent layers keep secrets out of the repository going forward:

### 1. Pre-commit hook (developer machines)

[`scripts/pre-commit-gitleaks.sh`](../scripts/pre-commit-gitleaks.sh) scans
**staged** changes with the repo ruleset and blocks the commit on any hit.
Install it once per clone:

```bash
ln -sf ../../scripts/pre-commit-gitleaks.sh .git/hooks/pre-commit
```

The hook fails closed: if `gitleaks` is not installed it refuses the commit
rather than silently skipping the scan (`brew install gitleaks` /
`go install github.com/gitleaks/gitleaks/v8@latest`).

### 2. CI gate (all pull requests and pushes)

The `secret-scan` job in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs
`gitleaks/gitleaks-action@v2` with full history (`fetch-depth: 0`) on every
PR targeting `main`/`develop`, every push to those branches and `feat/**`,
and the weekly scheduled run — so a leak that slips past a developer's
hooks is still caught before merge, and the whole history is re-swept
weekly as rules improve.

### 3. detect-secrets pre-commit alternative

[detect-secrets](https://github.com/Yelp/detect-secrets) is a Python-based
alternative to gitleaks for pre-commit scanning. It uses a **baseline file**
(`.secrets.baseline`) to track known false positives, making it easier to
manage suppressions in large codebases. Use it as a drop-in alternative or
alongside gitleaks.

**Install:**

```bash
pip install detect-secrets
# or, with pipx for isolation:
pipx install detect-secrets
```

**Create the initial baseline** (audit existing content so the hook only
catches *new* secrets going forward):

```bash
# Scan the repo and write the baseline; review the output carefully
detect-secrets scan --all-files > .secrets.baseline

# Audit each finding interactively and mark false positives
detect-secrets audit .secrets.baseline
```

Commit `.secrets.baseline` to the repository so all contributors share the
same approved-false-positive set.

**Install as a pre-commit hook** (using the
[pre-commit framework](https://pre-commit.com/)):

Add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0          # pin to a specific release
    hooks:
      - id: detect-secrets
        args: ["--baseline", ".secrets.baseline"]
        exclude: package-lock\.json|yarn\.lock|Cargo\.lock
```

Then install the hooks:

```bash
pre-commit install
```

**Update the baseline** after a legitimate change (e.g., adding a new
`.env.example` placeholder):

```bash
detect-secrets scan --all-files --baseline .secrets.baseline
detect-secrets audit .secrets.baseline   # re-audit any new findings
```

**Choosing between gitleaks and detect-secrets:**

| Concern | gitleaks | detect-secrets |
|---------|----------|---------------|
| Scans full git history | ✅ Yes | ❌ Staged files / working tree only |
| Entropy-based detection | Partial | ✅ Strong |
| Baseline / allowlist UX | `.gitleaksignore` fingerprints | `.secrets.baseline` JSON (auditable) |
| Language | Go (single binary) | Python |
| Pre-commit framework integration | Via shell script | Native hook |

For this project, **gitleaks is the primary gate** (full-history CI scan +
pre-commit shell hook). detect-secrets is a recommended secondary layer for
developers who prefer the baseline workflow or already use the pre-commit
framework.

## Rules of thumb

- Never commit `.env` files; commit `*.env.template` / `.env.example` files
  containing placeholders only.
- Stellar secret seeds belong in environment variables or a secrets
  manager, never in scripts, fixtures, or docs — use the SDK's published
  example keys if documentation needs one.
- Do not commit `node_modules/` (it is what dragged third-party example
  seeds into this repo's history).
- Suppress a false positive by adding its *fingerprint* to
  `.gitleaksignore` with a comment justifying it — never by weakening a
  rule.
- When adding a new suppression, also add it to the
  [Allowed patterns / false-positive register](#allowed-patterns--false-positive-register)
  above so the decision is documented and reviewable.
