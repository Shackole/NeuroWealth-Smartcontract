# Dashboard Disclosure Hierarchy — Design Specification

**Issue:** #687  
**Workstream:** UI/UX  
**Surface:** Dashboard, Deposit page, Withdraw page — all viewport widths

---

## 1. Purpose

Product disclosures (fee explanations, risk notices, regulatory footnotes, yield
disclaimers) must remain discoverable next to the figures and controls they qualify,
without crowding the primary interface. This spec defines a two-level visual hierarchy
— **compact** (always visible) and **expanded** (on demand) — and ensures both
treatments are readable at narrow viewport widths (375 px and up).

---

## 2. Disclosure Levels

### Level 1 — Inline notice (always visible)

A single-line or short two-line statement that qualifies a figure or control
immediately adjacent to it. The user does not need to interact to read it.

**Use when:** the disclosure is short enough to fit in ≤ 2 lines at 280 px wide,
and the information is essential (e.g. fee amounts, minimum deposit, network).

```
╔══════════════════════════════╗
║  Net APY  12.4%              ║
║  ─────────────────────────── ║
║  ⓘ Past performance does not ║
║    indicate future yield.    ║
╚══════════════════════════════╝
```

| Property | Value |
|----------|-------|
| Font size | `text-xs` (12 px) |
| Colour | `text-muted-foreground` |
| Icon | ⓘ (`InformationCircleIcon`, 14 × 14 px, `aria-hidden="true"`) |
| Max lines | 2 — if the text requires 3+ lines, use Level 2 instead |
| Margin | `mt-1` below the figure it qualifies |

---

### Level 2 — Expandable disclosure (compact + expanded)

A one-line summary with a toggle that reveals the full text. The collapsed line
gives enough context that the user can decide whether to read more.

**Use when:** the full disclosure exceeds 2 lines at 280 px, or when regulatory
copy must be present but should not compete with the primary controls.

#### Compact (collapsed) state

```
╔════════════════════════════════════════╗
║  Network fee  ~0.00001 XLM             ║
║  ─────────────────────────────────── ║
║  ⓘ Fee details  [▼]                    ║
╚════════════════════════════════════════╝
```

#### Expanded state

```
╔════════════════════════════════════════╗
║  Network fee  ~0.00001 XLM             ║
║  ─────────────────────────────────── ║
║  ⓘ Fee details  [▲]                    ║
║  ┌────────────────────────────────┐   ║
║  │ The network fee is paid to     │   ║
║  │ Stellar validators in XLM. It  │   ║
║  │ is not deducted from your USDC │   ║
║  │ deposit or withdrawal amount.  │   ║
║  │ The exact fee is shown in your │   ║
║  │ Freighter wallet before you    │   ║
║  │ approve the transaction.       │   ║
║  └────────────────────────────────┘   ║
╚════════════════════════════════════════╝
```

| Property | Compact | Expanded |
|----------|---------|----------|
| Summary line font | `text-xs font-medium` | Same |
| Summary line colour | `text-muted-foreground` | `text-foreground` |
| Toggle icon | `▼` | `▲` |
| Toggle `aria-expanded` | `false` | `true` |
| Toggle `aria-label` | `"Show fee details"` | `"Hide fee details"` |
| Panel transition | — | `max-height` 200 ms ease-out |
| Panel background | — | `bg-muted/50 rounded-md p-3` |
| Panel font | — | `text-xs text-muted-foreground` |
| Panel `id` | — | `disclosure-{slug}` |
| Toggle `aria-controls` | `disclosure-{slug}` | Same |

---

## 3. Disclosure Catalogue

The following disclosures exist on the dashboard and transaction pages.
Each is assigned a level and a canonical summary line.

| Location | Disclosure | Level | Summary line (collapsed) |
|----------|-----------|-------|--------------------------|
| BalanceCard — APY figure | Yield disclaimer | 1 | `ⓘ Past performance does not indicate future yield.` |
| BalanceCard — Protected badge | Vault security note | 1 | `ⓘ Assets held in a non-custodial Soroban smart contract.` |
| StrategyBadge — any strategy | Strategy risk description | 1 | Provided by `StrategyBadge.descriptions.*` — already visible; no toggle needed |
| ActionModal / DepositPage — network fee | Network fee explanation | 2 | `ⓘ Fee details` |
| ActionModal / WithdrawPage — protocol fee | Protocol fee note | 1 | `ⓘ 0.00% exit fee — no fee to withdraw.` |
| ActionModal / DepositPage — share estimate | Share estimate caveat | 1 | `ⓘ Estimated only. Final shares confirmed on-chain.` |
| Dashboard / general | Regulatory disclaimer | 2 | `ⓘ Regulatory notice` |
| TransactionHistory — delayed status | Delayed confirmation note | 1 | `ⓘ Transaction is pending — your funds are not at risk.` |

