# NeuroWealth Frontend Dashboard

Next.js 15 Web Application with Tailwind CSS, `@stellar/stellar-sdk`, `@stellar/freighter-api`, and Recharts portfolio analytics.

## Features
- **Next.js 15 App Router**: High-performance React 18 server and client components.
- **Tailwind CSS Design System**: Vibrant dark mode UI with glassmorphism panels, custom color tokens, and micro-interactions.
- **Freighter Wallet Integration**: Non-custodial wallet connection & transaction signing.
- **Vault Contract Integration**: Connects to Soroban vault smart contract getters (`get_balance`, `get_exchange_rate`, `get_user_strategy`).
- **Portfolio Analytics**: Interactive Recharts area chart for tracking portfolio growth and accrued yield.
- **Deposit & Withdraw Modal**: Previews share minting/burning rates with real-time exchange rates.
- **Transaction History**: Displays recent on-chain events with Stellar Explorer links.

## Setup & Running
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## Vault Terminology Glossary

This glossary establishes canonical definitions for key vault terms across user interfaces, translations (`next-intl`), and maintainer documentation. Translators and component authors should reference these definitions and usage examples to ensure consistent terminology throughout the dashboard.

### 1. Shares
- **Definition**: Shares represent proportional fractional ownership of the vault's total pool of capital. When a user deposits assets, the contract mints shares based on the prevailing exchange rate. When withdrawing, shares are burned to return the corresponding amount of underlying assets. As yield accumulates in the vault without increasing total shares, each share appreciates in asset value.
- **Formulas**:
  - Deposit: $\text{shares} = \lfloor \frac{\text{assets} \times \text{TotalShares}}{\text{TotalAssets}} \rfloor$
  - Withdrawal: $\text{assets} = \lfloor \frac{\text{shares} \times \text{TotalAssets}}{\text{TotalShares}} \rfloor$
- **Usage Examples**:
  - [frontend/src/components/ShareRateCard.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/ShareRateCard.tsx): Displays current user share holdings and the exchange rate (assets per share).
  - [frontend/src/components/DepositForm.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/DepositForm.tsx): Calculates and previews the estimated shares to be minted upon deposit.
  - [frontend/src/components/WithdrawForm.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/WithdrawForm.tsx): Computes the number of shares that will be burned to redeem a requested asset amount.

### 2. Assets
- **Definition**: Assets refer to the underlying denomination token (USDC on Stellar) managed by the vault. On-chain, assets are stored as signed 128-bit integers (`i128`) with 7 decimal places (`1 USDC = 10,000,000` base units). Total assets comprise both idle USDC held directly in the contract reserves and capital actively deployed to external yield protocols.
- **Usage Examples**:
  - [frontend/src/components/AssetOverview.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/AssetOverview.tsx): Visualizes the breakdown between idle USDC reserves and deployed protocol assets.
  - [frontend/src/components/BalanceCard.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/BalanceCard.tsx): Displays user's total portfolio asset value in formatted USDC currency.
  - [frontend/src/components/PortfolioDashboard.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/PortfolioDashboard.tsx): Aggregates total asset metrics and portfolio composition.

### 3. Allocation
- **Definition**: Allocation denotes the distribution of deployed capital across external yield-generating venues (e.g., Blend lending pools vs. Stellar DEX liquidity pools), configured in basis points ($10,000\text{ bps} = 100\%$). In addition, it describes a user's advisory investment strategy tier (`conservative`, `balanced`, or `growth`) which informs agent portfolio rebalancing targets.
- **Usage Examples**:
  - [frontend/src/components/StrategySelector.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/StrategySelector.tsx): Provides an interactive UI for users to inspect and select their allocation strategy tier.
  - [frontend/src/components/StrategyBadge.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/StrategyBadge.tsx): Renders a consistent visual badge representing the active strategy allocation.
  - [ARCHITECTURE.md](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/ARCHITECTURE.md#L623-L647): Documents the smart contract's multi-protocol allocation weights (`BlendAllocationBps` and `DexAllocationBps`).

### 4. Yield
- **Definition**: Yield is the net return generated by the vault from external protocol activities (interest earned from lending on Blend or liquidity fees from the Stellar DEX). Yield increases `TotalAssets` relative to `TotalShares`, leading to an appreciated exchange rate. It is displayed as both an Annual Percentage Yield (APY, expressed in basis points) and cumulative earned profit in USDC.
- **Usage Examples**:
  - [frontend/src/components/APYDisplay.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/APYDisplay.tsx): Renders annualized yield (APY) metrics and badges across strategy options.
  - [frontend/src/components/EarningsCard.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/EarningsCard.tsx): Summarizes cumulative earned yield and today's yield gain for the connected account.
  - [frontend/src/components/EarningsHistoryChart.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/EarningsHistoryChart.tsx): Charts historical yield accumulation and portfolio growth trajectories over time.

### 5. Queued Withdrawal
- **Definition**: A queued withdrawal describes a temporary off-chain lifecycle state where a redemption request is enqueued in the application or agent processing pipeline (e.g. Bull queue or wallet transaction broadcast buffer) awaiting ledger settlement. Crucially, the Soroban smart contract itself does not possess an on-chain withdrawal queue; all on-chain withdrawals execute synchronously within a single transaction, or perform an immediate partial fill if external protocol liquidity is constrained.
- **Usage Examples**:
  - [frontend/src/components/TransactionProgress.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/TransactionProgress.tsx): Displays transaction lifecycle indicators (`queued` $\rightarrow$ `simulating` $\rightarrow$ `signing` $\rightarrow$ `submitting` $\rightarrow$ `confirmed`).
  - [frontend/src/components/WithdrawalModal.tsx](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/frontend/src/components/WithdrawalModal.tsx): Handles withdrawal submission flow and asynchronous transaction confirmation feedback.
  - [docs/WITHDRAWAL_LIFECYCLE.md](file:///C:/Users/HP/Downloads/NeuroWealth-Smartcontract/docs/WITHDRAWAL_LIFECYCLE.md#L1-L50): Detailed architecture guide clarifying synchronous contract redemption vs. off-chain queue infrastructure.

