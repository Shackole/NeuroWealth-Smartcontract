# NeuroWealth Product & Technical Roadmap

> **Issue:** #80  
> **Scope:** Detailed Specifications for Phase 2 (Intelligence) and Phase 3 (Scale)  
> **Status:** Active Reference & Planning Document  
> **Maintainer:** NeuroWealth Core Architecture & Product Working Group  
> **Last Updated:** 2026-09-25  

---

## 1. Executive Summary & Strategic Vision

NeuroWealth is an autonomous, AI-driven wealth management protocol deployed on Stellar using the Soroban smart contract environment. The protocol empowers individual and institutional savers to access institutional-grade yield strategies across the Stellar ecosystem through automated, risk-managed vault positions.

The evolution of NeuroWealth is structured into three phases:
- **Phase 1 — Foundation (Completed / Current):** Core Soroban vault smart contract (ERC-4626 share accounting, deposit, withdraw, emergency exit, pause guards), Blend protocol lending pool integration, single-venue rebalancing, Next.js web application, WhatsApp conversational MVP, and formal verification proofs.
- **Phase 2 — Intelligence (Next Horizon):** Transitioning from single-venue deployment to multi-protocol yield aggregation, dynamic ML-driven APY and risk scoring, portfolio backtesting, user-specific risk tiering, and predictive earnings projections.
- **Phase 3 — Scale (Ecosystem Expansion):** Onboarding regulated Real-World Assets (tokenized US Treasuries, private credit), bidirectional cross-chain liquidity routing between Stellar and Ethereum via Axelar GMP, social strategy copy-trading, and decentralized protocol governance via the NeuroWealth token.

```
       Phase 1: Foundation          Phase 2: Intelligence             Phase 3: Scale
       ───────────────────          ─────────────────────             ──────────────
       • Soroban Vault Contract     • Multi-Protocol Aggregation     • Real-World Assets (RWA)
       • Blend Lending Pool         • AI Risk Scoring & Backtesting  • Cross-Chain Bridging (Axelar)
       • WhatsApp Bot MVP           • Personalized Risk Profiles     • Social Copy-Trading
       • Next.js Web Dashboard      • Earnings Projections           • DAO Governance Token
```

---

## 2. Phase 2: Intelligence — Detailed Specifications

Phase 2 enhances the intelligence, capital efficiency, and personalization of the vault by enabling simultaneous multi-venue deployments and data-driven risk management.

### 2.1 Multi-Protocol Yield Aggregation (Blend + DEX + Aquarius + Phoenix)

#### Overview
Phase 1 limits capital deployment to a single protocol at a time (e.g., 100% idle in vault, or 100% supplied to Blend). Phase 2 implements dynamic capital allocation across multiple yield-generating venues simultaneously, dynamically routing liquidity to maximize risk-adjusted APY while respecting protocol concentration limits.

#### Acceptance Criteria
- [ ] Vault contract supports splitting total assets across Blend, Stellar DEX AMM liquidity pools, Aquarius, and Phoenix pools based on basis-point target weights (`BlendAllocationBps + DexAllocationBps <= 10_000`).
- [ ] Agent entrypoint `rebalance_multi(weights: Vec<ProtocolAllocation>, min_out: Vec<i128>)` executes atomic multi-leg rebalances.
- [ ] Proportional withdrawal mechanism: when a user withdraws assets, liquidity is redeemed proportionally across all active venues without distorting the target portfolio allocation.
- [ ] Slippage bounds (`min_out`) enforced individually per venue exit and entry leg.
- [ ] Real-time composite APY calculation: $\text{APY}_{\text{composite}} = \sum (\text{weight}_i \times \text{APY}_i)$.

#### Dependencies
- Stable Soroban DEX liquidity pool adapters (`packages/bridge`, `docs/DEX_INTEGRATION.md`).
- Multi-asset and multi-venue storage key isolation.

#### Rough Timeline Estimate
- **6 to 8 weeks** (Smart contract updates: 3 weeks; agent solver: 3 weeks; testnet validation: 2 weeks).