---

## 4. Layout at Narrow Viewport Widths (375 px)

### Rules

1. **Level 1 disclosures** sit below the figure in a full-width block.
   They must not truncate. At 375 px with 16 px horizontal padding, the
   content column is 343 px — sufficient for 2 lines of `text-xs`.

2. **Level 2 compact line** sits in a full-width row. The toggle icon is
   right-aligned inside the same row (flexbox `justify-between`).
   Minimum row height: 32 px.

3. **Level 2 expanded panel** is full-width inside the card at 375 px,
   with `px-3 py-2` padding. Text wraps freely. No horizontal scrolling.

4. **Cards** must not add a second horizontal scroll axis when a Level 2
   panel is open. The card height grows to accommodate the panel.

5. **Action buttons** (Confirm Deposit, Confirm Withdrawal) always appear
   below any open disclosure panels. The button is never hidden by an
   expanded panel.

### Mobile layout sketch (375 px, expanded fee disclosure)

```
┌─────────────────────────────────────┐
│  Deposit USDC                        │
│  ─────────────────────────────────  │
│  Amount         1,000 USDC          │
│  Estimated shares  997.3 NV-SHARES  │
│  ⓘ Estimated only. Final shares     │
│    confirmed on-chain.               │
│  ─────────────────────────────────  │
│  Network fee    ~0.00001 XLM        │
│  ⓘ Fee details  [▲]                 │
│  ┌─────────────────────────────┐    │
│  │ The network fee is paid to  │    │
│  │ Stellar validators in XLM.  │    │
│  │ It is not deducted from     │    │
│  │ your USDC deposit amount.   │    │
│  │ Freighter shows the exact   │    │
│  │ fee before you approve.     │    │
│  └─────────────────────────────┘    │
│  ─────────────────────────────────  │
│  [ Confirm Deposit ]                │
└─────────────────────────────────────┘
```

---

## 5. Desktop Layout (1440 px, two-column review card)

Level 2 disclosures in the two-column review card follow the same compact/expanded
pattern. The toggle and panel span the full width of their column, not the entire card.

```
┌──────────────────┬──────────────────────────────────┐
│  Deposit 1,000   │  Estimated shares  997.3          │
│  USDC            │  ⓘ Estimated only.                │
│                  │                                   │
│                  │  Network fee  ~0.00001 XLM        │
│                  │  ⓘ Fee details  [▼]               │
│                  │                                   │
│  [ Cancel ]      │  [ Confirm Deposit ]              │
└──────────────────┴──────────────────────────────────┘
```

When the fee details panel opens, the right column grows and the two columns
remain aligned at the top. The Confirm button stays at the bottom of the right
column (not fixed — scroll is acceptable on this view).

---

## 6. Accessibility

| Requirement | Implementation |
|-------------|---------------|
| Expandable toggle is a `<button>` | Never `<div>` or `<a>` |
| `aria-expanded` on toggle | `"true"` / `"false"` |
| `aria-controls` on toggle | Points to panel `id` |
| `aria-label` on toggle | Descriptive name (not just "Toggle") |
| Panel hidden when collapsed | `hidden` attribute or `display: none` (removes from accessibility tree); do NOT use `visibility: hidden` alone |
| Level 1 icon | `aria-hidden="true"` on icon; surrounding text carries the full disclosure meaning |
| Keyboard | `Enter` / `Space` toggle; `Escape` collapses and returns focus to toggle |
| Focus ring | 2 px offset ring, brand primary colour on all toggle buttons |
| Contrast | Disclosure text in `text-muted-foreground` must meet 4.5:1 contrast ratio against the card background in both light and dark modes |

---

## 7. Acceptance Checklist

- [ ] Level 1 inline disclosures defined for APY, vault security, protocol fee, share estimate, and delayed-confirmation status
- [ ] Level 2 expandable disclosures defined for network fee and regulatory notice
- [ ] Compact state: summary line visible, panel hidden (`display: none` / `hidden`)
- [ ] Expanded state: panel visible with `bg-muted/50`, `rounded-md`, `p-3`; 200 ms `max-height` transition
- [ ] Toggle carries `aria-expanded`, `aria-controls`, and `aria-label`
- [ ] `Escape` collapses an open panel; focus returns to toggle
- [ ] Mobile (375 px) layout: no horizontal scroll, button below all panels, panel text wraps freely
- [ ] Desktop (1440 px) layout: panel spans column width only; Confirm button stays at column bottom
- [ ] `text-muted-foreground` contrast verified ≥ 4.5:1 on card background (light + dark)
- [ ] All Level 1 icons are `aria-hidden="true"`
