# Locale Long-Content Review — Withdrawal Form & Financial UI

**Issue:** #690  
**Workstream:** UI/UX — Internationalisation  
**Surfaces reviewed:** `ActionModal`, `DepositPage`, `WithdrawPage`, `WalletErrors`, `ContractErrors`  
**Locales:** `en`, `es`, `fr`, `ja`, `pt`, `zh`

---

## 1. Methodology

String lengths (characters) were measured across all six locales for every key in the
financial-interaction sections. Keys whose longest translation exceeds 55 characters are
flagged below. For each flagged key the annotation records:

- the worst-case locale and length,
- the minimum container width needed to display the string on one line at the base font
  size (14 px / `text-sm`), and
- the recommended treatment (single-line, wrap, truncate, or tooltip).

Base assumption: at `text-sm` (14 px, proportional sans-serif), one character occupies
approximately **7 px** average width (conservative for Latin scripts, generous for CJK
where glyphs are wider but strings are shorter).

---

## 2. Per-Key Annotations

### `ActionModal`

#### `decimalHelp`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **78** | **~546 px** |
| en | 66 | ~462 px |
| pt | 65 | ~455 px |
| es | 62 | ~434 px |
| ja | 36 | ~252 px |
| zh | 20 | ~140 px |

**Minimum container width:** 280 px (two lines at 280 px fits fr comfortably).  
**Treatment:** allow wrapping to two lines; `min-width: 280px` on the hint container.  
**Button alignment:** hint is below the input, full-width — no button on the same line; not affected.

---

#### `invalidAmount`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **88** | **~616 px** |
| en | 84 | ~588 px |
| es | 74 | ~518 px |
| pt | 72 | ~504 px |
| ja | 32 | ~224 px |
| zh | 27 | ~189 px |

**Minimum container width:** 280 px (wraps to three lines at 280 px; two lines at 400 px).  
**Treatment:** wrap freely; `line-clamp` must NOT be applied to error messages — the full
text must always be readable.  
**Button alignment:** error message sits below the input field, above the submit button; submit
button is full-width and unaffected by error text length.

---

#### `amountOutOfRange`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **58** | **~406 px** |
| es | 57 | ~399 px |
| en | 54 | ~378 px |
| pt | 51 | ~357 px |

**Minimum container width:** 240 px (wraps cleanly to two lines).  
**Treatment:** wrap; no truncation.

---

### `DepositPage`

#### `subtitle`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **121** | **~847 px** |
| es | 117 | ~819 px |
| pt | 112 | ~784 px |
| en | 94 | ~658 px |
| ja | 55 | ~385 px |
| zh | 45 | ~315 px |

**Minimum container width:** 320 px (the subtitle wraps to 3–4 lines at 320 px, which is acceptable).  
**Treatment:** free wrap; `max-width: 65ch` recommended to prevent overly wide lines on desktop.  
**Risk:** at 320 px viewport, fr/es/pt subtitles reach 4 lines — verify that the subtitle does not
push the amount input below the fold on iPhone SE (375 px height 667 px).

---

#### `amountHint`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| pt | 98 | ~686 px |
| en / es / fr | 94 | ~658 px |
| zh | 55 | ~385 px |
| ja | 52 | ~364 px |

**Minimum container width:** 280 px.  
**Treatment:** wrap; the parenthetical `(1 USDC = 10,000,000 stroops)` may be placed on its
own line using `<br>` or by wrapping in a `<span class="block">` to avoid orphaning the number.

---

### `WithdrawPage`

#### `subtitle`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **102** | **~714 px** |
| es | 99 | ~693 px |
| pt | 88 | ~616 px |
| en | 84 | ~588 px |

**Minimum container width:** 280 px (two lines at 280 px for fr/es).  
**Treatment:** free wrap; apply the same `max-width: 65ch` cap as `DepositPage.subtitle`.

---

#### `amountHint`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| en | 90 | ~630 px |
| es | 91 | ~637 px |
| fr | 89 | ~623 px |
| pt | 82 | ~574 px |

**Minimum container width:** 280 px.  
**Treatment:** wrap; hint must remain visually distinct from the error message (use
`text-muted-foreground`, not an error colour).

---

### `WalletErrors`

#### `freighterRejected`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **85** | **~595 px** |
| es | 76 | ~532 px |
| en | 70 | ~490 px |

**Treatment:** wrap to two lines inside the toast / inline error container.  
**Minimum toast width:** 280 px. At 280 px fr wraps to 3 lines — still acceptable; ensure
`min-height` on the toast is not fixed.

---

#### `freighterUnavailable`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **ja** | **61** | **~427 px** |
| en | 82 | ~574 px |
| fr | 77 | ~539 px |

