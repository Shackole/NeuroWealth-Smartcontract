# Dependency Security and Update Policy

## Automated checks

`.github/workflows/dependency-audit.yml` runs on every pull request, pushes to
protected development branches, weekly, and by manual dispatch:

- `rustsec/audit-check@v2.0.0` audits `neurowealth-vault/Cargo.lock`.
  Vulnerability findings fail the job, including high and critical RustSec
  advisories.
- `npm audit --audit-level=high` runs after `npm ci` for `agent`, `frontend`,
  `packages/vault-client`, and `packages/vault-ui`. High and critical findings
  fail the job.
- `cargo-deny` remains the license, source, yanked-crate, and advisory-policy
  gate in the main CI workflow and uses the allow-list in `deny.toml`.

The `bridge`, `admin-panel`, `monitoring`, and `whatsapp` packages currently
use `workspace:*` dependencies and do not have npm lockfiles. npm cannot create
a standalone lockfile for those packages (`EUNSUPPORTEDPROTOCOL`), so they are
not represented as reproducible `npm audit` jobs yet. Before treating them as
production dependency gates, convert them to a supported workspace/package
manager layout, commit lockfiles, and add them to the npm audit matrix.

## Weekly updates and auto-merge

`.github/dependabot.yml` opens weekly Cargo, npm, and GitHub Actions update PRs.
Minor and patch updates are grouped where lockfile-backed projects support it.
`.github/workflows/dependabot-auto-merge.yml` enables squash auto-merge only for
Dependabot semver-patch updates. GitHub branch protection and required CI checks
must still pass before GitHub merges the PR. Minor, major, Cargo policy, license,
and failed-audit changes remain manual reviews.

## Monthly review

On the first working day of each month, the Engineering Lead reviews:

1. Open Dependabot PRs and all RustSec/npm advisories, including transitive
   advisories suppressed by policy exceptions.
2. Minor and major update PRs manually, including changelogs, breaking-change
   notes, license changes, runtime compatibility, and lockfile diffs.
3. Affected test suites, contract build/WASM output, frontend builds, and
   deployment smoke tests before approving an update.
4. `deny.toml` exceptions. Each exception must have a reason, tracking issue,
   owner, and next review date; remove it as soon as an upstream fix exists.

Record the review in the monthly security-maintenance issue with the date,
reviewer, advisories considered, updates tested, and follow-up actions.

## GitHub security alerts

A repository administrator must enable **Settings -> Code security and
analysis -> Dependency graph**, **Dependabot alerts**, and **Dependabot security
updates**. Security alerts are a GitHub repository setting and cannot be
reliably enabled by a committed workflow. Configure notification recipients for
the security team and verify the setting during the monthly review.

## License policy

The `deny.toml` allow-list includes MIT, Apache-2.0, ISC, BSD-2-Clause, and
BSD-3-Clause, plus the explicitly documented compatible licenses already used
by the Rust dependency graph. New licenses require review and an update to
`deny.toml`; do not add a license exception only to make CI green.