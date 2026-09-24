# NeuroWealth Bug Bounty Program

> **Status:** Active — Pre-Mainnet  
> **Last updated:** 2026-09-24  
> **Program managed by:** NeuroWealth Security Team  

We reward security researchers who responsibly disclose vulnerabilities in the NeuroWealth ecosystem. Our goal is a safe mainnet launch, and community contributions are essential to securing user assets and protocol infrastructure.

---

## Table of Contents

1. [Program Overview](#program-overview)
2. [Scope](#scope)
   - [Vault Smart Contract (Primary Scope)](#vault-smart-contract-primary-scope)
   - [Backend API & Off-Chain Agent](#backend-api--off-chain-agent)
   - [Frontend Web Application](#frontend-web-application)
   - [WhatsApp Bot Service](#whatsapp-bot-service)
3. [Out of Scope](#out-of-scope)
   - [Third-Party Protocols & Infrastructure](#third-party-protocols--infrastructure)
   - [Social Engineering & Physical Attacks](#social-engineering--physical-attacks)
   - [Non-Impactful & Operational Exclusions](#non-impactful--operational-exclusions)
4. [Severity Rubric & Payout Ranges](#severity-rubric--payout-ranges)
   - [Summary of Payout Ranges (in USDC)](#summary-of-payout-ranges-in-usdc)
   - [Critical Severity](#critical-severity)
   - [High Severity](#high-severity)
   - [Medium Severity](#medium-severity)
   - [Low Severity](#low-severity)
   - [Informational Severity](#informational-severity)
5. [Submission Instructions](#submission-instructions)
   - [Authorized Disclosure Channels](#authorized-disclosure-channels)
   - [Vulnerability Report Template](#vulnerability-report-template)
6. [Safe Harbour Clause](#safe-harbour-clause)
   - [Safe Harbour Protections](#safe-harbour-protections)
   - [Researcher Obligations](#researcher-obligations)
7. [Response SLAs](#response-slas)
8. [Payout Process](#payout-process)
9. [Coordinated Disclosure Policy](#coordinated-disclosure-policy)

---

## Program Overview

The NeuroWealth bug bounty program provides financial rewards in USDC for vulnerability reports affecting our smart contracts, backend infrastructure, frontend interfaces, and messaging integrations. All rewards are denominated and disbursed in USDC on the Stellar network.

---

## Scope

The following assets are **in scope** for the bug bounty program:

### Vault Smart Contract (Primary Scope)

| Target | Path / Repository Location | Description |
|---|---|---|
| Core Vault Contract | `neurowealth-vault/contracts/vault/src/lib.rs` | Core vault logic: deposit, withdraw, rebalance, harvest, pause, share calculations, and timelocked upgrade execution |
| Vault Topics & Events | `neurowealth-vault/contracts/vault/src/topics.rs` | Event topics, on-chain state emission, and audit logs |
| Rate Limiter & Caps | `neurowealth-vault/contracts/vault/src/lib.rs` | Rate limiting mechanisms, TVL caps, and user deposit limits |
| Deployed Instances | Deployed Soroban contracts | All testnet/mainnet contract addresses published in [`scripts/MAINNET_DEPLOYMENT_RUNBOOK.txt`](../scripts/MAINNET_DEPLOYMENT_RUNBOOK.txt) |

**Key Concerns for Vault Contract:**
- **Share-Price Manipulation:** Any technique that artificially inflates or deflates the vault's `total_assets` / `total_shares` ratio to steal or dilute value from depositors.
- **Authentication & Role Bypass:** Calling owner-only, agent-only, or guardian-only functions without authorization.
- **Unauthorized Fund Extraction:** Any flaw allowing USDC or minted shares to be moved to unauthorized addresses.
- **Upgrade Hijacking & Timelock Bypass:** Bypassing the 24-hour timelock or forging a `schedule_upgrade` / `execute_upgrade` call.
- **Emergency Pause Bypass:** Executing paused functions while the vault is in an emergency paused state.
- **Reentrancy & State Desynchronization:** Cross-contract reentrancy or state desynchronization breaking accounting invariants.
- **Arithmetic Errors:** Integer overflow, underflow, or precision truncation in share or asset accounting.

### Backend API & Off-Chain Agent

| Target | Path / Repository Location | Description |
|---|---|---|
| AI Agent Service | `agent/src/` | Automated strategy engine, rebalance intent parser, yield comparison, and transaction dispatch service |
| Backend API Endpoints | `agent/src/` | REST/JSON-RPC off-chain APIs serving vault metrics, yield calculations, and agent communications |
| Vault Client Package | `packages/vault-client/src/` | TypeScript SDK client consumed by backend services and automated pipelines |

**Key Concerns for Backend API:**
- **Remote Code Execution (RCE):** Arbitrary code execution or system command injection on backend hosts.
- **Private Key Exposure:** Exposure or exfiltration of the AI agent hot key used for transaction signing.
- **Telemetry & Asset Valuation Tampering:** Manipulation of off-chain yield computations or falsified total asset reporting via `update_total_assets`.
- **API Authentication Bypass:** Broken object-level authorization (BOLA) or unauthenticated execution of internal admin/agent API routes.
- **Market Data Injection:** Injection of spoofed or manipulated oracle/market inputs triggering malicious rebalance executions.

### Frontend Web Application

| Target | Path / Repository Location | Description |
|---|---|---|
| Frontend Web Client | `frontend/` | Next.js/React web interface for user deposits, withdrawals, strategy selection, and portfolio tracking |
| UI Component Library | `packages/vault-ui/` | Shared UI components, state hooks, and notification handlers |

**Key Concerns for Frontend:**
- **Transaction Parameter Tampering:** Intercepting or modifying recipient addresses, deposit sums, or slippage limits prior to wallet signature prompts.
- **Stored or Reflected XSS:** Cross-Site Scripting vulnerabilities enabling credential exfiltration, session hijacking, or automated unauthorized transactions.
- **Clickjacking & UI Redressing:** Deceptive interface overlays tricking users into signing malicious transactions.
- **Client-Side Secret Exposure:** Exposure of sensitive backend service keys or credentials in client bundles.

### WhatsApp Bot Service

| Target | Path / Repository Location | Description |
|---|---|---|
| WhatsApp Bot Service | `whatsapp/` | Notification service, portfolio alert delivery, user interactive commands, and webhook ingress |

**Key Concerns for WhatsApp Bot:**
- **Webhook Signature Bypass:** Forging inbound webhook payloads to execute unauthorized actions on behalf of users.
- **Information Disclosure:** Leaking sensitive user data, wallet addresses, or portfolio balances to unauthorized phone numbers.
- **Command & Prompt Injection:** Injecting arbitrary commands or manipulating prompt flows in automated conversational interfaces.
- **Denial of Service:** Disrupting webhook processing to block critical security or liquidation notifications.

---

## Out of Scope

The following areas, systems, and attack vectors are **explicitly out of scope** and ineligible for rewards:

### Third-Party Protocols & Infrastructure
- **Third-Party DeFi Protocols:** Flaws in external protocols including **Blend** lending pools or decentralized exchanges (**Phoenix, Soroswap, Stellar DEX**), unless NeuroWealth's contract integration directly introduces or amplifies the vulnerability.
- **Stellar Network Core & Consensus:** Vulnerabilities in the Stellar Consensus Protocol (SCP), Soroban runtime environment, or core Stellar validator infrastructure.
- **Third-Party Wallet Applications:** Vulnerabilities residing within external wallet applications (e.g., Freighter, Lobstr, xBull).

### Social Engineering & Physical Attacks
- **Social Engineering:** Phishing, spear-phishing, credential stuffing, or social engineering attacks targeting NeuroWealth team members, contractors, or users.
- **Physical Security:** Any physical attacks directed against facilities, hardware, or employees.

### Non-Impactful & Operational Exclusions
- **Theoretical Attacks:** Speculative claims lacking a working proof of concept (PoC) or tangible security impact.
- **Known & Documented Risks:** Acknowledged risks documented in [`SECURITY.md`](../SECURITY.md) (e.g., Blend liquidity utilization constraints during market stress).
- **Pre-Existing Reports:** Vulnerabilities already tracked in open issues, open pull requests, or past security audit reports.
- **Testing & Fuzzing Harnesses:** Bugs identified strictly in test code, mock contracts, or fuzz targets (`neurowealth-vault/contracts/vault/src/tests/` or `fuzz/`) that do not reflect production smart contract behavior.
- **Volumetric Denial of Service:** Network-layer DDoS or brute-force rate-limiting attacks against testnet/devnet endpoints.
- **Cosmetic UI Issues:** Minor layout bugs, styling inconsistencies, or typographical errors with zero security impact.

---

## Severity Rubric & Payout Ranges

Vulnerabilities are evaluated using a five-tier classification model based on impact and exploitability. Payouts are denominated and disbursed in **USDC**.

### Summary of Payout Ranges (in USDC)

| Severity Tier | Payout Range (USDC) | Criteria Summary |
|---|---|---|
| **Critical** | **$10,000 – $50,000 USDC** | Direct theft or permanent freeze of user funds; complete authentication bypass |
| **High** | **$2,500 – $10,000 USDC** | Privilege escalation; pause mechanism bypass; critical backend API compromise |
| **Medium** | **$500 – $2,500 USDC** | State griefing; systematic rounding value extraction; bot/webhook spoofing; localized DoS |
| **Low** | **$100 – $500 USDC** | Minor access control gap; missing event emissions; low-impact input validation errors |
| **Informational** | **$0 – $100 USDC** | Security hardening suggestions; documentation discrepancies; non-exploitable improvements |

---

### Critical Severity: $10,000 – $50,000 USDC

**Definition:** Direct on-chain theft, permanent loss, or irreversible freezing of user or vault funds without requiring privileged credentials. Complete breakdown of core protocol invariants.

**Component Examples:**
- **Vault Contract:**
  - Share-price manipulation via `update_total_assets` or initial deposit donation that drains user capital.
  - Calling `rebalance()`, `emergency_pause()`, or `execute_upgrade()` without authorization.
  - Extracting USDC to a non-depositor address without user consent.
  - Bypassing the 24-hour timelock to execute an unauthorized contract upgrade.
  - Reentrancy attacks leading to double-minting of shares or double-withdrawals of underlying assets.
- **Backend API:**
  - Remote code execution (RCE) on backend infrastructure hosting agent signing keys.
  - Unauthorized manipulation of production databases resulting in fraudulent balance adjustments.
- **Frontend:**
  - Injected malicious payload modifying transaction parameters before signing, redirecting user funds to an attacker.
- **WhatsApp Bot:**
  - Flaw allowing an attacker to trigger arbitrary fund transfers or compromise signing credentials via messaging interactions.

---

### High Severity: $2,500 – $10,000 USDC

**Definition:** Severe impact on vault integrity or temporary freezing of user funds, requiring a single compromised semi-trusted key (e.g., AI agent hot key), or critical backend infrastructure compromise without direct fund theft.

**Component Examples:**
- **Vault Contract:**
  - Privilege escalation enabling the AI agent key to call owner-restricted functions (e.g., `set_tvl_cap`).
  - Executing state-changing transactions while the vault is in an emergency paused state.
  - Circumventing `user_deposit_cap` or `tvl_cap` limits in a single transaction.
  - Bypassing solvency checks during asset updates to report inflated balances.
- **Backend API:**
  - Server-Side Request Forgery (SSRF) or broken authorization enabling unauthorized manipulation of rebalance parameters.
  - Unauthenticated access to private agent endpoints exposing operational configurations.
- **Frontend:**
  - Clickjacking or UI overlay vectors inducing users to execute unintended token approval transactions.
- **WhatsApp Bot:**
  - Flaws exposing sensitive financial information, wallet addresses, or user identifiers to third parties.

---

### Medium Severity: $500 – $2,500 USDC

**Definition:** Moderate operational or financial impact, exploitable under specific conditional constraints, griefing vectors that do not extract funds directly, or systematic value leakage across multiple transactions.

**Component Examples:**
- **Vault Contract:**
  - Systematic rounding errors exploited to extract value incrementally across repeated transactions.
  - State griefing attacks forcing the vault into an inconsistent state requiring owner intervention.
  - Deliberately expiring other users' storage entries to induce temporary denial of service.
  - Bypassing configured rebalance cooldown timers without unauthorized asset movement.
- **Backend API:**
  - Denial of service targeting yield calculation endpoints, halting automated rebalancing.
  - Event processing race conditions leading to delayed off-chain updates.
- **Frontend:**
  - Open redirect vulnerabilities on authentication flows.
  - Cross-Site Request Forgery (CSRF) on non-critical user preference endpoints.
- **WhatsApp Bot:**
  - Webhook flood vectors causing delayed delivery of critical account and vault security notifications.

---

### Low Severity: $100 – $500 USDC

**Definition:** Minor issues violating documented specifications or security best practices with limited practical exploitability and no risk of direct fund loss.

**Component Examples:**
- **Vault Contract:**
  - State-changing functions omitting event emissions relied upon by indexers.
  - Edge-case inputs (e.g., zero amounts) failing to revert with the documented `VaultError` variant.
  - Access control inconsistencies on view or non-critical helper functions.
- **Backend API:**
  - Lack of rate limiting on public informational endpoints.
  - Verbose error responses leaking framework versions or internal stack traces.
- **Frontend:**
  - Missing HTTP security headers (e.g., CSP, X-Frame-Options) on non-sensitive pages.
  - Broken links or cosmetic interface misalignments during edge-case error handling.
- **WhatsApp Bot:**
  - Unhandled edge cases in message parsing resulting in unhelpful generic error responses.

---

### Informational Severity: $0 – $100 USDC

**Definition:** Non-exploitable observations, code quality enhancements, defense-in-depth suggestions, or documentation discrepancies that improve system clarity and resilience.

**Component Examples:**
- **Vault Contract & Architecture:**
  - Recommendations to optimize code structure or gas consumption without changing semantics.
  - Documentation discrepancies between [`SECURITY.md`](../SECURITY.md) and smart contract implementation.
  - Removal of dead code or unused storage constants.
- **Backend API & Off-Chain:**
  - Suggestions to update non-vulnerable dependency versions.
  - Logging enhancements and telemetry hygiene recommendations.
- **Frontend & Bot:**
  - Code refactoring recommendations for improved maintainability.

*Note: Informational submissions are eligible for up to $100 USDC, public acknowledgment in release notes, or recognition in the NeuroWealth Security Hall of Fame.*

---

## Submission Instructions

To remain eligible for bounty rewards, researchers must report vulnerabilities through private, authorized channels. **Never open public GitHub issues, pull requests, or public discussions for security vulnerabilities.**

### Authorized Disclosure Channels

Submit reports via either of the following channels:

1. **Private Disclosure Email (Primary):**  
   Send details to `security@neurowealth.io`  
   Subject line format: `[BUG BOUNTY] <Vulnerability Summary>`

2. **GitHub Security Advisory (Alternative):**  
   Submit privately through GitHub Security Advisories:  
   [Report a Vulnerability](https://github.com/Shackole/NeuroWealth-Smartcontract/security/advisories/new)  
   Navigate to repository **Security** > **Advisories** > **Report a vulnerability**.

---

### Vulnerability Report Template

Please include the following information in every report:

```markdown
### Report Summary
- **Title:** [Concise description of the vulnerability]
- **Target Component:** [Vault Contract | Backend API | Frontend | WhatsApp Bot]
- **Estimated Severity:** [Critical | High | Medium | Low | Informational]

### Affected Assets
- **File / Endpoint:** [e.g., neurowealth-vault/contracts/vault/src/lib.rs]
- **Method / Function:** [e.g., execute_upgrade()]
- **Lines of Code:** [e.g., L105-L120]

### Vulnerability Description
[Detailed description of the issue and why the current logic is flawed]

### Step-by-Step Reproduction
1. [Initial condition / setup]
2. [Action executed by attacker]
3. [Observed vulnerable behavior]

### Proof of Concept (PoC)
[Minimal, reproducible Rust test case, curl command, or test script]

### Impact Analysis
[Detailed assessment of potential damages: assets at risk, state corruption, or service degradation]

### Recommended Fix
[Proposed patch, architectural adjustment, or mitigation strategy]
```

---

## Safe Harbour Clause

NeuroWealth is committed to fostering an environment where security researchers can operate safely and constructively. We provide a comprehensive Safe Harbour for individuals who act in good faith.

### Safe Harbour Protections

NeuroWealth affirms that:
- **No Legal Action:** We will not pursue civil litigation or initiate criminal complaints against researchers who conduct security research and report findings in accordance with this policy.
- **Authorized Activity:** Activities conducted in compliance with this policy are recognized as authorized conduct under relevant cybersecurity statutes (including the Computer Fraud and Abuse Act and equivalent regional laws).
- **Defense Support:** If legal action is initiated by a third party against a researcher acting in good faith under this policy, NeuroWealth will provide documentation affirming the researcher's authorization.

### Researcher Obligations

To qualify for Safe Harbour protections, researchers must:
- Confine all active testing to Stellar **testnet**, **devnet**, or local mock environments. **Never test against mainnet contracts or real user funds.**
- If personal data or real user funds are inadvertently discovered, immediately stop testing, preserve the data without exfiltration, and report the issue promptly.
- Refrain from performing denial-of-service attacks, data destruction, or intentional disruption of production or testing environments.
- Abide strictly by the [Coordinated Disclosure Policy](#coordinated-disclosure-policy) and refrain from public disclosure until the coordinated disclosure period has concluded.
- Conduct all activities in good faith and in full compliance with applicable laws.

---

## Response SLAs

The NeuroWealth security team operates under defined response timelines for all submitted reports:

| Milestone | Target SLA | Description |
|---|---|---|
| **Initial Acknowledgement** | Within **48 hours** | Initial confirmation of receipt and assignment of a tracking identifier |
| **Triage & Severity Assignment** | Within **7 days** | Technical validation, exploitability assessment, and severity tier confirmation |
| **Remediation (Critical / High)** | Within **14 business days** | Remediation developed, reviewed, and staged for deployment |
| **Remediation (Medium / Low)** | Within **30 business days** | Patch implemented, verified, and incorporated into release schedule |
| **Testnet Deployment** | Within **7 days** | Deployment and verification of fix on Stellar testnet/devnet |
| **Mainnet Deployment** | Timelock dependent | Mainnet deployment adhering to the 24-hour upgrade timelock (17,280 ledgers) |
| **Bounty Disbursement** | Within **7 business days** | Payout issued in USDC following mainnet fix confirmation |
| **Coordinated Disclosure** | **90 days** | Public disclosure window from date of initial report acknowledgment |

---

## Payout Process

1. **Validation & Assessment:** The security team confirms report validity, assigns the final severity tier, and calculates the reward amount within the published range.
2. **Recipient Information:** The researcher submits a verified receiving address (Stellar or EVM wallet address).
3. **Disbursement:** Bounties are paid in **USDC** on the Stellar network.
4. **Tax Obligations:** Researchers are solely responsible for all tax liabilities and statutory reporting obligations in their respective jurisdictions.
5. **Duplicate Submissions:** If multiple independent reports describe the same underlying vulnerability, the bounty is awarded to the first valid submission received (by timestamp).
6. **Hall of Fame & Recognition:** Researchers will be credited in patch release notes and the Security Hall of Fame, unless anonymity is explicitly requested.

---

## Coordinated Disclosure Policy

NeuroWealth adheres to a **90-day Coordinated Disclosure** policy:
- Researchers agree not to publicly disclose vulnerability details, exploit code, or proof-of-concept material until 90 days after initial report acknowledgment, or until an official patch has been deployed to mainnet and mutual consent is reached.
- In scenarios involving active, in-the-wild exploitation, the security team may accelerate disclosure and deployment timelines to protect users.
- Public post-mortems will acknowledge the researcher's contribution while detailing the root cause and mitigation strategy.

---

*This policy is maintained by the NeuroWealth Security Team. For threat modeling and contract security specifications, refer to [`SECURITY.md`](../SECURITY.md).*
