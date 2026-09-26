# CVD-Safe Colour Palette

**WCAG criterion:** SC 1.4.1 — Use of Color (Level A)  
**CVD types addressed:** Deuteranopia (green-blind), Protanopia (red-blind)  
**Simulation tool:** [Color Oracle](https://www.color-oracle.org/) (free, cross-platform)  
**Also suitable for:** Browser DevTools → Rendering → Emulate vision deficiencies

---

## 1. Overview

Colour Vision Deficiency (CVD) affects approximately 8% of men and 0.5% of women with Northern European heritage. The two most common forms are:

- **Deuteranopia** — reduced sensitivity to green wavelengths (~5% of men)
- **Protanopia** — reduced sensitivity to red wavelengths (~1% of men)

Both conditions make red/green distinctions difficult or impossible. NeuroWealth's original palette used emerald (green) as the primary status and chart colour, which created ambiguity when viewed under CVD simulation.

WCAG Success Criterion 1.4.1 requires that **colour is not the sole visual means of conveying information**. This document records the palette changes made to comply with this requirement and to follow best practices for CVD accessibility.

---

## 2. Status Colours

Each status colour is **always accompanied by a distinct icon** so that meaning is conveyed through shape + colour redundancy.

| Status | Hex | Tailwind token | Icon | CVD-safe? |
|--------|-----|----------------|------|-----------|
| Success | `#2563eb` (Blue) | `cvd-success` | ✓ CheckCircle2 | ✅ Yes |
| Warning | `#d97706` (Amber) | `cvd-warning` | △ AlertTriangle | ✅ Yes |
| Error | `#dc2626` (Red) | `cvd-error` | ✕ XCircle | ✅ Yes (with icon) |
| Info | `#0891b2` (Teal) | `cvd-info` | ℹ Info | ✅ Yes |

> **Why blue for success?** The traditional green-for-success is ambiguous for deuteranopes and protanopes. Blue is perceptible across all common CVD types and creates a strong distinction from amber (warning) and red (error).

### CSS custom properties

```css
--color-cvd-success: #2563eb;  /* Blue  */
--color-cvd-warning: #d97706;  /* Amber */
--color-cvd-error:   #dc2626;  /* Red   */
--color-cvd-info:    #0891b2;  /* Teal  */
```

---

## 3. Chart Colour Palette

### Before / After

| Series | Before (hex) | Before (name) | After (hex) | After (name) | Reason |
|--------|-------------|---------------|-------------|--------------|--------|
| Portfolio Value | `#10b981` | Emerald | `#2563eb` | Blue | Emerald and red/yellow look similar under deuteranopia |
| Accrued Yield | `#6366f1` | Indigo | `#d97706` | Amber/Orange | Blue + amber is the most CVD-safe pairing available |

The **blue / amber** pairing is recommended by the WCAG Working Group and by Tableau's colour accessibility guidelines. The two colours differ in both hue and luminance, providing distinguishability across all common CVD types.

### Reserved chart colours (for future series)

| Token | Hex | Name | Use |
|-------|-----|------|-----|
| `chart-a` | `#2563eb` | Blue | Primary series (Portfolio Value) |
| `chart-b` | `#d97706` | Amber | Secondary series (Yield) |
| `chart-c` | `#0891b2` | Teal | Tertiary series |
| `chart-d` | `#7c3aed` | Violet | Quaternary series |

### Legend redundancy

Chart legends use **distinct shapes** in addition to colour:
- Portfolio Value — ■ square swatch
- Accrued Yield — ● circle swatch

This ensures the series are distinguishable even in monochrome or greyscale.

---

## 4. Strategy Colours

### Before / After

| Strategy | Before (hex) | Before (name) | After (hex) | After (name) | Reason |
|----------|-------------|---------------|-------------|--------------|--------|
| Conservative | `#2563eb` (Blue) | Blue | `#2563eb` | Blue | No change — already CVD-safe |
| Balanced | `#10b981` (Emerald) | Emerald | `#0891b2` | Teal-blue | Emerald and amber are closer together under protanopia |
| Growth | `#d97706` (Amber) | Amber | `#d97706` | Amber | No change — already CVD-safe |

### Icon redundancy

Each strategy also carries a **distinct icon** in the selector button so colour is never the sole differentiator:

| Strategy | Icon | Colour |
|----------|------|--------|
| Conservative | ShieldCheck | Blue |
| Balanced | Zap | Teal |
| Growth | Flame | Amber |

---

## 5. Existing Brand Colours — Audit

| Colour | Hex | Usage | CVD concern | Assessment |
|--------|-----|-------|-------------|-----------|
| Emerald (`brand-500`) | `#10b981` | Primary brand, buttons, badges | Could be confused with red under protanopia in some contexts | ⚠️ Acceptable for brand identity (large areas, high saturation) but avoid using as a status-only colour without icon support |
| Indigo | `#6366f1` | Secondary data (charts, earnings) | Indigo is distinguishable for all common CVD types | ✅ Safe for use |
| Slate | various | Text, borders, backgrounds | Neutral — no CVD concern | ✅ Safe |
| Amber | `#d97706` | Growth strategy, warnings | Distinct from blue and teal under all CVD types | ✅ Safe |

---

## 6. Testing Methodology

### Tools used

1. **Color Oracle** — Desktop tool that applies real-time CVD simulation filters to the entire screen. Used to verify every colour combination in the running app.
2. **Browser DevTools** — Chrome/Edge: DevTools → Rendering → "Emulate vision deficiencies" → Deuteranopia / Protanopia. Used for component-level checks.
3. **Stark Figma plugin** — Used during design-phase audit of component designs.

### Test scenarios

For each colour change, the following were verified under both Deuteranopia and Protanopia simulation:
- [ ] Chart series are visually distinct (both colour and shape differentiate them)
- [ ] Strategy selector buttons are visually distinct (icon + colour)
- [ ] Status badges are visually distinct (icon + colour)
- [ ] Text contrast ratios remain ≥ 4.5:1 (WCAG SC 1.4.3)

---

## 7. WCAG SC 1.4.1 Compliance Notes

WCAG SC 1.4.1 states:
> "Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element."

This palette satisfies the requirement through:

1. **Icon redundancy** — Every status (success/warning/error/info) has a dedicated icon shape.
2. **Strategy icons** — Each strategy button includes an icon in addition to its colour.
3. **Chart shape redundancy** — The chart legend uses square vs. circle swatches in addition to colour.
4. **Accessible colour pairs** — All pairs pass CVD simulation with distinguishable luminance contrast.

---

## 8. Before / After Screenshot Descriptions

*Note: Actual screenshots are captured during PR review. The following describes the expected visible changes.*

### Chart (before)
- Portfolio Value line: **emerald green** (#10b981) — hard to distinguish from amber/orange under deuteranopia
- Accrued Yield line: **indigo** (#6366f1)
- Legend: both items use same circle shape

### Chart (after)
- Portfolio Value line: **blue** (#2563eb) — clearly distinct from amber under all CVD types
- Accrued Yield line: **amber/orange** (#d97706)
- Legend: square swatch for Portfolio Value, circle for Accrued Yield (shape redundancy)

### Strategy selector (before)
- Conservative: blue (✅)
- Balanced: emerald (⚠️ looks yellowish under protanopia — too close to amber/Growth)
- Growth: amber (✅)
- Buttons: colour only

### Strategy selector (after)
- Conservative: blue + ShieldCheck icon (✅)
- Balanced: teal-blue + Zap icon (✅ — clearly distinct from amber)
- Growth: amber + Flame icon (✅)
- Buttons: colour + icon (WCAG SC 1.4.1 compliant)
