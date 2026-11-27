# Chart Gap Annotations — Missing Data vs Zero Activity

**Issue:** #689  
**Workstream:** UI/UX — NeuroWealth Dashboard  
**Target surfaces:** Exchange-rate chart (`ExchangeRateChart`), earnings history chart (`EarningsHistoryChart`), portfolio area chart (`PortfolioChart`)

---

## 1. Purpose

Historical charts can contain two distinct kinds of absence:

1. **Missing data** — no observation was recorded (e.g. the indexer was offline,
   the data provider returned an error, or the user's vault position did not
   exist yet).
2. **Zero activity** — a valid observation was recorded and the value was zero
   (e.g. the exchange rate did not change, or no yield was harvested).

These two states look identical if both are rendered as a gap or as a flat
zero line. This specification defines visual and accessible treatments that
make them distinguishable without relying on colour alone.

---

## 2. Visual treatment

### 2.1 Zero-activity segment

A period where data was recorded and the value is zero or unchanged:

- Render as a **solid, continuous line** at the zero axis (or at the
  unchanged value).
- Fill below the line with the standard chart gradient at reduced opacity
  (20% of the normal fill alpha) to signal that the period is data-present
  but uneventful.
- Tooltip on hover: `"No change — {date range}"` (see § 5).

### 2.2 Isolated missing-data gap (single missing point or ≤ 2 consecutive missing points)

- **Break the line**: do not interpolate across the gap.
- Render a **dashed bridge line** (`strokeDasharray="4 4"`) connecting the
  last known point to the next known point.
- Overlay a **vertical shaded band** (`fill` with `opacity: 0.08`,
  `pattern: repeating diagonal hatching at 45°`) spanning the gap width.
- Tooltip on the shaded band: `"Data unavailable — {date}"` (see § 5).

### 2.3 Entirely missing range (≥ 3 consecutive missing points or a contiguous block)

- Do not render any line segment across the range.
- Replace the missing region with a **hatched fill panel** (diagonal lines,
  45°, `strokeWidth: 1`, `opacity: 0.12`) from the chart floor to the top
  of the chart area.
- Place a **text annotation** centred in the panel:
  `"No data — {start date} to {end date}"` in `text-xs text-slate-400`.
- Do not scale the y-axis to the gap; treat missing values as non-existent
  for axis calculations.

---

## 3. SVG / Recharts implementation notes

```tsx
// For Recharts — customised dot and line
// Use connectNulls={false} so null values break the line.
// Replace null data points with { value: null } in the series array.

// Dashed bridge: use a second <Line> series that contains only the
// interpolated bridge points (first known → null midpoints → last known)
// with strokeDasharray="4 4".

// Hatched pattern — define in <defs>:
<defs>
  <pattern id="missing-hatch" patternUnits="userSpaceOnUse" width="8" height="8">
    <path d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2"
          stroke="currentColor" strokeWidth="1" opacity="0.4" />
  </pattern>
</defs>

// Apply as fill to a <rect> or <ReferenceArea> over the gap domain:
<ReferenceArea
  x1={gapStart}
  x2={gapEnd}
  fill="url(#missing-hatch)"
  fillOpacity={0.12}
/>
```

---

## 4. Accessible text

### 4.1 Isolated gap

Each isolated gap must include a visually-hidden description in the chart's
accessible summary region (see `docs/ACCESSIBILITY.md` for the chart summary
pattern):

```
"Data unavailable for {date}. The value before this gap was {value} and
after was {value}."
```

If the before or after value is itself unknown (gap at the start or end of
the series), omit the unknown bound:

- Gap at start: `"Data unavailable from {start} to {first known date}."`
- Gap at end: `"Data unavailable from {last known date} to {end}."`

### 4.2 Entirely missing range

```
"No data recorded between {start date} and {end date}. The chart resumes
on {resume date} with a value of {value}."
```

If the chart begins in a missing-data state (the user's position started
after the chart's time axis begins):

```
"No vault position between {chart start} and {deposit date}. Data begins
on {deposit date}."
```

### 4.3 Zero-activity period

Zero-activity periods are data-present and do not require a gap annotation.
They must appear in the chart summary as:

```
"Exchange rate unchanged from {start date} to {end date} at {value}."
```

---

## 5. Tooltip copy

| Segment type | Tooltip heading | Tooltip body |
|---|---|---|
| Zero activity (single point) | `"No change"` | `"{date} — Rate: {value}"` |
| Zero activity (range) | `"Unchanged period"` | `"{start} to {end} — Rate held at {value}"` |
| Isolated gap | `"Data unavailable"` | `"{date} — No observation recorded"` |
| Missing range | `"No data"` | `"{start} to {end} — Index data not available for this period"` |

Tooltips must be keyboard accessible via the chart's existing keyboard-nav
implementation (arrow keys move the focus point; the tooltip renders on
focus as well as hover).

---

## 6. Acceptance criteria

| Criterion | Specification |
|---|---|
| Zero vs missing distinction | Zero-activity uses solid line; missing data uses dashed bridge + hatch |
| Isolated gap — visual | Dashed line bridge + vertical hatched band for ≤ 2 missing points |
| Missing range — visual | Hatched fill panel + text annotation for ≥ 3 consecutive missing points |
| Isolated gap — accessible text | Visually-hidden description includes before/after values |
| Missing range — accessible text | Visually-hidden description includes range dates and resume value |
| Zero-activity — accessible text | Chart summary notes "unchanged from … to …" |
| Tooltip copy | Each segment type has distinct heading and body copy |
| Color independence | Distinction made by line style (solid vs dashed) and pattern (hatch), not colour |

---

## 7. Related documents

- [`design/dashboard/README.md`](README.md) — Design handoff overview
- [`docs/ACCESSIBILITY.md`](../../docs/ACCESSIBILITY.md) — Chart accessibility pattern
- [`docs/CVD_PALETTE.md`](../../docs/CVD_PALETTE.md) — CVD-safe colour tokens
- [`docs/EMPTY_STATES_DESIGN.md`](../../docs/EMPTY_STATES_DESIGN.md) — Empty state patterns
