# NeuroWealth Bug Bounty Program

> **Status:** Active — Pre-Mainnet  
> **Last updated:** 2026-09-24  
> **Program managed by:** NeuroWealth Security Team

We reward security researchers who responsibly disclose vulnerabilities in the
NeuroWealth smart contract system. Our goal is a safe mainnet launch, and your
help makes that possible.

---

## Table of Contents

1. [Scope](#scope)
2. [Out of Scope](#out-of-scope)
3. [Severity Rubric](#severity-rubric)
4. [Reporting Channel](#reporting-channel)
5. [Safe-Harbor Terms](#safe-harbor-terms)
6. [Response SLAs](#response-slas)
7. [Payout Process](#payout-process)
8. [Disclosure Policy](#disclosure-policy)

---

## Scope

The following assets are **in scope** for the bug bounty:

### Smart Contracts (Primary Scope)

| Path | Description |
|------|-------------|
| `neurowealth-vault/contracts/vault/src/lib.rs` | Core vault contract (deposit, withdraw, rebalance, upgrade, pause logic) |
| `neurowealth-vault/contracts/vault/src/topics.rs` | Event topic constants |
| All deployed contract addresses listed in the latest [Mainnet Deployment Runbook](../scripts/) | On-chain instances |

### Backend API (Secondary Scope)

| Component | Description |
|-----------|-------------|
| AI agent backend (`agent/`) | Event listener, intent parser, yield comparison engine |
| REST / webhook API endpoints | Authentication, input validation, authorization |
| TypeScript vault client (`packages/vault-client/src/`) | Client library used by frontend and agent |
| Deployment scripts (`scripts/deploy-*.sh`) | Key hygiene, initialization ordering |

### Frontend (Tertiary Scope)

| Component | Description |
|-----------|-------------|
| Next.js web app (`frontend/`) | User-facing portfolio dashboard |
| Wallet integration | Freighter wallet signing flows |
| Stellarterm / in-app transaction construction | Crafted transaction forgery or XSS |

### WhatsApp Bot (Tertiary Scope)

| Component | Description |
|-----------|-------------|
| WhatsApp bot handler (`whatsapp/`) | Twilio webhook receiver and intent dispatcher |
| OTP verification flow | Phone number–to–keypair binding |
| Custodial keypair storage | Secret key handling for WhatsApp-onboarded users |
| Message injection | Crafted WhatsApp messages that trigger unauthorized vault operations |

### What We Care About Most

- **Share-price manipulation** — any technique that artificially inflates or
  deflates the vault's `total_assets` / `total_shares` ratio to steal value
  from other depositors.
- **Authentication bypass** — calling owner-only, agent-only, or user-only
  functions without the required authorization.
- **Unauthorized fund extraction** — any path that moves USDC to an address
  that did not deposit it.
- **Upgrade hijacking** — bypassing the upgrade timelock or forging a
  `schedule_upgrade` / `execute_upgrade` call.
- **Pause bypass** — executing a paused-blocked function while the vault is
  paused.
- **Reentrancy** — despite CEI pattern enforcement, any novel cross-contract
  reentrant path that breaks invariants.
- **Integer overflow / underflow** — arithmetic bugs in share or asset
  accounting.
- **WhatsApp OTP bypass** — triggering a deposit or withdrawal for a phone
  number that has not completed OTP verification.
- **Custodial key exfiltration** — any path that exposes a WhatsApp user's
  Stellar secret key to a third party.

---

## Out of Scope

The following are **not eligible** for bounty rewards:

- Theoretical or speculative attacks with no working proof-of-concept.
- Issues in third-party protocols (Blend, Stellar DEX) **unless** the vault's
  integration amplifies the impact.
- Social-engineering attacks against NeuroWealth team members (e.g., phishing
  employees to reveal keys).
- Bugs already reported or currently being fixed in an open issue or PR.
- Bugs in test files (`src/tests/`) or fuzz targets (`fuzz/`) that do not
  reflect production contract behaviour.
- Denial-of-service that only affects testnet or devnet.
- Front-end / UI bugs that are cosmetic and do not affect funds.
- Issues requiring physical access to a developer's machine.
- Informational-only findings with no exploitable impact.
- Self-inflicted issues (e.g., user knowingly shares their own secret key).
- Planned / acknowledged risks already documented in
  [`SECURITY.md`](../SECURITY.md) (e.g., Blend utilisation liquidity risk,
  USDC issuer freeze).

---

## Severity Rubric

We use a four-tier severity system aligned with industry standards
(Immunefi / HackerOne). All payout amounts are in **USDC**.

### Critical — $10,000 – $50,000

Direct, on-chain theft or permanent loss of user funds without requiring any
privileged key, or full compromise of the custodial key storage backing
WhatsApp users.

**Example bug classes:**

| Class | Example | Payout Range |
|-------|---------|--------------|
| Share-price manipulation | Inflate `total_assets` to drain other users on withdrawal | $25,000–$50,000 |
| Auth bypass | Call `rebalance()` or `execute_upgrade()` as an arbitrary address | $20,000–$50,000 |
| Unauthorized withdrawal | Extract USDC to a non-depositor address without their auth | $25,000–$50,000 |
| Upgrade hijack | Execute `execute_upgrade()` before timelock or bypass owner-auth | $20,000–$40,000 |
| Reentrancy theft | Reentrant path that double-mints shares or double-withdraws USDC | $25,000–$50,000 |
| Custodial key dump | API or WhatsApp bot bug leaking all custodial Stellar secret keys | $10,000–$30,000 |

**Criteria:** Funds at risk, exploitable on mainnet, no trusted actor required.

---

### High — $2,500 – $10,000

Severe impact requiring a single compromised / malicious trusted actor, or
targeted theft from a single WhatsApp user.

**Example bug classes:**

| Class | Example | Payout Range |
|-------|---------|--------------|
| Privilege escalation | Agent can call owner-only functions (e.g., `set_tvl_cap`) | $5,000–$10,000 |
| Pause bypass | Paused-blocked function executes despite the paused flag | $5,000–$10,000 |
| Forced lock-up | Owner can permanently brick withdrawals beyond documented pause | $2,500–$7,500 |
| Cap bypass | Deposit more than `user_deposit_cap` or `tvl_cap` in one tx | $2,500–$5,000 |
| WhatsApp OTP bypass | Trigger deposit/withdraw for unverified phone number | $5,000–$10,000 |
| Single-user key exfiltration | API bug leaking one WhatsApp user's secret key | $2,500–$7,500 |

**Criteria:** High impact, but typically requires a compromised key or
specific race condition.

---

### Medium — $250 – $2,500

Moderate impact, exploitable under specific conditions, or degraded security
guarantees.

**Example bug classes:**

| Class | Example | Payout Range |
|-------|---------|--------------|
| Griefing / DoS | Any account can lock vault into a state requiring owner intervention | $500–$2,500 |
| Rounding manipulation | Systematic rounding abuse to drain value over many transactions | $500–$2,500 |
| Event spoofing | Emit misleading events causing off-chain agents to act incorrectly | $250–$1,000 |
| TTL expiry abuse | Deliberately expire another user's `Shares` storage entry | $250–$1,000 |
| Cooldown bypass | Call `rebalance()` / `harvest()` more often than configured | $500–$2,000 |
| WhatsApp message injection | Craft a message that executes a different intent than shown | $500–$2,000 |
| API authentication weakness | Weak session tokens or missing auth on sensitive endpoints | $500–$2,000 |

**Criteria:** Real impact but not direct fund loss in a single transaction.

---

### Low — $50 – $500

Minor issues that violate documented security properties with limited practical
exploitability.

**Example bug classes:**

| Class | Example | Payout Range |
|-------|---------|--------------|
| Access-control gap | Non-critical function callable by wrong role, no real-world impact | $50–$250 |
| Missing event | State-changing function that silently omits an event indexers rely on | $50–$250 |
| Input validation | Edge-case input not rejected with the correct error code | $50–$250 |
| Documentation mismatch | `SECURITY.md` or `ARCHITECTURE.md` describes behaviour that differs from code | $50–$200 |
| WhatsApp UX confusion | Bot error messages that could mislead users into unsafe actions | $50–$200 |

**Criteria:** Low exploitability or impact confined to off-chain tooling.

---

### Informational — No Payout

Findings that are out of scope, acknowledged, or informational only. We may
still credit the researcher and address the finding, but no bounty is paid.

---

## Reporting Channel

**Primary:** Email `security@neurowealth.io` with subject line:
```
[BUG BOUNTY] <one-line summary>
```

**Alternative (for program status / questions only):** Open a
[GitHub Security Advisory](https://github.com/Shackole/NeuroWealth-Smartcontract/security/advisories/new)
via the "Report a vulnerability" button on the repo's Security tab.

**Do NOT** open a public GitHub issue for a security vulnerability. Doing so
will disqualify the report from bounty eligibility.

### Report Template

```
**Severity (your assessment):** Critical / High / Medium / Low

**Affected component:** e.g., lib.rs → execute_upgrade()

**Vulnerability description:**
<clear explanation of the bug>

**Attack scenario:**
<step-by-step description of how an attacker would exploit this>

**Impact:**
<what an attacker gains: funds stolen, vault bricked, etc.>

**Proof of concept:**
<minimal Rust test or transaction sequence that demonstrates the bug>

**Suggested fix (optional):**
<your recommendation>
```

---

## Safe-Harbor Terms

NeuroWealth is committed to working with security researchers in good faith.
We will **not** pursue legal action against researchers who:

1. Discover and report vulnerabilities via the process described in this
   document.
2. Act in good faith and do not exploit the vulnerability beyond what is
   necessary to produce a minimal proof of concept.
3. Do not access, modify, or exfiltrate user data beyond what is required
   to demonstrate the vulnerability.
4. Do not perform denial-of-service attacks, social engineering, or physical
   attacks against NeuroWealth infrastructure or personnel.
5. Do not publicly disclose the vulnerability before the coordinated
   disclosure deadline (see [Disclosure Policy](#disclosure-policy)).

If you inadvertently access user funds or data while researching a vulnerability,
stop immediately, include it in your report, and we will work with you to
assess the impact without penalty.

**Testing environment:** All testing should be performed on Stellar **testnet**
or **devnet**. Testing directly against mainnet contracts may disqualify your
report and could expose you to legal risk.

---

## Response SLAs

| Milestone | Target |
|-----------|--------|
| Initial acknowledgement | **48 hours** of receiving the report |
| Triage and severity assignment | **7 business days** |
| Fix developed and reviewed | **14 business days** (Critical / High) |
| Fix developed and reviewed | **30 business days** (Medium / Low) |
| Patch deployed to testnet | **7 days** after fix review |
| Patch deployed to mainnet | Dependent on 24 h timelock + deployment schedule |
| Bounty paid | **7 business days** after mainnet deployment confirmation |
| Coordinated public disclosure | **90 days** after initial report (may be shortened by mutual agreement) |

If a fix requires more time than the SLA allows, we will communicate progress
proactively and agree on an updated timeline with the reporter.

---

## Payout Process

1. **Confirmation:** We send a written confirmation of bounty eligibility and
   the approved severity tier.
2. **Validation:** Reporter provides a Stellar wallet address for USDC payout.
3. **Payment:** Bounties are paid in **USDC** on the Stellar network within
   7 business days of mainnet deployment confirmation.
4. **Tax:** Reporters are responsible for any applicable taxes in their
   jurisdiction.
5. **Acknowledgement:** With permission, we will credit the reporter in the
   patch release notes and our security hall of fame.

Payout amounts are determined by:

- Severity tier (see rubric above).
- Quality and completeness of the report.
- Novelty of the finding.
- Whether a working proof-of-concept was provided.

Duplicate reports (same root cause already reported by another researcher)
receive a reduced or no bounty, at our discretion.

---

## Disclosure Policy

- We follow a **90-day coordinated disclosure** window from the date we
  acknowledge your report.
- We will work with you to agree on a disclosure date that is as early as
  possible while protecting users.
- If the vulnerability is actively being exploited, we reserve the right to
  accelerate disclosure and deployment.
- We will credit all eligible reporters in our public post-mortem unless
  anonymity is requested.

---

*This policy is subject to change. Material changes will be announced via the
repository changelog and the `security@neurowealth.io` mailing list.*

*See also: [`SECURITY.md`](../SECURITY.md) for the full trust model, threat
analysis, and owner-compromise runbook.*
