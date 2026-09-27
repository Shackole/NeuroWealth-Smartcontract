# NeuroWealth Design System

Comprehensive design language for the NeuroWealth AI-powered DeFi platform.  
All tokens are defined in [`frontend/tailwind.config.js`](../frontend/tailwind.config.js) and
[`frontend/src/lib/design-tokens.ts`](../frontend/src/lib/design-tokens.ts).

---

## Table of Contents

1. [Colour Palette](#colour-palette)
2. [Typography Scale](#typography-scale)
3. [Spacing Scale](#spacing-scale)
4. [Component Inventory](#component-inventory)
5. [Accessibility](#accessibility)
6. [Storybook](#storybook)
7. [Usage Conventions](#usage-conventions)

---

## Colour Palette

All colours are defined with a full 50–950 scale and named semantically.

### Primary — Emerald (`primary`)
Main brand colour. Used for primary CTAs, success states, and brand identity.

| Token          | Hex       | Use |
|----------------|-----------|-----|
| `primary-50`   | `#ecfdf5` | Tinted backgrounds |
| `primary-100`  | `#d1fae5` | Hover tints |
| `primary-300`  | `#6ee7b7` | Light accents |
| `primary-400`  | `#34d399` | Light mode interactive |
| `primary-500`  | `#10b981` | **Brand default — CTA buttons** |
| `primary-600`  | `#059669` | Button hover, active states |
| `primary-700`  | `#047857` | Dark mode CTA |
| `primary-900`  | `#064e3b` | Text on light tinted bg |
| `primary-950`  | `#022c22` | Deepest dark bg accent |

### Secondary — Indigo (`secondary`)
Charts, highlights, and secondary CTAs.

| Token            | Hex       | Use |
|------------------|-----------|-----|
| `secondary-300`  | `#a5b4fc` | Chart lines, dark mode |
| `secondary-500`  | `#6366f1` | **Secondary CTA, chart fill** |
| `secondary-600`  | `#4f46e5` | Hover state |

### Accent — Sky (`accent`)
Links and informational states.

| Token         | Hex       | Use |
|---------------|-----------|-----|
| `accent-400`  | `#38bdf8` | Dark mode links |
| `accent-500`  | `#0ea5e9` | **Link colour** |
| `accent-600`  | `#0284c7` | Link hover |

### Semantic colours

| Name          | Light mode  | Dark mode   | Use |
|---------------|-------------|-------------|-----|
| `success-500` | `#22c55e`   | `#22c55e`   | Positive yield, confirmed |
| `warning-500` | `#f59e0b`   | `#f59e0b`   | Rate limit, caution |
| `error-500`   | `#ef4444`   | `#ef4444`   | Error, destructive |
| `neutral-*`   | slate scale | slate scale | Text, borders, surfaces |

### Surface tokens (semantic aliases)

| Token               | Light      | Dark       |
|---------------------|------------|------------|
| `surface`           | `#ffffff`  | `#080b11`  |
| `card`              | `#f8fafc`  | `#121824`  |
| `border`            | `#e2e8f0`  | `#1e293b`  |
| `muted`             | `#64748b`  | `#94a3b8`  |

---

## Typography Scale

Font: **Inter** (loaded via `next/font/google`).  
Monospace numbers: **JetBrains Mono** (balances, APY, amounts).

### Headings

| Level  | Size    | Weight    | Line-height | Letter-spacing | Tailwind class |
|--------|---------|-----------|-------------|----------------|----------------|
| `h1`   | 36 px   | ExtraBold | 1.2         | -0.01em        | `text-h1`      |
| `h2`   | 30 px   | Bold      | 1.25        | -0.01em        | `text-h2`      |
| `h3`   | 24 px   | SemiBold  | 1.3         | 0              | `text-h3`      |
| `h4`   | 20 px   | SemiBold  | 1.4         | 0              | `text-h4`      |

### Body

| Name       | Size    | Weight  | Line-height | Tailwind class  |
|------------|---------|---------|-------------|-----------------|
| Body LG    | 18 px   | Regular | 1.75        | `text-body-lg`  |
| Body       | 16 px   | Regular | 1.75        | `text-body`     |
| Body SM    | 14 px   | Regular | 1.6         | `text-body-sm`  |

### Caption & Labels

| Name    | Size    | Weight   | Tailwind class |
|---------|---------|----------|----------------|
| Caption | 12 px   | Regular  | `text-caption` |
| Label   | 12 px   | SemiBold | `text-label`   |

Labels use `text-transform: uppercase` and `letter-spacing: 0.05em`.

### Mono numbers (balances, amounts, APY)

| Name       | Size    | Tailwind class  |
|------------|---------|-----------------|
| Mono XL    | 32 px   | `text-mono-xl`  |
| Mono LG    | 24 px   | `text-mono-lg`  |
| Mono MD    | 20 px   | `text-mono-md`  |
| Mono SM    | 16 px   | `text-mono-sm`  |
| Mono XS    | 14 px   | `text-mono-xs`  |

---

## Spacing Scale

Follows Tailwind's default **4 px base grid**. All spacing values are multiples of 4 px.

| Token  | Value  | Use case |
|--------|--------|----------|
| `0`    | 0 px   | Reset |
| `1`    | 4 px   | Micro gaps (icons, tight labels) |
| `2`    | 8 px   | XS gap |
| `3`    | 12 px  | SM gap (inline button icons) |
| `4`    | 16 px  | **Base unit** — default padding |
| `5`    | 20 px  | |
| `6`    | 24 px  | LG gap — card internal padding |
| `8`    | 32 px  | XL gap |
| `10`   | 40 px  | |
| `12`   | 48 px  | 2XL — section padding |
| `16`   | 64 px  | 3XL |
| `24`   | 96 px  | 4XL — hero padding |

### Component spacing conventions

| Component          | Padding        |
|--------------------|----------------|
| Card (default)     | `p-6` (24 px)  |
| Card (compact)     | `p-4` (16 px)  |
| Button SM          | `py-1.5 px-3`  |
| Button MD          | `py-3 px-4`    |
| Button LG          | `py-3.5 px-6`  |
| Input              | `py-3 px-4`    |
| Modal              | `p-6` (24 px)  |
| Section (desktop)  | `py-12` (48px) |

---

## Component Inventory

All reusable UI components live in `frontend/src/components/ui/`.

### Primitives

| Component | File             | Description |
|-----------|------------------|-------------|
| `Button`  | `ui/Button.tsx`  | Primary interactive element. 5 variants × 3 sizes. |
| `Badge`   | `ui/Badge.tsx`   | Inline status label. 7 colour variants. |
| `Card`    | `ui/Card.tsx`    | Content container. 4 variants + sub-components. |
| `Input`   | `ui/Input.tsx`   | Text input with label, helper text, error. |

### Composite components (existing)

| Component            | File                          | Description |
|----------------------|-------------------------------|-------------|
| `BalanceCard`        | `components/BalanceCard.tsx`  | Portfolio value with deposit/withdraw CTAs |
| `EarningsCard`       | `components/EarningsCard.tsx` | Yield earned display with APY |
| `StrategyBadge`      | `components/StrategyBadge.tsx`| Strategy selector (conservative/balanced/growth) |
| `ActionModal`        | `components/ActionModal.tsx`  | Deposit/Withdraw modal dialog |
| `Header`             | `components/Header.tsx`       | Top navigation with wallet connect |
| `PortfolioChart`     | `components/PortfolioChart.tsx`| Recharts line chart for portfolio history |
| `TransactionHistory` | `components/TransactionHistory.tsx` | Paginated transaction list |
| `WalletConnect`      | `components/WalletConnect.tsx`| Freighter wallet connection button |
| `ThemeToggle`        | `components/ThemeToggle.tsx`  | Dark/light mode toggle |
| `LanguageSwitcher`   | `components/LanguageSwitcher.tsx` | i18n language selector |
| `OnboardingTutorial` | `components/OnboardingTutorial.tsx` | First-run guidance flow |

### Usage guidelines

**Button**
- One `primary` button per view section maximum.
- `secondary` for cancel / back actions.
- `danger` requires confirmation dialog before execution.
- Always set `aria-label` on icon-only ghost buttons.

**Badge**
- Use `dot` variant for live status indicators.
- Use `live` prop for badges that update dynamically (APY, balance).
- Don't use colour as the sole indicator — always include text.

**Card**
- Use `glass` only on dark (`bg-surface-dark`) backgrounds.
- Add `aria-label` on `Card` when it represents a navigation landmark.
- `interactive` cards must have an accessible focus indicator (built in).

**Input**
- Always provide a visible `label` prop — never use placeholder as label.
- Use `helperText` for formatting hints; `error` for validation messages.
- Numeric inputs for amounts should use `type="number"` and `step="0.01"`.

---

## Accessibility

All components target **WCAG 2.1 Level AA**.

### Colour contrast

| Combination                         | Ratio  | WCAG AA |
|-------------------------------------|--------|---------|
| White on `primary-500` (#10b981)    | 3.04:1 | ✅ (large text / UI component) |
| White on `primary-600` (#059669)    | 4.63:1 | ✅ |
| White on `error-600` (#dc2626)      | 4.56:1 | ✅ |
| `neutral-700` on white              | 9.73:1 | ✅ |
| `neutral-500` on white (muted)      | 4.63:1 | ✅ |
| `primary-500` on `neutral-950`      | 4.80:1 | ✅ (dark mode) |

### Focus management
- All interactive elements use `focus-visible:ring-2` — mouse users don't see the ring.
- Focus ring offset uses the page background colour so it's always visible.
- Modals trap focus using the browser's native `<dialog>` where possible.

### ARIA patterns
- Buttons: `aria-disabled`, `aria-busy` for loading state.
- Inputs: `aria-required`, `aria-invalid`, `aria-describedby` for errors.
- Badges: `role="status"` when content updates dynamically.
- Cards: optional `aria-label` for landmark identification.

### Motion
- All animations respect `prefers-reduced-motion` via Tailwind's `motion-reduce:` variant.

---

## Storybook

Storybook is configured in `frontend/.storybook/` (after running `npx storybook init`).

### Setup

```bash
cd frontend
npx storybook@latest init
npm run storybook
```

Stories live alongside components as `ComponentName.stories.tsx`.

### Available stories

| Story                    | Path |
|--------------------------|------|
| Design System / Button   | `ui/Button.stories.tsx` |
| Design System / Badge    | `ui/Badge.stories.tsx`  |
| Design System / Card     | `ui/Card.stories.tsx`   |

---

## Usage Conventions

### Importing tokens

```ts
// Tailwind classes (preferred in JSX)
className="bg-primary-500 text-white rounded-xl px-4 py-3"

// TypeScript tokens (for dynamic values, charts, canvas)
import { tokens } from '@/lib/design-tokens';
const color = tokens.colors.primary[500]; // '#10b981'
```

### Dark mode

All components support dark mode via Tailwind's `darkMode: 'class'` strategy.  
Toggle by adding/removing `dark` class on `<html>`.

```tsx
// ThemeProvider sets class='dark' on <html>
<div className="bg-surface dark:bg-surface-dark">
  <span className="text-neutral-900 dark:text-neutral-100">Balance</span>
</div>
```

### Responsive design

Follow mobile-first conventions. Default styles target mobile; use `sm:`, `md:`, `lg:` for
progressively wider layouts.

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```
