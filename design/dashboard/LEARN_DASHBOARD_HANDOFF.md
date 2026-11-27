# Learn-to-Dashboard Handoff

**Issue:** #691  
**Workstream:** UI/UX — NeuroWealth Learn Section  
**Target surfaces:** `/learn` glossary cards → `/dashboard` sections

---

## 1. Purpose

The Learn page explains DeFi concepts. Users who understand a concept should be
able to act on it immediately. This specification defines the link from each
educational topic to the matching live data surface on the dashboard, and the
path back to the glossary.

---

## 2. Topic-to-destination mapping

| Glossary topic | Dashboard anchor | Visible CTA text |
|---|---|---|
| APY — Annual Percentage Yield | `/dashboard#apy` | "View current APY on the dashboard" |
| Shares | `/dashboard#balance` | "View your share balance on the dashboard" |
| Exchange Rate | `/dashboard#chart` | "View the exchange-rate chart on the dashboard" |
| Rebalancing | `/dashboard#activity` | "View rebalance activity on the dashboard" |
| Blend Protocol | `/dashboard#strategy` | "View your strategy allocation on the dashboard" |
| DEX — Decentralised Exchange | `/dashboard#strategy` | "View your strategy allocation on the dashboard" |

---

## 3. Anchor fragment convention

Dashboard sections expose `id` attributes matching the fragments above:

| Fragment | Element | Component |
|---|---|---|
| `#apy` | APY display card | `APYDisplay` |
| `#balance` | Balance / shares card | `BalanceCard` |
| `#chart` | Exchange-rate chart | `ExchangeRateChart` |
| `#activity` | Transaction / rebalance feed | activity section |
| `#strategy` | Strategy selector / badge | `StrategyBadge` / `StrategySelector` |

The dashboard page must set these `id` attributes on the corresponding section
wrappers. If a section is conditionally rendered (e.g. hidden before wallet
connection), the fragment link scrolls to the nearest visible ancestor.

---

## 4. Return path

Every CTA link carries an `aria-label` that includes the phrase
"press Back to return here". This cues keyboard and screen-reader users that
the browser Back button returns them to the glossary entry.

The Learn page must retain scroll position when navigating back. Use
`scroll: false` on the Next.js `<Link>` is not applicable here (it is a
different-route navigation). Instead, the dashboard page must not replace the
browser history entry for the Back action — standard `<Link href="…">` without
`replace` satisfies this.

No query-string "returnTo" parameter is required; the browser history stack is
the return mechanism. The Back-link at the top of the Learn page ("← Back to
Dashboard") serves users who arrive from the dashboard and want to go back.

---

## 5. Accessibility requirements

- CTA links must be keyboard reachable (tab order after the glossary `<dd>`).
- Each link's `aria-label` must uniquely identify the destination and the
  return mechanism.
- The `<ArrowUpRight>` icon is `aria-hidden="true"`.
- Focus-visible ring: `focus-visible:ring-2 focus-visible:ring-emerald-500`.
- Contrast: emerald-400 (`#34d399`) on slate-800 (`#1e293b`) meets WCAG AA
  for non-body text at 14 px bold (ratio 4.7:1).

---

## 6. Acceptance criteria

| Criterion | Specification |
|---|---|
| Links present | Every glossary entry has a CTA link to its matching dashboard section |
| Destination accuracy | Each link navigates to the correct `#anchor` on the dashboard |
| Return path documented | Specification states browser Back as the canonical return mechanism |
| Screen-reader label | `aria-label` names destination and "press Back to return here" |
| Keyboard accessible | Links are reachable by Tab and activated by Enter |
