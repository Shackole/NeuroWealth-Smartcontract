# Empty States Design Specification

**Issue:** #100
**Status:** Design Ready
**Component:** All list and data views (Dashboard, Transaction History, Earnings Chart)

## Overview

Empty states are shown before a user has made their first deposit or has any transaction history.
All empty states must be encouraging and action-oriented — not just "Nothing here".

## Design Principles

- **Encouraging tone**: Guide the user toward their first action
- **Consistent visual language**: Use the same illustration style across all empty states
- **Clear CTAs**: Every empty state has one primary action button
- **Responsive**: Desktop (1440px), tablet (768px), and mobile (375px) layouts
- **Accessible**: All illustrations have `aria-label`, all text meets WCAG 2.1 AA contrast
- **Dark mode**: All states have dark mode variants

---

## Empty State Components

### 1. Dashboard — Zero Balance

**Trigger**: User has authenticated but has never deposited.

**Layout** (ASCII wireframe):
```
┌─────────────────────────────────────────┐
│                                         │
│         [Illustration: Rocket/Seed]     │
│                                         │
│    Start growing your savings today     │
│                                         │
│  Your NeuroWealth vault is ready.       │
│  Deposit USDC and let AI find the       │
│  best yield — automatically.            │
│                                         │
│        [ Start Earning → ]              │
│                                         │
└─────────────────────────────────────────┘
```

**Elements**:

| Element | Spec |
|---------|------|
| Illustration | SVG icon — `heroicons/outline/rocket-launch` or custom branded |
| Heading | "Start growing your savings today" — 24px, font-bold |
| Supporting text | "Your NeuroWealth vault is ready. Deposit USDC and let AI find the best yield — automatically." — 16px, text-muted |
| CTA button | "Start Earning →" — links to `/deposit`, primary brand colour, pill shape |
| Icon size | 96×96px desktop, 80×80px mobile |

**Dark mode**: Background `bg-gray-900`, heading `text-white`, body `text-gray-400`, CTA button unchanged.

---

### 2. Transaction History — No Transactions

**Trigger**: User has no transaction history.

**Layout** (ASCII wireframe):
```
┌─────────────────────────────────────────┐
│                                         │
│        [Icon: document-text]            │
│                                         │
│         No transactions yet             │
│                                         │
│  Your deposits, withdrawals, and        │
│  earnings will appear here.             │
│                                         │
│     [ Make your first deposit ]         │
│                                         │
└─────────────────────────────────────────┘
```

**Elements**:

| Element | Spec |
|---------|------|
| Icon | `heroicons/outline/document-text`, 64×64px, brand colour |
| Heading | "No transactions yet" — 20px, font-semibold |
| Supporting text | "Your deposits, withdrawals, and earnings will appear here." — 14px, text-muted |
| CTA link | "Make your first deposit" — text link, underline on hover, links to `/deposit` |

---

### 3. Earnings Chart — No Earnings History

**Trigger**: User has no earnings data (no deposits made).

**Layout**: Chart area replaced with a placeholder that includes a dashed projection curve, label, body copy, and CTA.

**Elements**:

| Element | Spec |
|---------|------|
| Placeholder chart | SVG dashed line curve — light brand colour, subtle animated pulse |
| Projection label | "Your projected earnings (illustrative)" — 12px, text-muted, italic |
| Heading | "Watch your savings grow" — 20px, font-semibold |
| Supporting text | "Deposit USDC to start earning yield. Your earnings chart will appear here once you make your first deposit." — 14px, text-muted |
| CTA button | "Deposit Now" — links to `/deposit`, primary brand colour |

> The dashed projection line is illustrative only. It must be clearly labelled `(illustrative)` to avoid misleading users about expected returns.

---

## Responsive Behaviour

| Breakpoint | Layout change |
|------------|---------------|
| Desktop 1440px | Centred column, max-width 480px, illustration above text |
| Tablet 768px | Same as desktop, padding reduced |
| Mobile 375px | Full-width, illustration 64×64px, font sizes reduced by 2px |

---

## Interactive States

| State | Behaviour |
|-------|-----------|
| Hover (CTA button) | Lighten by 10%, scale 1.02 |
| Loading | Skeleton placeholder shown while auth state resolves |
| Error | "Something went wrong" with retry button — separate from empty state |

---

## Illustration Guidelines

- **Source**: [Heroicons](https://heroicons.com/) outline set (MIT licence) or custom branded SVG
- **Colour**: Primary brand colour at 60% opacity for light mode, 80% for dark mode
- **Style**: Line-art (outline), 2px stroke weight, rounded caps
- **Accessibility**: All illustrations exported as SVG with `role="img"` and `aria-label`

---

## Tone Guide

| ❌ Avoid | ✅ Use instead |
|---------|---------------|
| "Nothing here" | "Start growing your savings today" |
| "No data" | "Your chart will appear after your first deposit" |
| "Empty" | "Your NeuroWealth vault is ready" |
| Passive voice | Action-oriented language |

---

## Accessibility Requirements

- All illustrations: `role="img"` with descriptive `aria-label`
- CTA buttons: Minimum 44×44px tap target
- Text contrast: ≥ 4.5:1 (WCAG 2.1 AA) for body text, ≥ 3:1 for large heading text
- Dark mode: All colour pairs re-verified for contrast
- Screen reader: Empty state heading announced via `aria-live="polite"` region

---

## Implementation Notes (Frontend)

- **Framework**: Next.js 15 with Tailwind CSS
- **Component**: `<EmptyState illustration={...} heading={...} body={...} cta={...} />` shared component
- The component accepts a `darkMode` prop (or reads from system preference via `prefers-color-scheme`)
- Illustration variants imported as React SVG components from `components/illustrations/`
- CTA `href` prop links to the deposit flow (`/deposit`)

---

## File References

| File | Purpose |
|------|---------|
| `design/empty-states/README.md` | Design handoff notes and asset inventory |
| `design/empty-states/dashboard-empty-desktop.png` | Dashboard empty state mockup (desktop) — placeholder |
| `design/empty-states/dashboard-empty-mobile.png` | Dashboard empty state mockup (mobile) — placeholder |
| `design/empty-states/tx-history-empty.png` | Transaction history empty state — placeholder |
| `design/empty-states/earnings-chart-empty.png` | Earnings chart placeholder — placeholder |
