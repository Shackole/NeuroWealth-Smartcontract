# Empty States — Design Handoff

**Issue:** #100
**Spec:** [docs/EMPTY_STATES_DESIGN.md](../../docs/EMPTY_STATES_DESIGN.md)

## Asset Inventory

| View | State | Desktop | Mobile | Dark Mode |
|------|-------|---------|--------|-----------|
| Dashboard | Zero balance | `dashboard-empty-desktop.png` | `dashboard-empty-mobile.png` | Both variants |
| Transaction History | No transactions | `tx-history-empty.png` | `tx-history-empty-mobile.png` | Both variants |
| Earnings Chart | No earnings | `earnings-chart-empty.png` | `earnings-chart-empty-mobile.png` | Both variants |

> **Note:** PNG mockup files are placeholders. Replace with Figma exports or final design assets.
> Figma link (if applicable): _Add Figma file link here._

---

## Design Decisions

1. **Shared `<EmptyState>` component** — All three views reuse the same base component with different props, ensuring visual consistency and a DRY implementation.

2. **Illustrative earnings projection** — The earnings chart placeholder uses a dashed SVG curve (not real data) to set expectations and motivate the first deposit. It is clearly labelled `(illustrative)` to avoid misleading users.

3. **No negative language** — Copy review confirmed no instance of "Nothing", "No data", or "Empty" used as a standalone message. All copy guides users toward action.

4. **Heroicons chosen for MVP** — Custom branded illustrations can be substituted post-MVP without changing the component interface (swap the SVG import).

## Wallet, portfolio, and history states (Issue #492)

These are distinct states, not a shared “zero” screen. An RPC or history error
must never be rendered as a zero balance or as an empty transaction list.

| State | Heading and explanation | Primary action | Secondary behavior |
|---|---|---|---|
| No wallet connected | “Connect a wallet” / “Connect a Stellar wallet to view your USDC balance and vault activity.” | `Connect wallet` | Explain which Stellar network is selected before the wallet prompt. Do not show a zero balance. |
| Wallet connected, no deposits | “Your vault is ready” / “This wallet has no NeuroWealth deposits yet.” | `Deposit USDC` | Show the connected address and network. Link to learn how deposits and fees work. |
| Portfolio exists, history unavailable | “Activity could not be loaded” / “Your balance is available, but transaction history did not load.” | `Retry history` | Keep the known balance visible and label the history error independently. Never show “No transactions.” |
| Portfolio data unavailable | “Balance could not be loaded” / “The app could not reach the selected Stellar network.” | `Retry connection` | Show the selected network and a compact technical reference. Do not substitute `0 USDC`. |
| History loaded, no records | “No activity yet” / “Transactions for this wallet will appear here.” | `Make your first deposit` | Use only after a successful history response confirms an empty result. |

### Responsive examples

- **Desktop (1440 px):** keep the state centered within the affected card or
  dashboard column. A portfolio-data error can coexist with independently
  loaded APY or protocol cards; do not blank the whole dashboard.
- **Mobile (375 px):** stack heading, one or two lines of explanation, then a
  full-width primary action. Keep the wallet/network status visible and avoid
  horizontal tables or side-by-side buttons.
- **All widths:** use a minimum 44 × 44 px action target, visible keyboard
  focus, readable contrast, and an announced status/error region. Loading is a
  separate state and must not flash an empty-state message before data resolves.

---

## Responsive Grid

- 12-column responsive grid (`container mx-auto`)
- Empty state centred in content area using `flex items-center justify-center`
- Minimum height: `min-h-[320px]` on desktop, `min-h-[240px]` on mobile

---

## Acceptance Checklist

- [ ] Dashboard empty state — illustration, heading, body, CTA (`Start Earning →` → `/deposit`)
- [ ] Transaction history empty state — icon, heading, body, CTA link (`Make your first deposit`)
- [ ] Earnings chart placeholder — dashed projection line labelled `(illustrative)`, heading, body, CTA
- [ ] Dark mode variants for all three states
- [ ] Mobile (375px) layout verified
- [ ] Desktop (1440px) layout verified
- [ ] All illustrations have `role="img"` and `aria-label`
- [ ] CTA buttons meet 44×44px minimum tap target
- [ ] Text contrast ≥ 4.5:1 verified in both light and dark modes
- [ ] Tone review: no passive/negative copy
- [ ] Assets exported to `design/empty-states/` as PNG or SVG
