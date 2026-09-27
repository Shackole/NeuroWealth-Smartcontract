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