#### Open Questions & Blockers
- *Gas & CPU Footprint:* Multi-protocol execution requires multiple cross-contract calls in a single transaction envelope. Does the Soroban transaction budget permit a 4-venue rebalance in one ledger invocation?
- *Liquidity Depth:* Some DEX pools have shallow liquidity, creating high slippage during large vault exits.

---

### 2.2 Strategy Backtesting and AI Risk Scoring

#### Overview
Provides historical validation and real-time safety bounds for the AI agent's rebalancing decisions. Before the agent executes an on-chain rebalance, proposed allocation changes are evaluated by an off-chain risk engine that assigns a quantitative Risk Score (0–100) based on volatility, smart contract audit status, historical pool drawdown, and liquidity utilization.

#### Acceptance Criteria
- [ ] Off-chain risk scoring pipeline (`agent/src/riskScoring.ts`) ingests historical data (30d, 90d, 365d) from Stellar Horizon, Blend, and DEX oracles.
- [ ] Computes Sharpe ratio, Sortino ratio, maximum historical drawdown (MDD), and Value at Risk (VaR 95%).
- [ ] Automated backtesting harness: simulates strategy performance against historical market stress events (e.g., protocol depegs, flash crashes).
- [ ] Hard contract circuit breaker: agent cannot execute rebalances to protocols whose risk score drops below protocol safety thresholds.
- [ ] Public API exposing risk scores and backtest metrics to the frontend and WhatsApp bot.

#### Dependencies
- Supabase historical time-series database (`db/`).
- Stellar Horizon and protocol indexers.

#### Rough Timeline Estimate
- **4 to 6 weeks** (Data ingestion pipeline: 2 weeks; risk model implementation: 2 weeks; backtesting simulator: 2 weeks).

#### Open Questions & Blockers
- *Data Availability:* Historical Soroban ledger event indexing is young; comprehensive 1-year historical APR data for newer liquidity venues requires custom indexing.

---

### 2.3 Personalized User Risk Profiles

#### Overview
Enables depositors to customize their risk tolerance rather than forcing all capital into a one-size-fits-all portfolio. Users choose between **Conservative** (capital preservation, 100% lending/T-Bills), **Balanced** (lending + top AMM pools), and **Growth** (active algorithmic yield farming).

#### Acceptance Criteria
- [ ] User strategy preference persisted on-chain via `set_user_strategy(strategy_id)` emitting `UserStrategyUpdatedEvent`.
- [ ] Vault segregates or attributes yields according to individual strategy preferences or dedicated virtual sub-vaults.
- [ ] UI onboarding quiz that maps user financial goals and time horizon to recommended risk profiles.
- [ ] WhatsApp bot integration: users can adjust risk profile via conversational commands (e.g., *"Switch my strategy to Conservative"*).
- [ ] Dynamic rebalance allocation driven by the aggregate strategy demand of depositors.

#### Dependencies
- Multi-protocol yield aggregation (Feature 2.1).
- Frontend strategy switcher UI components (`frontend/`).

#### Rough Timeline Estimate
- **3 to 5 weeks** (Smart contract strategy attribution: 2 weeks; frontend & conversational bot UI: 2 weeks; integration testing: 1 week).

#### Open Questions & Blockers
- *Accounting Granularity:* Does per-user risk profiling require distinct sub-vault contracts (ERC-4626 instances) or can internal share accounting attribute split venue yields without gas bloat?

---

### 2.4 Earnings Projections and Advanced Analytics

#### Overview
Delivers interactive analytics and forward-looking financial forecasting to depositors, showing historical earnings, daily yield attribution, compounded APY graphs, and Monte Carlo projections.

#### Acceptance Criteria
- [ ] Time-weighted realized APY calculation engine (`get_user_apy`) tracking individual entry snapshots.
- [ ] Interactive charting components in Next.js frontend showing 30-day historical returns and 1-year compounded earnings projections.
- [ ] Milestone projections (e.g., *"At current rates, your balance will reach 5,000 USDC in 8 months"*).
- [ ] CSV/PDF tax statement export generating downloadable summaries of all deposits, withdrawals, and accrued yield events.
- [ ] Automated weekly earnings digest delivered via web push notifications and WhatsApp.

