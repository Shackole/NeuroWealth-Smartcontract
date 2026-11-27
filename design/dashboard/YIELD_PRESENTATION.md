# Zero-Yield and Negative-Yield Presentation

**Issue:** #694  
**Workstream:** UI/UX — NeuroWealth Dashboard  
**Target surfaces:** APY display card, earnings summary, balance card delta, exchange-rate chart tooltip

---

## 1. Purpose

Performance figures on a DeFi dashboard are most meaningful during ordinary
positive periods. During flat or declining periods they are equally important
— yet many interfaces default to suppressing the sign, greying out the number,
or relying solely on green-vs-red colouring to convey direction. This
specification defines wording and signed-number treatment for positive, zero,
and negative values in a way that remains interpretable to users regardless of
colour perception.

---

## 2. Signed-number rules

| Value class | Sign prefix | Example rendered string | Notes |
|---|---|---|---|
| Positive | `+` | `+4.82%` | Always include the plus sign |
| Exact zero | none | `0.00%` | No sign; zero is not positive or negative |
| Negative | `−` (U+2212, minus sign) | `−1.07%` | Use the Unicode minus sign, not a hyphen |

### Precision

- Display APY to two decimal places.
- Display 24 h / 7 d / 30 d period deltas to two decimal places.
- Never round a negative value to zero (e.g. `−0.004%` rounds to `−0.00%`, not
  `0.00%`). Show `< 0.01%` with a negative prefix when the value is non-zero
  but rounds to `0.00%`.

---

## 3. Icon and shape redundancy

Colour must not be the sole signal for direction. Every signed figure must be
accompanied by one of three icons:

| Direction | Icon | Aria-hidden | Tailwind token suggestion |
|---|---|---|---|
| Positive | `TrendingUp` (Lucide) | `aria-hidden="true"` | `text-cvd-success` |
| Zero / flat | `Minus` (Lucide) | `aria-hidden="true"` | `text-slate-400` |
| Negative | `TrendingDown` (Lucide) | `aria-hidden="true"` | `text-cvd-error` |

The icon appears immediately before or after the signed number and is sized to
match the text's cap height. It is decorative (`aria-hidden`) because the
accessible label (see § 4) carries the semantic direction.

---

## 4. Accessible wording

Wrap every performance figure in an element with an `aria-label` that spells out
the direction as a word, not a symbol.

| Value class | `aria-label` pattern | Example |
|---|---|---|
| Positive | `"APY: plus {value} percent"` | `"APY: plus 4.82 percent"` |
| Exact zero | `"APY: 0.00 percent, no change"` | `"APY: 0.00 percent, no change"` |
| Negative | `"APY: minus {value} percent"` | `"APY: minus 1.07 percent"` |

For period deltas (e.g. 7-day change):

| Value class | `aria-label` pattern |
|---|---|
| Positive | `"7-day change: up {value} percent"` |
| Exact zero | `"7-day change: flat, 0.00 percent"` |
| Negative | `"7-day change: down {value} percent"` |

---

## 5. Copy rules

### 5.1 Positive values

- Signed number with `+` prefix and icon: `+4.82% ▲`
- Tooltip/detail copy: `"Earning at 4.82% APY annualised"`
- No special treatment required beyond the prefix and icon.

### 5.2 Exact zero

- Display as `0.00%` with the flat `—` icon (Lucide `Minus`).
- Tooltip/detail copy: `"No change recorded in this period"` — do not write
  "0% APY earned" as this implies the protocol is non-functional.
- The zero figure must still appear; do not hide or suppress it.
- If APY has been zero for more than 24 hours, append `"(harvest pending)"` only
  when the vault's last harvest timestamp is available and is more than 24 h old.

### 5.3 Negative values

- Signed number with `−` prefix (Unicode minus, U+2212) and icon: `−1.07% ▼`
- Tooltip/detail copy: `"Exchange rate declined {value}% over this period.
  This may reflect a protocol loss or unrealised impermanent loss."`
- Never suppress or soften to `"−0%"` or `"low yield"`.
- Do not display a recovery action inline; link to the strategy explanation
  page instead (see Learn-to-dashboard handoff spec).

---

## 6. Display table

| Scenario | Rendered label | Icon | `aria-label` | Tooltip |
|---|---|---|---|---|
| APY = +4.82% | `+4.82%` | TrendingUp | "APY: plus 4.82 percent" | "Earning at 4.82% APY annualised" |
| APY = 0.00% | `0.00%` | Minus | "APY: 0.00 percent, no change" | "No change recorded in this period" |
| APY = −1.07% | `−1.07%` | TrendingDown | "APY: minus 1.07 percent" | "Exchange rate declined 1.07% over this period. This may reflect a protocol loss or unrealised impermanent loss." |
| 7 d delta = +0.31% | `+0.31%` | TrendingUp | "7-day change: up 0.31 percent" | "Exchange rate rose 0.31% over the last 7 days" |
| 7 d delta = 0.00% | `0.00%` | Minus | "7-day change: flat, 0.00 percent" | "No change over the last 7 days" |
| 7 d delta = −0.004% | `< −0.01%` | TrendingDown | "7-day change: down less than 0.01 percent" | "Exchange rate declined less than 0.01% over the last 7 days" |

---

## 7. Acceptance criteria

| Criterion | Specification |
|---|---|
| Signed-number treatment | Positive → `+` prefix; zero → no sign; negative → `−` (U+2212) |
| Icon redundancy | TrendingUp / Minus / TrendingDown icon always accompanies the figure |
| Color independence | Direction is communicated by sign + icon, not colour alone |
| Accessible label | `aria-label` spells out "plus", "no change", or "minus" in prose |
| Zero not suppressed | Zero figures are always rendered; "no change" copy used instead of hiding |
| Negative not softened | Negative values show the full signed number and decline copy |

---

## 8. Related documents

- [`design/dashboard/README.md`](README.md) — Design handoff overview
- [`docs/CVD_PALETTE.md`](../../docs/CVD_PALETTE.md) — CVD-safe colour tokens
- [`docs/DESIGN_SYSTEM.md`](../../docs/DESIGN_SYSTEM.md) — Design tokens
