# Protocol Allocation Explainer — Design Specification

**Issue:** #693  
**Workstream:** UI/UX — Accessibility  
**Surface:** Dashboard portfolio view, strategy allocation breakdown

---

## 1. Purpose

Users see protocol names (e.g. "Blend", "Phoenix DEX") and percentage weights in the portfolio
view but have no in-product explanation of what each protocol does or why the AI agent chose a
particular allocation. This spec defines a single expandable disclosure pattern that reveals
human-readable percentage labels and protocol role descriptions without cluttering the collapsed
view.

---

## 2. Component: `ProtocolAllocationRow`

### 2.1 Collapsed state (default)

```
┌─────────────────────────────────────────────────────────┐
│  ● Blend Protocol                        62%  [▼ Details]│
└─────────────────────────────────────────────────────────┘
```

| Element | Specification |
|---------|---------------|
| Protocol dot | 8 px circle using the protocol's brand colour token |
| Protocol name | `font-medium text-sm` (14 px / 20 px line-height) |
| Percentage label | `font-semibold text-sm tabular-nums` right-aligned; always shows one decimal place (e.g. `62.0%`) |
| Toggle button | Icon-button `▼` / `▲`, 24 × 24 px tap target minimum; labelled `"Show details for {name}"` / `"Hide details for {name}"` via `aria-label` |
| Row height | 44 px minimum (touch target) |

### 2.2 Expanded state

```
┌─────────────────────────────────────────────────────────┐
│  ● Blend Protocol                        62%  [▲ Details]│
│  ┌───────────────────────────────────────────────────┐  │
│  │ Role: Stablecoin lending pool                     │  │
│  │ 62.0% of portfolio — earning lending yield on     │  │
│  │ USDC supplied to Blend's liquidity reserve.       │  │
│  │                                                   │  │
│  │ Why here? The AI agent routes the majority of     │  │
│  │ assets to Blend when the lending APY exceeds      │  │
│  │ available DEX fees by more than 1.5 percentage    │  │
│  │ points.                                           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

| Element | Specification |
|---------|---------------|
| Detail panel | Background `bg-muted/50`, border-radius `rounded-md`, padding `p-3`, margin-top `mt-2` |
| Role badge | `text-xs font-medium text-muted-foreground uppercase tracking-wide` — e.g. "Stablecoin lending pool" |
| Allocation sentence | `text-sm` — `{n.n}% of portfolio — {plain-language description}` |
| Rationale | `text-sm text-muted-foreground mt-1` — one or two sentences explaining the AI routing logic |
| Panel animation | `max-height` CSS transition, 200 ms ease-out; `overflow-y: hidden` while collapsed |

---

## 3. Protocol Role Catalogue

| Protocol | Role label | Short description |
|----------|-----------|-------------------|
| Blend | Stablecoin lending pool | Supplies USDC to Blend's lending reserve, earning interest from borrowers. |
| Phoenix DEX | Automated market maker | Provides liquidity to the USDC/XLM trading pair, earning swap fees on each trade. |
| Aquarius | Governance-weighted AMM | Contributes to Aquarius liquidity pools whose rewards are boosted by AQUA governance votes. |
| Soroswap | DEX aggregator route | Earns fees from aggregated swap traffic routed through Soroswap's on-chain order routing. |

---

## 4. Percentage Label Rules

1. Always display one decimal place: `62.0%`, not `62%`.
2. The sum of all protocol weights must equal `100.0%`. If rounding causes a discrepancy,
   adjust the largest protocol's displayed value by ±0.1 pp so the sum reads correctly.
3. Use `tabular-nums` font-variant to prevent label width shifts when values update.
4. Screen readers announce: `"{name}, {n} percent of portfolio"`. Do not append the word
   "allocation" — it is implied by context.

---

## 5. Accessible Toggle States

| State | `aria-expanded` | `aria-label` | Focus ring |
|-------|----------------|--------------|------------|
| Collapsed | `false` | `"Show details for {Protocol Name}"` | 2 px offset ring, brand primary colour |
| Expanded | `true` | `"Hide details for {Protocol Name}"` | Same ring |

- The toggle button is a `<button>` element, never a `<div>` or `<span>`.
- The detail panel is wrapped in a `<div>` with `id="protocol-detail-{slug}"` and
  the button carries `aria-controls="protocol-detail-{slug}"`.
- When expanded, focus remains on the toggle button (do not move focus into the panel
  automatically — the panel is supplementary, not a dialog).
- The toggle icon (`▼` / `▲`) is `aria-hidden="true"`; the button's accessible name
  comes solely from `aria-label`.

### Keyboard interaction

| Key | Behaviour |
|-----|-----------|
| `Enter` / `Space` | Toggle expand / collapse |
| `Tab` | Move to next interactive element (the next protocol row's toggle or the following control) |
| `Escape` | Collapse the panel if expanded; focus stays on the toggle button |

---

## 6. Stacked List Behaviour

When multiple protocols are shown:

- Only one panel may be expanded at a time (accordion mode) **or** all panels may be
  expanded simultaneously — product decision. This spec uses **independent mode** (each
  row expands independently) because users may want to compare two protocols side by side.
- Collapsed rows always show the percentage so the visual weight summary is never hidden.

### Visual weight bar (optional enhancement)

Below the protocol name, a thin horizontal progress bar (`h-1 rounded-full`) filled to the
protocol's weight percentage provides a pre-attentive visual cue before the user reads the number.

```
● Blend Protocol      ████████████░░░░░░░  62.0%  [▼]
● Phoenix DEX         ████████░░░░░░░░░░░  38.0%  [▼]
```

The bar is `aria-hidden="true"`; it is decorative only.

---

## 7. Responsive Behaviour

| Viewport | Layout |
|----------|--------|
| ≥ 768 px | Protocol name and percentage on one line; toggle on the right |
| < 768 px | Protocol name on first line, percentage + toggle on second line within the same 44 px row (flex-wrap) |
| Minimum row width | 280 px — below this, percentage truncates with ellipsis and tooltip shows full value |

---

## 8. Acceptance Checklist

- [ ] Collapsed row shows protocol name, one-decimal percentage, and accessible toggle button
- [ ] Expanded panel shows role label, allocation sentence, and routing rationale
- [ ] `aria-expanded`, `aria-controls`, and `aria-label` are set correctly on the toggle
- [ ] `Escape` collapses an open panel without moving focus
- [ ] Percentage labels use `tabular-nums` and sum to `100.0%`
- [ ] All four protocol entries in the catalogue are accounted for
- [ ] Visual weight bar (if implemented) is marked `aria-hidden="true"`
- [ ] Responsive layout tested at 375 px, 768 px, and 1440 px