#### Dependencies
- Realized APY tracking (`DepositSnapshot` on-chain).
- Notification service (`docs/NOTIFICATIONS.md`).

#### Rough Timeline Estimate
- **3 to 4 weeks** (Data aggregation API: 1.5 weeks; UI visualizer: 1.5 weeks; notification integration: 1 week).

#### Open Questions & Blockers
- *Projection Disclaimers:* Ensuring all forward-looking estimates comply with financial promotional regulations (clear non-guaranteed disclaimers).

---

## 3. Phase 3: Scale — Detailed Specifications

Phase 3 expands NeuroWealth from a Stellar-native yield optimizer into a cross-chain, institutional-grade decentralized wealth management platform.

### 3.1 Real-World Asset (RWA) Yield Strategies

#### Overview
Integrates tokenized real-world assets—such as tokenized US Treasury bills (e.g., Franklin Templeton FOBXX, Ondo USDY, WisdomTree) and regulated private credit pools operating on Stellar—into the vault's yield aggregation strategy.

#### Acceptance Criteria
- [ ] Integration of Stellar-native regulated asset tokens (SEP-0008 compliance with issuer authorization flags).
- [ ] Automated yield distribution handling for assets paying yield via rebasing, balance appreciation, or periodic token streaming.
- [ ] Permissioned onboarding layer for accredited / KYC-verified pools while maintaining permissionless access for standard DeFi strategies.
- [ ] Emergency liquidation and redemption runbooks for off-market hours and bank holidays.

#### Dependencies
- Issuer freeze contingency protocols ([`docs/ISSUER_FREEZE_CONTINGENCY.md`](ISSUER_FREEZE_CONTINGENCY.md)).
- Partnership with regulated Stellar asset issuers.

#### Rough Timeline Estimate
- **8 to 12 weeks** (Regulatory & compliance review: 4 weeks; contract adapter implementation: 4 weeks; auditing & security sign-off: 4 weeks).

#### Open Questions & Blockers
- *Banking Settlement Delays:* RWA redemptions typically settle in T+1 or T+2 business days, which conflicts with instantaneous DeFi withdrawals. A liquidity buffer or redemption queue is required.

---

### 3.2 Cross-Chain Liquidity Bridging (Stellar ↔ Ethereum via Axelar)

#### Overview
Enables users on Ethereum, Arbitrum, Optimism, and Base to deposit USDC into the NeuroWealth vault without leaving their home network. The funds are routed across the Axelar General Message Passing (GMP) bridge onto Stellar/Soroban, deposited into the vault, and corresponding cross-chain receipt tokens are minted.

#### Acceptance Criteria
- [ ] EVM gateway contract deployed on Ethereum / Arbitrum accepting USDC deposits.
- [ ] Cross-chain message routing via Axelar GMP to the NeuroWealth Soroban vault.
- [ ] Minting of ERC-4626 compliant wrapper shares on EVM destination networks.
- [ ] Bidirectional withdrawal: EVM users burn receipt tokens and receive native USDC back on Ethereum.
- [ ] Relay monitoring and gas refund mechanism handling stuck cross-chain packets.

#### Dependencies
- Axelar Network Soroban gateway availability and relayer support.
- Bridge architecture specification ([`packages/bridge/BRIDGE_ARCHITECTURE.txt`](../packages/bridge/BRIDGE_ARCHITECTURE.txt)).

#### Rough Timeline Estimate
- **8 to 10 weeks** (EVM gateway contracts: 3 weeks; Soroban bridge handler: 3 weeks; Axelar integration & testnet relayer testing: 4 weeks).

#### Open Questions & Blockers
- *Bridge Latency:* Cross-chain finality between Ethereum and Stellar takes 15–25 minutes. UI must provide clear status tracking.
- *Relayer Fees:* Cross-chain gas estimation fluctuations must not fail execution envelopes.

