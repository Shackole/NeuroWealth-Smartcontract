# Accessibility Statement

> **Issue:** #668 · #76
> **Standard:** [WCAG 2.1 Level AA](https://www.w3.org/TR/WCAG21/)
> **Scope:** `@neurowealth/vault-ui` (`packages/vault-ui`)

NeuroWealth is committed to making the vault dashboard usable by people with disabilities. This statement describes conformance, known limitations, and how we test.

## Conformance

The vault UI targets **WCAG 2.1 Level AA**. Automated checks (axe-core) run in CI on every pull request. Manual screen-reader passes (VoiceOver on macOS/iOS, NVDA on Windows) are required before a UI release and are recorded in the checklist below.

## What is in place

| Criterion | Implementation |
|-----------|----------------|
| Keyboard access | Every control is a native `button`, `a`, `input`, `select`, or `checkbox`. Tab order follows visual order. |
| Skip navigation | "Skip to main content" link is the first focusable element and jumps to `#main-content`. |
| Screen readers | Landmarks (`header`, `nav`, `main`), `aria-label` / `aria-labelledby`, `aria-live` for status and errors, `aria-invalid` + `aria-describedby` on the amount field. |
| Focus indicators | `:focus-visible` outline uses `primary-700` (`#1d4ed8`) at 0.125rem, offset 0.125rem. |
| Colour contrast | Body and UI text use `gray-900` / `gray-700` on `gray-50`/`white` (≥ 4.5:1). Primary actions use `primary-700` on white (≥ 4.5:1). |
| Text sizing | Layout and type use rem-based Tailwind tokens; the root font size is not locked to pixels. Users can zoom to 200% without loss of function. |
| Images / icons | Decorative marks are CSS-only. Informative images have `alt`. Charts expose a visually hidden data table. |
| Forms | Every input has a `<label>`. Errors are announced via `role="alert"` and referenced from the field. |
| Reduced motion | `prefers-reduced-motion: reduce` disables non-essential transitions. |

## WCAG 2.1 AA Criterion Status Table

The table below records the evaluation status of each Level A and Level AA success criterion applicable to the vault UI as of the evaluation date in the [Conformance Report](#conformance-report--vpat) section.

**Status key:** Pass · Partial · Fail · N/A

### Principle 1 — Perceivable

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 1.1.1 Non-text Content | A | Pass | Decorative icons are hidden from assistive technology (`aria-hidden`). Informative images carry descriptive `alt` text. Chart regions expose a visually hidden data table as a text alternative. |
| 1.2.1 Audio-only and Video-only (Pre-recorded) | A | N/A | The vault UI contains no audio-only or video-only media. |
| 1.2.2 Captions (Pre-recorded) | A | N/A | No pre-recorded video content is present. |
| 1.2.3 Audio Description or Media Alternative | A | N/A | No pre-recorded video content is present. |
| 1.2.4 Captions (Live) | AA | N/A | No live audio or video streams are used. |
| 1.2.5 Audio Description (Pre-recorded) | AA | N/A | No pre-recorded video content is present. |
| 1.3.1 Info and Relationships | A | Pass | HTML5 landmark elements (`header`, `nav`, `main`, `footer`) and ARIA roles communicate structure. Form labels are programmatically associated with their controls. Table headers use `<th scope>`. |
| 1.3.2 Meaningful Sequence | A | Pass | DOM order matches visual reading order; no CSS-only reordering is applied. |
| 1.3.3 Sensory Characteristics | A | Pass | Instructions do not rely solely on shape, colour, size, or spatial position. Error messages include text descriptions. |
| 1.3.4 Orientation | AA | Pass | The layout responds to both portrait and landscape orientations. No viewport `user-scalable=no` constraint is set. |
| 1.3.5 Identify Input Purpose | AA | Pass | Autocomplete tokens (`username`, `email`, `tel`) are applied where applicable in the onboarding flow. |
| 1.4.1 Use of Color | A | Pass | Colour is never the sole means of conveying information. Error states include icon + text in addition to red border. Chart series use distinct patterns and labels alongside colour fills. |
| 1.4.2 Audio Control | A | N/A | No auto-playing audio is present. |
| 1.4.3 Contrast (Minimum) | AA | Pass | All body text and UI labels meet 4.5:1. Large text (≥ 18 pt / 14 pt bold) meets 3:1. Verified with the axe-core colour-contrast rule and Figma Contrast plugin. |
| 1.4.4 Resize Text | AA | Pass | Root font size is not locked; all sizes use `rem` tokens. Content is fully functional at 200% browser zoom. |
| 1.4.5 Images of Text | AA | Pass | No images of text are used; all text is rendered as live HTML. |
| 1.4.10 Reflow | AA | Pass | At 320 CSS px width the layout reflows to a single column without horizontal scrolling or loss of content. |
| 1.4.11 Non-text Contrast | AA | Pass | Focus indicators, form field borders, chart axes, and icon boundaries all meet 3:1 contrast against adjacent backgrounds. |
| 1.4.12 Text Spacing | AA | Pass | Overriding line-height (1.5×), letter-spacing (0.12 em), word-spacing (0.16 em), and paragraph spacing (2×) via browser extension causes no loss of content or functionality. |
| 1.4.13 Content on Hover or Focus | AA | Pass | Tooltip content is dismissible (Esc), hoverable (pointer can move over the tooltip without it closing), and persistent until dismissed. |

### Principle 2 — Operable

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 2.1.1 Keyboard | A | Pass | All interactive elements are reachable and operable by keyboard alone. No JavaScript-only mouse event handlers block keyboard access. |
| 2.1.2 No Keyboard Trap | A | Pass | Focus cannot become trapped in the deposit panel or notification preferences. No modal dialog with a focus trap is present. |
| 2.1.4 Character Key Shortcuts | A | N/A | No single-character keyboard shortcuts are implemented. |
| 2.2.1 Timing Adjustable | A | N/A | No time limits are imposed by the UI. Session expiry (if any) is handled server-side with adequate warning. |
| 2.2.2 Pause, Stop, Hide | A | Pass | Auto-updating balance figures can be paused via the "Pause live updates" toggle. No auto-playing animations exist. |
| 2.3.1 Three Flashes or Below Threshold | A | Pass | No content flashes more than three times per second. |
| 2.4.1 Bypass Blocks | A | Pass | A "Skip to main content" link is the first focusable element on every page and routes focus to `#main-content`. |
| 2.4.2 Page Titled | A | Pass | Every route sets a unique, descriptive `<title>` via the Next.js `Metadata` API (e.g., "Dashboard – NeuroWealth", "Deposit – NeuroWealth"). |
| 2.4.3 Focus Order | A | Pass | Tab order is logical and consistent with visual layout. Dynamically inserted content (toasts, inline errors) receives focus or is announced without disrupting the tab sequence. |
| 2.4.4 Link Purpose (In Context) | A | Pass | All links are either self-descriptive or supplemented with `aria-label`. Generic "here" and "click" link text is not used. |
| 2.4.5 Multiple Ways | AA | Pass | Users can reach any page through both the primary navigation and the dashboard summary cards. |
| 2.4.6 Headings and Labels | AA | Pass | A logical heading hierarchy (h1 → h2 → h3) is maintained on every route. Every form control has a visible, associated `<label>`. |
| 2.4.7 Focus Visible | AA | Pass | `:focus-visible` outlines are present on all interactive elements with minimum 0.125rem width and 0.125rem offset, using `primary-700` (`#1d4ed8`). |

### Principle 3 — Understandable

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 3.1.1 Language of Page | A | Pass | `<html lang="en">` is set on every page. |
| 3.1.2 Language of Parts | AA | Pass | No significant passages in a language other than English are present. |
| 3.2.1 On Focus | A | Pass | Receiving focus does not trigger any context change (no auto-submit, no page navigation). |
| 3.2.2 On Input | A | Pass | Changing a form field value does not automatically submit the form or cause an unexpected context change. |
| 3.2.3 Consistent Navigation | AA | Pass | Navigation components appear in the same order across all pages. |
| 3.2.4 Consistent Identification | AA | Pass | UI components with the same function share the same label and accessible name throughout the application. |
| 3.3.1 Error Identification | A | Pass | Validation errors are identified in text, reference the specific field by name, and are announced via `role="alert"`. |
| 3.3.2 Labels or Instructions | A | Pass | Every input field has a visible `<label>`. Format hints (e.g., "Minimum 1 USDC") appear as persistent helper text below the field, not only as placeholder text. |
| 3.3.3 Error Suggestion | AA | Pass | Where the error type is known, suggested corrections are provided in the error message (e.g., "Amount must be between 1 and 10,000 USDC"). |
| 3.3.4 Error Prevention (Legal, Financial) | AA | Pass | Deposit and withdrawal actions require a confirmation step before committing the transaction. Users can review all details before final submission. |

### Principle 4 — Robust

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 4.1.1 Parsing | A | Pass | HTML output is validated as part of CI. No duplicate IDs or unclosed elements are present in rendered output. |
| 4.1.2 Name, Role, Value | A | Pass | All UI components expose name, role, and state via native HTML semantics or explicit ARIA attributes. Custom components (e.g., the strategy selector) use `role="radiogroup"` + `role="radio"` with `aria-checked`. |
| 4.1.3 Status Messages | AA | Pass | Status messages (deposit confirmation, withdrawal success, error toasts) are implemented with `role="status"` or `role="alert"` so assistive technologies announce them without moving focus. |

## Automated testing

```bash
cd packages/vault-ui
npm test
```

`src/a11y.test.tsx` renders the app (including deposit/withdraw, earnings, and notification preferences) and runs [axe-core](https://github.com/dequelabs/axe-core) via `vitest-axe` with WCAG 2.1 AA tags. The `vault-ui-test` CI job fails the PR on violations.

jsdom cannot fully evaluate colour contrast or screen-reader output, which is why the manual checklist exists.

## Manual screen-reader checklist

Run before tagging a UI release. Tick each item in the PR description.

### VoiceOver (macOS)

- [ ] Rotor lists Headings, Landmarks, and Form Controls for Deposit / Withdraw, Earnings, and Notifications.
- [ ] Skip link is the first VoiceOver landing and moves focus into `<main>`.
- [ ] Amount field label, preview, and error text are announced together.
- [ ] Success and error toasts are spoken when they appear (`aria-live`).
- [ ] Chart regions announce their `aria-label`; the data table is reachable.

### NVDA (Windows, Firefox or Chrome)

- [ ] Same landmark / heading structure as VoiceOver.
- [ ] Focus is visible while tabbing with NVDA off (keyboard-only).
- [ ] Checkbox group in notification preferences is read as a group (`fieldset` / `legend`).
- [ ] Push-permission and email-fallback status changes are announced.

### Keyboard-only

- [ ] Tab, Shift+Tab, Enter, and Space operate every control.
- [ ] No keyboard trap in the deposit modal or notification panel.
- [ ] Esc is not required to complete a task (there is no blocking overlay).

## Known Gaps

The table below documents accessibility issues that are partially addressed or not yet resolved. All items are tracked in the project issue tracker with the `a11y` label.

| Gap | Criterion | Severity | Planned Resolution Date |
|-----|-----------|----------|------------------------|
| Complex charts (multi-series APY history, portfolio allocation) rely on colour differentiation and an optional data table toggle. The data table is present but not automatically surfaced — users must activate it. Some chart annotations are not fully accessible to screen readers. | 1.4.1 Use of Color, 1.1.1 Non-text Content | Medium | Q1 2025 |
| The WhatsApp bot interface (`whatsapp/`) has no automated accessibility testing. Conversational UI accessibility (message threading, button responses) has not been formally evaluated against WCAG 2.1. | 4.1.2 Name, Role, Value | Low | Q1 2025 |
| iOS VoiceOver testing is currently performed only via the macOS simulator. Native on-device testing on physical iOS hardware (iPhone / iPad) has not been conducted. Simulator behaviour may differ from real-device results. | 1.3.1 Info and Relationships, 2.4.3 Focus Order | Low | Q2 2025 |
| The earnings projection chart uses a canvas-based renderer for performance. Canvas content is not exposed to the accessibility tree; only a static `aria-label` on the container is provided. A full text alternative (data table) is not yet implemented for this chart. | 1.1.1 Non-text Content | Medium | Q2 2025 |
| Strategy preference radio buttons in the WhatsApp onboarding flow are rendered as plain-text numbered options. No ARIA roles or keyboard navigation apply in that context. | 4.1.2 Name, Role, Value | Low | Q1 2025 |

## Conformance Report / VPAT

This section provides a brief Voluntary Product Accessibility Template (VPAT)-style conformance declaration for the NeuroWealth vault UI.

| Field | Value |
|-------|-------|
| **Product Name** | NeuroWealth Vault UI |
| **Product Version** | As of commit on evaluation date (see `CHANGELOG.md`) |
| **Evaluation Date** | 2024-09-24 |
| **Evaluation Methods Used** | Automated testing (axe-core via `vitest-axe` in CI); manual keyboard-only testing; manual screen-reader testing with VoiceOver on macOS 14 and NVDA 2024.1 on Windows 11 with Firefox 128; colour-contrast analysis with Figma Contrast and browser devtools; WCAG 2.1 criterion-by-criterion review. |
| **Applicable Standards** | [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/), Levels A and AA |
| **Overall Level of Conformance** | **Partially Conformant** — the product does not fully conform to WCAG 2.1 Level AA. Known gaps are documented in the [Known Gaps](#known-gaps) section above. |

### Conformance Summary

The vault UI achieves **Pass** status on the majority of applicable WCAG 2.1 Level AA criteria. The primary areas of partial conformance relate to complex data visualisation (charts) and interfaces outside the web browser (WhatsApp bot), as detailed in [Known Gaps](#known-gaps). Core transactional flows — deposit, withdrawal, balance inquiry, and strategy selection — are fully operable via keyboard and screen reader.

The evaluation covered the following surfaces:

- Dashboard route (`/dashboard`)
- Deposit and withdrawal panels
- Earnings history view
- Notification preferences panel
- Onboarding / sign-in flow

The WhatsApp bot interface and AI agent backend are out of scope for this WCAG evaluation but are noted as a gap for future evaluation.

## Accessibility Feedback Contact

We welcome feedback on the accessibility of NeuroWealth. If you encounter a barrier or have a suggestion for improvement, please use one of the following channels:

### Filing a GitHub Issue (preferred)

1. Open a new issue in this repository.
2. Add the `a11y` label.
3. Describe the barrier: which page or component, what assistive technology and version you are using (if applicable), and the expected versus actual behaviour.
4. If the issue also affects fund operations (e.g., you cannot complete a deposit or withdrawal), additionally follow the responsible-disclosure process in [`docs/BUG_BOUNTY.md`](BUG_BOUNTY.md) so the issue receives appropriate priority.

### What to include

A useful accessibility report contains:

- **URL or route** where the problem occurs
- **Assistive technology** (e.g., VoiceOver 14, NVDA 2024.1, Switch Access on Android)
- **Browser and version** (e.g., Chrome 126, Firefox 128, Safari 17)
- **Steps to reproduce**
- **Expected behaviour** (what should happen for a user of the assistive technology)
- **Actual behaviour** (what currently happens)

### Response commitment

Accessibility issues labelled `a11y` are reviewed within **5 business days**. Critical barriers that prevent core financial operations (deposit, withdrawal) are treated as high-severity bugs and escalated to the next release cycle.