Note: `ja` characters are wider than Latin (approx. 14 px each for full-width kana/kanji),
so effective width is ~61 × 14 ≈ **854 px** — this is the actual worst case.  
**Treatment:** wrap freely; do not set `white-space: nowrap` on any error string container.

---

#### `accountNotFound`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **90** | **~630 px** |
| pt | 88 | ~616 px |
| es | 86 | ~602 px |
| en | 74 | ~518 px |

**Treatment:** wrap; two lines at 320 px for all locales.

---

#### `networkMismatch`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **96** | **~672 px** |
| en | 92 | ~644 px |
| pt | 80 | ~560 px |
| zh | 47 | ~329 px |

**Treatment:** wrap; note that "Testnet" must not be translated (it is a proper noun / network name).

---

#### `transactionTimeout`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **en** | **94** | **~658 px** |
| fr | 85 | ~595 px |
| pt | 80 | ~560 px |
| es | 82 | ~574 px |
| ja | 61 | ~854 px (CJK) |

**Treatment:** wrap; the em-dash construct ("—") used in en/es/fr may be replaced with a
period if wrapping produces an orphaned clause at narrow widths.  
**Minimum toast width:** 280 px.

---

### `ContractErrors`

#### `restoreRequired`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **99** | **~693 px** |
| pt | 96 | ~672 px |
| es | 88 | ~616 px |
| ja | 48 | ~672 px (CJK) |

**Treatment:** wrap; this message precedes a restore action button — the button must be on
its own line below the message, never inline, to prevent wrapping the button label.

---

#### `vaultPaused`
| Locale | Characters | Approx. width |
|--------|-----------|---------------|
| **fr** | **89** | **~623 px** |
| es | 84 | ~588 px |
| pt | 81 | ~567 px |

**Treatment:** wrap to two lines at 280 px.

---

## 3. Summary: Minimum Width Requirements

| Component | Minimum width | Worst locale |
|-----------|--------------|-------------|
| `ActionModal` amount input + hint | 280 px | fr |
| `ActionModal` error message | 280 px | fr |
| `DepositPage` / `WithdrawPage` subtitle | 320 px | fr |
| `DepositPage` / `WithdrawPage` amount hint | 280 px | pt / en |
| Toast / inline error container | 280 px | fr / ja (CJK) |
| Restore action area (message + button) | 280 px | fr |

---

## 4. Wrapping Rules

1. **Never** apply `white-space: nowrap`, `overflow: hidden`, or `text-overflow: ellipsis`
   to error messages, hint text, or inline disclosures. Financial copy must be fully readable.
2. **Never** set a fixed height on toast or inline error containers. Use `min-height` only
   if needed for layout stability and ensure it is large enough for the longest locale at
   the narrowest supported viewport (375 px).
3. Hint text (`decimalHelp`, `amountHint`) may wrap freely but should be capped at
   `max-width: 65ch` on viewports wider than 768 px to prevent excessively long single lines.
4. CJK locales (`ja`, `zh`) have shorter character counts but wider glyphs. At `text-sm`,
   treat each CJK character as occupying ~14 px rather than 7 px. The `ja` locale is the
   effective worst case for `freighterUnavailable` and `transactionTimeout`.
5. The `restoreRequired` message is followed by an action button. The button must sit on its
   own row (`display: block` or `width: 100%`) and must not share a line with the message text.

---

## 5. Button Alignment

| Context | Rule |
|---------|------|
| `ActionModal` primary action (`confirmDeposit`, `confirmWithdraw`) | Full-width button at the bottom of the modal; unaffected by message length above. |
| `DepositPage` / `WithdrawPage` submit button | Full-width; sits below all hints and error messages; always visible without horizontal scrolling. |
| Restore action button after `restoreRequired` error | Block-level, full-width, below the error message; minimum 44 px height. |
| Toast dismiss button | Icon-only (×), right-aligned inside the toast; toast text wraps left of it; minimum 32 × 32 px tap target. |
| `MAX` button in amount field | Right-aligned inside the input field; fixed 32 px wide; does not shrink or wrap regardless of locale. |

---

## 6. Acceptance Checklist

- [ ] All error message containers allow free text wrapping (no `overflow: hidden` or `line-clamp`)
- [ ] `ActionModal` hint container has `min-width: 280px`
- [ ] Subtitle elements have `max-width: 65ch` on viewports ≥ 768 px
- [ ] CJK locales (`ja`, `zh`) tested at 375 px viewport width with real translated strings
- [ ] Toast component has no fixed height; `min-height` only
- [ ] `restoreRequired` action button is block-level, below the message text
- [ ] `MAX` button remains right-aligned and 32 px wide across all locales
- [ ] Primary submit buttons are full-width and unaffected by message length above them
