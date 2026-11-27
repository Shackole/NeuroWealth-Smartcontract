# Transaction History — Empty Filter Results Design Specification

**Issue:** #683  
**Workstream:** UI/UX — Accessibility  
**Surface:** Transaction History panel, dashboard and standalone `/transactions` view

---

## 1. Purpose

When a user applies one or more filters (by type, date range, or asset) and no transactions
match, the history list area must not simply go blank. This spec defines:

1. a **filter summary** that always shows which filters are active,
2. a **clear-filters action** so users can recover with a single interaction, and
3. **accessible focus behaviour** so keyboard and screen-reader users can navigate back
   to results after clearing filters.

---

## 2. Filter Summary Bar

The filter summary bar sits immediately above the transaction list (or the empty state)
at all times when at least one filter is active.

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Filters:  [Type: Deposit ×]  [Last 30 days ×]   Clear all    │
└────────────────────────────────────────────────────────────────┘
```

| Element | Specification |
|---------|---------------|
| Label | `"Filters:"` — `text-xs font-medium text-muted-foreground`, not interactive |
| Filter chip | `rounded-full border px-2 py-0.5 text-xs font-medium` with an inline `×` dismiss button |
| Chip dismiss button | 20 × 20 px, `aria-label="Remove {filter name} filter"` |
| Clear all button | `text-xs text-primary underline-offset-2 hover:underline`, right-aligned |
| Bar visibility | Shown only when ≥ 1 filter is active; hidden when no filters are applied |
| Bar `aria-label` | `"Active filters: {comma-separated filter descriptions}"` on the wrapping `<div role="status">` |

The bar uses `role="status"` and `aria-live="polite"` so screen readers announce chip
additions and removals without interrupting the user mid-action.

---

## 3. Empty-Filter State

Shown inside the transaction list area when filters are active but no transactions match.

### Wireframe (desktop 1440 px)

```
┌──────────────────────────────────────────────────────────────────┐
│  Filters:  [Type: Deposit ×]  [Last 30 days ×]        Clear all  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│              🔍  (search / filter illustration)                  │
│                                                                  │
│          No transactions match your current filters              │
│                                                                  │
│      Try adjusting the date range, transaction type, or          │
│      removing individual filters using the chips above.          │
│                                                                  │
│              [ Clear all filters ]                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Wireframe (mobile 375 px)

```
┌────────────────────────────────────┐
│ Filters: [Deposit ×] [30 days ×]   │
│                      Clear all  ↑  │
├────────────────────────────────────┤
│                                    │
│        🔍                          │
│                                    │
│  No transactions match your        │
│  current filters                   │
│                                    │
│  Try adjusting the date range,     │
│  transaction type, or removing     │
│  individual filters above.         │
│                                    │
│  [ Clear all filters ]             │
│                                    │
└────────────────────────────────────┘
```

### Content Specification

| Element | Copy / Spec |
|---------|-------------|
| Icon | Magnifying glass or funnel-slash SVG, 40 × 40 px, `aria-hidden="true"` |
| Heading | `"No transactions match your current filters"` — `text-base font-semibold` |
| Body | `"Try adjusting the date range, transaction type, or removing individual filters using the chips above."` — `text-sm text-muted-foreground` |
| Primary action | `<button>` labelled `"Clear all filters"` — `variant="outline" size="sm"`, minimum 44 × 44 px |
| Container | `min-h-[240px]` on mobile, `min-h-[320px]` on desktop; flex column, centered |
| `aria-live` region | The list container carries `aria-live="polite"` and `aria-atomic="false"` |

#### Heading and body must NOT say:
- "No results" — too generic.
- "Nothing found" — passive.
- "No data" — technical jargon.
- Any copy that implies the account is empty of all history.

---

## 4. Clear-Filters Action

There are two entry points for clearing filters:

