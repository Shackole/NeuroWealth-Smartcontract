# Dashboard — Design Handoff

**Issue:** #98
**Spec:** [docs/DASHBOARD_WIREFRAMES.md](../../docs/DASHBOARD_WIREFRAMES.md)

## Asset Inventory

| Asset | Breakpoint | File | Status |
|-------|------------|------|--------|
| Wireframe | Desktop 1440px | `wireframe-desktop-1440.png` | Placeholder |
| Wireframe | Tablet 768px | `wireframe-tablet-768.png` | Placeholder |
| Wireframe | Mobile 375px | `wireframe-mobile-375.png` | Placeholder |
| High-fidelity mockup | Desktop | `hifi-desktop.png` | Placeholder |
| High-fidelity mockup | Mobile | `hifi-mobile.png` | Placeholder |
| Dark mode mockup | Desktop | `hifi-desktop-dark.png` | Placeholder |
| Dark mode mockup | Mobile | `hifi-mobile-dark.png` | Placeholder |

> **Note:** PNG files are placeholders. Replace with Figma exports or final design assets.
> Figma link (if applicable): _Add Figma file link here._

---

## Tool

Preferred: **Figma**. Sketch or Adobe XD also accepted.

---

## Design Decisions

1. **Two-column layout on desktop** — Balance/strategy on the left (5 cols), chart/APY on the right
   (7 cols). The chart gets more horizontal space because it is the primary engagement surface and
   users scan left-to-right for portfolio health first, then growth trend.

2. **Recharts AreaChart** — Chosen to match the existing tech stack decision (`recharts` referenced
   in the README). Gradient fill from brand primary to transparent gives visual depth without
   obscuring the trend line.

3. **Strategy colour coding** — Conservative = blue (safe, calm), Balanced = green (growth,
   positive), Growth = purple (bold, aspirational). Consistent with common fintech conventions.

4. **Quick actions below the fold on desktop** — Deposit and Withdraw sit below the chart to reduce
   accidental clicks while reviewing the portfolio. On mobile they are prominently placed immediately
   after the chart since mobile users expect action-first flows.

5. **Skeleton loading over spinners** — Better perceived performance; avoids layout shift when data
   arrives. Each data region shows a shimmer skeleton at the correct size.

---

## Amount entry and transaction review (Issue #494)

Keep the amount field and primary action visually dominant. Put the precision
hint directly below the field; place the fee explanation in the review panel,
with a compact “Fee details” disclosure for the longer explanation.

| UI state | Primary copy | Recovery / detail |
|---|---|---|
| Amount entry | `Amount (USDC)` and the available wallet or vault balance | Accept up to 7 decimal places (`0.0000001 USDC` is one stroop). Never silently round a typed amount; show an inline correction if it has excess precision. |
| Below minimum | `Minimum deposit: {min} USDC` or the current withdrawal minimum | Keep the field value, focus the field, and explain the amount to enter. Do not show a generic transaction failure. |
| Above maximum/cap | `Maximum for this transaction: {max} USDC` and, where available, the remaining personal/vault cap | Explain which limit was reached and let the user edit the amount. Refresh cap data before offering retry. |
| Review | `You deposit/receive {amount} USDC` | Keep the asset amount separate from fees. If a withdrawal can partially fill because of protocol liquidity, say the received amount may be lower and that no remainder is queued. |
| Network fee | `Network fee (paid separately): about {fee} XLM` when an estimate is available | XLM is charged by the Stellar network; it is not subtracted from the USDC deposit or withdrawal. Show the wallet's final fee before approval. If there is no reliable estimate, say the wallet will show it. |
| Share estimate | `Estimated shares: {shares}` | Mark as an estimate and use the contract preview. Display precision explicitly; do not imply the estimate is a guaranteed fill or APY. |

The review remains one short column on mobile (375 px): amount, share estimate,
separate network fee, then the confirm action. Put explanatory detail behind a
disclosure and keep the action visible without horizontal scrolling. At desktop
(1440 px), show the same information in a two-column review card with amounts
right-aligned. Error copy must identify the correction before offering another
attempt.

## Acceptance Checklist

- [ ] Wireframes committed for desktop (1440px), tablet (768px), mobile (375px)
- [ ] High-fidelity mockups for desktop and mobile
- [ ] Dark mode variants for desktop and mobile
- [ ] Balance card: hover, loading, and error states annotated
- [ ] Earnings chart: hover tooltip, empty state, and error state annotated
- [ ] Strategy indicator: all three strategy colours and badge styles shown
- [ ] APY display: colour logic (green/yellow/red thresholds) annotated
- [ ] Quick action buttons: hover, disabled, and loading states shown
- [ ] Spacing tokens documented (padding, gap, border radius)
- [ ] Typography scale documented with px values
- [ ] 12-column grid overlay visible on desktop mockup
- [ ] All assets exported to `design/dashboard/` as PNG or SVG
- [ ] Figma (or tool) link added to this README
