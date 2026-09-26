# Dashboard Wireframes & High-Fidelity Mockups

**Issue:** #98
**Status:** Design Specification
**Breakpoints:** Desktop 1440px · Tablet 768px · Mobile 375px

## Overview

This document specifies the wireframes and high-fidelity design for the NeuroWealth main dashboard page.
The dashboard is the primary surface a user sees after logging in — it shows portfolio value, earnings,
strategy, and quick action buttons.

---

## Layout — Desktop (1440px)

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Logo · Nav links · Wallet connect button               │
├──────────────────────────────┬──────────────────────────────────┤
│                              │                                  │
│   BALANCE CARD               │   EARNINGS CHART (AreaChart)     │
│   ┌──────────────────────┐   │   ┌──────────────────────────┐  │
│   │ Total Balance        │   │   │  ~ 8.4% APY              │  │
│   │ $1,234.56 USDC       │   │   │  Earnings over time      │  │
│   │ ↑ +$12.34 today      │   │   │  [Recharts AreaChart]    │  │
│   └──────────────────────┘   │   └──────────────────────────┘  │
│                              │                                  │
│   STRATEGY INDICATOR         │   APY DISPLAY                    │
│   ┌──────────────────────┐   │   ┌──────────────────────────┐  │
│   │ 🟢 Balanced          │   │   │  Current APY: 8.4%       │  │
│   │ [Switch strategy]    │   │   │  7-day avg: 8.1%         │  │
│   └──────────────────────┘   │   └──────────────────────────┘  │
│                              │                                  │
├──────────────────────────────┴──────────────────────────────────┤
│                                                                 │
│   QUICK ACTION BUTTONS                                          │
│   [ Deposit ]   [ Withdraw ]   [ Switch Strategy ]             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   RECENT TRANSACTIONS (last 5)                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ + Deposit  100 USDC   Sep 25 · Balanced · +0.23 earned  │  │
│   │ - Withdraw  50 USDC   Sep 20 · Balanced                 │  │
│   └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Grid**: 12-column. Balance card + strategy: `col-span-5`. Earnings chart + APY: `col-span-7`.
Quick actions and recent transactions: `col-span-12`.

---

## Layout — Tablet (768px)

- Two-column grid collapses to single column
- Balance card and earnings chart stack vertically
- Quick action buttons remain in a row (3 across)
- Recent transactions truncated to 3 entries

---

## Layout — Mobile (375px)

```
┌───────────────────────────┐
│  HEADER (hamburger menu)  │
├───────────────────────────┤
│  BALANCE CARD             │
│  $1,234.56 USDC           │
│  ↑ +$12.34 today          │
│  Strategy: Balanced 🟢    │
├───────────────────────────┤
│  EARNINGS CHART (compact) │
│  [Recharts AreaChart]     │
│  Current APY: 8.4%        │
├───────────────────────────┤
│  [ Deposit ] [Withdraw ]  │
│  [ Switch Strategy ]      │
├───────────────────────────┤
│  RECENT TRANSACTIONS (3)  │
└───────────────────────────┘
```

---

## Key Components

### 1. Balance Card

| Property | Spec |
|----------|------|
| Background | `bg-white` / `bg-gray-800` (dark) |
| Border | `rounded-2xl shadow-lg` |
| Balance font | 40px desktop, 32px mobile, `font-bold` |
| Delta | Green for positive, red for negative. Arrow icon + amount |
| Padding | `p-6` desktop, `p-4` mobile |

**Interactive states**:
- **Default**: shows balance + today's earnings delta
- **Loading**: skeleton shimmer on the balance value
- **Error**: "Balance unavailable — retry" with a refresh icon

### 2. Earnings Chart

| Property | Spec |
|----------|------|
| Library | Recharts `AreaChart` |
| Gradient fill | Brand primary → transparent |
| X-axis | Date labels — 7d / 30d / all tab switcher |
| Y-axis | USDC amount, abbreviated (K/M suffix) |
| Tooltip | Custom: date + earnings amount + APY on that date |
| Height | 240px desktop, 180px mobile |
| Animation | `isAnimationActive={true}`, 800ms ease-out |