| Entry point | Location | Behaviour |
|-------------|----------|-----------|
| **Individual chip dismiss (×)** | Filter summary bar, inline per chip | Removes that one filter; list updates immediately |
| **"Clear all filters" link** (bar) | Right side of filter summary bar | Removes all active filters at once |
| **"Clear all filters" button** (empty state) | Centered in the empty state area | Same as the bar link; both are always in sync |

### Behaviour on Clear

1. All active filter state is reset to the default (no filters).
2. The transaction list re-renders with all transactions visible.
3. The filter summary bar hides (no active filters).
4. Focus moves to the **first transaction row** in the restored list (see §5).
5. A screen reader announcement is made: `"Filters cleared. {n} transactions shown."` via
   `aria-live="polite"` on the results region.

---

## 5. Accessible Focus Behaviour When Results Return

### Scenario: user activates "Clear all filters"

| Step | What happens |
|------|-------------|
| 1 | User activates the clear-filters button (keyboard or pointer). |
| 2 | Filters reset synchronously (or with a short loading state if async). |
| 3 | The transaction list re-renders. |
| 4 | Focus is programmatically moved to the **first interactive element in the restored list** — typically the first transaction row (if rows are focusable) or the list container itself if rows are not interactive. |
| 5 | The `aria-live` region announces `"Filters cleared. {n} transactions shown."` |

### Implementation notes

- Use `element.focus()` after the state update settles. In React, call inside
  `useEffect` with the list data as a dependency, or use a `ref` on the first row.
- If the list is loading asynchronously, focus moves to a loading indicator with
  `aria-label="Loading transactions"` first, then to the first row when data arrives.
- The focus target must have a visible focus ring (2 px offset ring, brand primary colour).
- Do not move focus to the filter summary bar after clearing — that bar is now hidden.
- If the user clears an individual chip (not all filters) and results appear, focus returns
  to the **next remaining chip** (or the "Clear all" link if no chips remain). Focus must
  not get lost when a chip removes itself from the DOM.

### Scenario: user dismisses a single filter chip

| Step | What happens |
|------|-------------|
| 1 | User activates the chip's `×` button. |
| 2 | That filter is removed; list updates. |
| 3 | If other chips remain: focus moves to the next chip's `×` button. If no chips remain and results are shown, focus moves to the first transaction row. If no chips remain and the list is still empty (edge case), focus moves to the "Clear all filters" button in the empty state (which should now be hidden — this case shouldn't occur). |

---

## 6. Loading State (Async Filters)

If applying or clearing filters triggers an async data fetch:

1. Show a skeleton list (3–5 rows) in place of the transaction list immediately.
2. Announce `"Updating transaction list"` via the `aria-live` region.
3. Do not flash the empty-filter state before the fetch resolves.
4. After data arrives, follow the focus rules in §5.

---

## 7. Responsive Behaviour

| Viewport | Filter bar | Empty state |
|----------|------------|------------|
| ≥ 768 px | Chips and "Clear all" on one line | Centered in list area, `min-h: 320px` |
| < 768 px | Chips wrap; "Clear all" right-aligned below chips | Stacked, full-width, `min-h: 240px` |
| 375 px | Each chip on its own line if needed; "Clear all" always visible | Heading and body wrap freely |

---

## 8. Acceptance Checklist

- [ ] Filter summary bar shown with `role="status" aria-live="polite"` when ≥ 1 filter active
- [ ] Each chip has `aria-label="Remove {filter name} filter"` on its dismiss button
- [ ] Empty state shown (not blank) when filters return zero results
- [ ] Empty state heading does not use "No results", "Nothing found", or "No data"
- [ ] "Clear all filters" button in empty state clears all filters and updates the list
- [ ] After clearing all filters, focus moves to the first transaction row
- [ ] After clearing all filters, `aria-live` announces `"Filters cleared. {n} transactions shown."`
- [ ] After removing a single chip, focus moves to the next chip or the first transaction row
- [ ] Focus ring is visible (2 px, brand primary) on all interactive elements in this flow
- [ ] Skeleton shown during async fetch; empty-filter state never shown before fetch resolves
- [ ] Responsive layout tested at 375 px and 768 px
