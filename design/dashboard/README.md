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