**Interactive states**:
- **Loading**: pulsing skeleton rectangle
- **Empty**: dashed projection placeholder — see [Empty States Design](EMPTY_STATES_DESIGN.md)
- **Error**: "Chart unavailable" with retry CTA

### 3. Strategy Indicator

| Strategy | Colour dot | Badge colour |
|----------|------------|--------------|
| Conservative | Blue `#3B82F6` | `bg-blue-100 text-blue-700` |
| Balanced | Green `#22C55E` | `bg-green-100 text-green-700` |
| Growth | Purple `#A855F7` | `bg-purple-100 text-purple-700` |

- Clicking "Switch strategy" opens a strategy selector modal
- Current strategy name shown in uppercase, `font-medium`

### 4. APY Display

| Property | Spec |
|----------|------|
| Current APY | 32px, `font-bold`, green ≥ 5%, yellow 2–5%, red < 2% |
| 7-day average | 14px, `text-muted` |
| Source | Pulled from vault `get_exchange_rate` + protocol APY feed |

### 5. Quick Action Buttons

| Button | Style | Destination |
|--------|-------|-------------|
| Deposit | Primary — brand colour, pill, `px-6 py-3` | `/deposit` |
| Withdraw | Secondary — outlined, same sizing | `/withdraw` |
| Switch Strategy | Ghost — text + icon, same sizing | Strategy modal |

**Interactive states**:
- **Hover**: scale 1.02, lighten 10%
- **Disabled**: `opacity-50 cursor-not-allowed` (wallet not connected)
- **Loading**: spinner replaces label during active transaction

---

## Grid System

```
Desktop:
  Balance card + strategy:  col-span-5
  Earnings chart + APY:     col-span-7
  Quick actions:            col-span-12
  Recent transactions:      col-span-12

Tablet (768px):             all cards col-span-12
Mobile (375px):             all cards col-span-12, reduced gap
```

Tailwind: `grid grid-cols-12 gap-6` (desktop), `gap-4` (mobile).

---

## Typography

| Element | Font size | Weight |
|---------|-----------|--------|
| Page title | 32px | Bold |
| Balance | 40px | Extra-bold |
| Section labels | 14px | Semibold, uppercase, letter-spacing |
| Body / metadata | 14px | Regular |
| Chart labels | 12px | Regular |

Font family: System font stack (`font-sans`). Inter preferred if available.

---

## Dark Mode

| Light | Dark |
|-------|------|
| `bg-white` | `bg-gray-900` |
| `bg-gray-50` (page bg) | `bg-gray-950` |
| `text-gray-900` | `text-white` |
| `text-gray-500` | `text-gray-400` |
| Card `shadow-lg` | Card `border border-gray-700` |
| Chart gradient fill | Same gradient, 80% opacity |

Dark mode activated via `class="dark"` on `<html>` (Tailwind `darkMode: 'class'`).

---

## Interactive State Annotations

### Hover
- Cards: subtle border highlight `ring-1 ring-brand/20`
- Buttons: scale(1.02) + 10% lighter background
- Chart data points: custom tooltip appears on hover

### Loading
- Balance card: skeleton shimmer on amount field
- Chart: grey pulsing rectangle
- APY display: "---" placeholder

### Error
- Balance card: alert icon + "Balance unavailable" + retry button
- Chart: error message inline + retry CTA
- Strategy: last known strategy shown with `!` indicator badge

### Empty
- See [Empty States Design](EMPTY_STATES_DESIGN.md) for full empty state specs

---

## Spacing & Sizing Reference

| Token | Value |
|-------|-------|
| Page horizontal padding | `px-6` (24px) desktop, `px-4` (16px) mobile |
| Card padding | `p-6` (24px) desktop, `p-4` (16px) mobile |
| Gap between cards | `gap-6` (24px) desktop, `gap-4` (16px) mobile |
| Button height | 48px desktop, 44px mobile (min tap target) |
| Border radius (cards) | `rounded-2xl` (16px) |
| Border radius (buttons) | `rounded-full` (pill) |

---

## Handoff

Mockup assets in `design/dashboard/`. See [`design/dashboard/README.md`](../design/dashboard/README.md)
for the full asset inventory, design decision rationale, and acceptance checklist.

For the Recharts `AreaChart` reference design, see the
[Recharts AreaChart documentation](https://recharts.org/en-US/api/AreaChart).
