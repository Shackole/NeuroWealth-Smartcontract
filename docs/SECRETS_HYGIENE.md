# Secrets Hygiene (#605, #115)

This document records the full-history secret scan of this repository, the
triage of its findings, and the enforcement in place to prevent future leaks
of Stellar secret seeds (`S...`), API keys, and other credentials.

## Full-history scan

- **Tool:** [gitleaks](https://github.com/gitleaks/gitleaks) v8.30.1, default
  ruleset plus the repo config in [`.gitleaks.toml`](../.gitleaks.toml)
  (adds project-specific rules for Stellar keys, AWS credentials, GCP keys,
  JWT secrets, and private keys).
- **Scope:** entire git history (260 commits, ~174 MB scanned), all branches
  reachable from `main`.
- **Command:** `gitleaks git --redact -v .`

### Findings and triage

| # | Finding | Location | Triage | Rotation needed |
|---|---------|----------|--------|-----------------|
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

## Enforcement

Three independent layers keep secrets out of the repository going forward:

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

### 2. Dedicated CI workflow (`secret-scan.yml`)

The dedicated workflow in
[`.github/workflows/secret-scan.yml`](../.github/workflows/secret-scan.yml)
provides the primary secret-scanning gate. It runs on:

| Trigger | Jobs run |
|---------|----------|
| Every PR targeting `main`, `develop`, `feat/**`, `fix/**`, `release/**` | `gitleaks-scan` (PR diff + history) |
| Every push to `main` / `develop` | `gitleaks-scan` |
| Weekly schedule (Monday 04:00 UTC) | `gitleaks-scan` + `full-history-scan` |
| Manual (`workflow_dispatch`) | `gitleaks-scan` + `full-history-scan` |

**How findings are reported:**

- `gitleaks/gitleaks-action@v2` annotates the PR check with the exact
  **file path** and **line number** of each finding.
- A SARIF report is uploaded as a workflow artifact (retained 30 days) for
  deep-link analysis.
- The workflow step summary explains immediate remediation steps.
- On any finding, the `notify-security` job posts a Slack alert to the
  security channel (see [Slack alerting](#slack-alerting) below).

**Full-history job** (`full-history-scan`): runs on the weekly schedule and
manual dispatch. Scans the entire git history and opens (or updates) a
GitHub Issue if a finding is detected, so incidents surfaced outside of PR
context are still tracked.

### 3. Basic CI gate (`ci.yml`)

The `secret-scan` job in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) provides a
secondary, lightweight gate on every push and PR. Both jobs must pass before
a PR can merge.

## Slack alerting

When `gitleaks-scan` fails, the `notify-security` job sends a message to the
security Slack channel configured via the `SECURITY_SLACK_WEBHOOK_URL` secret.

Set this secret in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `SECURITY_SLACK_WEBHOOK_URL` | Incoming webhook URL for the `#security-alerts` channel |

The alert includes the repository name, branch/ref, triggering actor, and a
direct link to the failing workflow run.

## Quarterly false-positive review {#quarterly-review}

The allowlist in `.gitleaks.toml` and fingerprints in `.gitleaksignore` must
be reviewed **every quarter** (January, April, July, October) to ensure:

1. No entry has become stale (pattern no longer present in codebase).
2. No entry incorrectly suppresses a real credential.
3. New rules from upstream gitleaks releases are evaluated for applicability.

**Review checklist:**

- [ ] Read every entry in `[allowlist]` and `[[rules.allowlist]]` blocks in
  `.gitleaks.toml`; confirm each is still justified.
- [ ] Read every fingerprint in `.gitleaksignore`; confirm each is still a
  known false positive.
- [ ] Run `gitleaks git --redact -v .` locally and verify zero real findings.
- [ ] Check the upstream gitleaks [CHANGELOG](https://github.com/gitleaks/gitleaks/releases)
  for new rules relevant to this project.
- [ ] Update the "Last reviewed" date below.

**Last reviewed:** 2026-09-27 (initial setup)

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
  rule or expanding an allowlist path more than necessary.
- AWS keys, GCP service account JSON, and database URLs with passwords are
  covered by rules in `.gitleaks.toml`. Store them in Railway/environment
  secrets, never in source code or configuration files.