---

### 3.3 Social Trading & Portfolio Copying

#### Overview
Allows users to explore, compare, and follow curated portfolio strategies managed by high-performing AI models or verified community portfolio strategists. Users allocate funds to "copy" an approved strategy portfolio with automated rebalancing.

#### Acceptance Criteria
- [ ] Leaderboard ranking AI models and public strategy managers by risk-adjusted return (Sharpe), maximum drawdown, and TVL.
- [ ] Strategy subscription mechanism: depositors mirror allocation targets of their selected strategist.
- [ ] Performance fee mechanism: strategists earn a configurable percentage (e.g., 5–10%) strictly on generated profits above high-water marks.
- [ ] Social profile pages displaying verified on-chain track records, strategy methodology, and historical rebalance log.

#### Dependencies
- Personalized risk profiles (Feature 2.3).
- Performance fee smart contract architecture (`test_performance_fee.rs`).

#### Rough Timeline Estimate
- **6 to 8 weeks** (Copy-trading smart contract logic: 3 weeks; social leaderboard UI: 3 weeks; keeper infrastructure: 2 weeks).

#### Open Questions & Blockers
- *Sybil & Manipulation Risk:* Strategists executing sandwich attacks or front-running their own followers must be prevented via randomized execution delays and private order routing.

---

### 3.4 NeuroWealth Governance Token & Fee Sharing

#### Overview
Decentralizes ownership and protocol governance through the launch of the native **NW** token. Token holders participate in protocol parameter voting (TVL caps, supported venues, risk thresholds) and stake tokens to receive a portion of protocol revenue from performance fees.

#### Acceptance Criteria
- [ ] Stellar-native governance token contract with fixed supply, transparent vesting schedules, and staking mechanics.
- [ ] Protocol revenue fee-sharing module: distributes a portion of vault performance fees to staked NW holders.
- [ ] On-chain governance voting module (or Snapshot-equivalent for Stellar) for DAO proposals.
- [ ] Security guardian election: DAO token holders participate in nominating and rotating protocol security guardians ([`docs/GUARDIAN_KEY_DESIGN.md`](GUARDIAN_KEY_DESIGN.md)).

#### Dependencies
- Completion of Phase 2 multi-protocol yield architecture.
- Full comprehensive third-party security audits.

#### Rough Timeline Estimate
- **10 to 14 weeks** (Tokenomics modeling: 4 weeks; smart contract development: 4 weeks; security audit: 3 weeks; governance UI & launch: 3 weeks).

#### Open Questions & Blockers
- *Regulatory Classification:* Ensuring token structure complies with global digital asset legal frameworks (utility / governance classification).

---

## 4. Comprehensive Dependency Graph

```
                                DEPENDENCY MAP
                                ══════════════

      Phase 1: Foundation (Complete)
      ┌────────────────────────────────────────────────────────┐
      │ • Vault Core Contract  • Blend Integration  • Frontend │
      └───────────────────────────┬────────────────────────────┘
                                  │
                                  ▼
      Phase 2: Intelligence
      ┌────────────────────────────────────────────────────────┐
      │ [2.1 Multi-Protocol Yield Aggregation]                 │
      └─────────────┬───────────────────────────┬──────────────┘
                    │                           │
                    ▼                           ▼
      ┌───────────────────────────┐ ┌──────────────────────────┐
      │ [2.2 Strategy Backtesting │ │ [2.3 Personalized Risk   │
      │   & AI Risk Scoring]      │ │       Profiles]          │
      └─────────────┬─────────────┘ └───────────┬──────────────┘
                    │                           │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
      ┌────────────────────────────────────────────────────────┐
      │ [2.4 Earnings Projections & Advanced Analytics]        │
      └───────────────────────────┬────────────────────────────┘
                                  │
                                  ▼
      Phase 3: Scale
      ┌───────────────────────────┴────────────────────────────┐
      │                                                        │
      ▼                                                        ▼
┌──────────────────────────┐                             ┌──────────────────────────┐
│ [3.1 Real-World Assets]  │                             │ [3.2 Cross-Chain Axelar  │
│ (SEP-0008 KYC Regulated) │                             │   Bridge (Stellar ↔ ETH)]│
└─────────────┬────────────┘                             └─────────────┬────────────┘
              │                                                        │
              └───────────────────────────┬────────────────────────────┘
                                          │
                                          ▼
                         ┌──────────────────────────────────┐
                         │ [3.3 Social Copy-Trading]        │
                         └────────────────┬─────────────────┘
                                          │
                                          ▼
                         ┌──────────────────────────────────┐
                         │ [3.4 NW Governance Token & DAO]  │
                         └──────────────────────────────────┘
```

---

## 5. Master Roadmap Timeline Matrix

| Milestone | Target Horizon | Rough Duration | Critical Prerequisites | Risk Level |
|:---|:---|:---:|:---|:---:|
| **2.1 Multi-Protocol Aggregation** | Q4 2026 | 6–8 Weeks | DEX Pool Adapters | Medium |
| **2.2 AI Risk Scoring & Backtesting** | Q4 2026 | 4–6 Weeks | Historical Indexing DB | Low |
| **2.3 Personalized Risk Profiles** | Q1 2027 | 3–5 Weeks | 2.1 Aggregator | Low |
| **2.4 Earnings Projections** | Q1 2027 | 3–4 Weeks | Realized APY math | Low |
| **3.1 Real-World Assets (RWA)** | Q2 2027 | 8–12 Weeks | Regulatory KYC & Issuer partner | High |
| **3.2 Cross-Chain Axelar Bridging** | Q2 2027 | 8–10 Weeks | Axelar Soroban Relayers | High |
| **3.3 Social Copy-Trading** | Q3 2027 | 6–8 Weeks | 2.3 Risk Profiles | Medium |
| **3.4 NW Governance Token** | Q3–Q4 2027 | 10–14 Weeks | Multi-venue stability & Audit | High |

---

## 6. Community Input & Feature Proposal Process

NeuroWealth is built as an open-source public good for the Stellar ecosystem. We actively invite developers, liquidity providers, and community members to propose new features, suggest protocol integrations, and shape roadmap priorities.

### 6.1 How to Propose a Feature (RFC Process)
1. **Initial Idea Discussion:**
   - Open a topic in [GitHub Discussions](https://github.com/Shackole/NeuroWealth-Smartcontract/discussions) under the **Ideas** category.
   - Describe the problem, user story, and potential implementation approach.
2. **Formal Request for Comments (RFC):**
   - If the proposal receives community interest, submit an RFC pull request adding a draft to `docs/rfcs/RFC-XXXX-feature-title.md`.
   - The RFC must detail:
     - High-level architecture and smart contract implications.
     - Security considerations and threat analysis.
     - Gas/CPU budget estimation on Soroban.
     - Alternatives considered and trade-offs.
3. **Core Team & Community Review:**
   - RFCs are reviewed during bi-weekly engineering calls.
   - Community sentiment is gathered via Discord/GitHub polls.
4. **Acceptance & Implementation:**
   - Once approved, an issue is opened with defined Acceptance Criteria and added to the official roadmap milestone.

---

## 7. References

- [`README.md`](../README.md) — Protocol overview and summary roadmap.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — Core vault storage layout, math, and lifecycle state machines.
- [`SECURITY.md`](../SECURITY.md) — Threat model, security boundaries, and pause runbooks.
- [`docs/BLEND_INTEGRATION_RESEARCH.md`](BLEND_INTEGRATION_RESEARCH.md) — Blend lending pool integration patterns.
- [`docs/DEX_INTEGRATION.md`](DEX_INTEGRATION.md) — Automated market maker integration and liquidity routing.
- [`docs/GUARDIAN_KEY_DESIGN.md`](GUARDIAN_KEY_DESIGN.md) — Second-signature upgrade security architecture.
