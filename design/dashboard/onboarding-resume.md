# Onboarding Walkthrough — Resume and Restart Design

**Issue:** #697  
**Workstream:** UI/UX — Dashboard  
**Related:** [design/dashboard/README.md](README.md)

---

## Problem

When a user dismisses or navigates away from the onboarding walkthrough mid-flow,
the existing implementation marks the tour as completed and never shows it again.
Users who want to return to it — or who were interrupted — have no way back.

---

## Interaction model

### Storage keys

| Key | Value | Purpose |
|-----|-------|---------|
| `neurowealth-onboarding-completed` | `"true"` | Set only when the user finishes or explicitly skips. |
| `neurowealth-onboarding-step` | `"0"` – `"4"` | Last step index the user reached. Cleared on completion. |

### Entry states

| Condition | Behaviour |
|-----------|-----------|
| First visit (no keys set) | Tutorial auto-opens at step 0 after 1.5 s. |
| Partial progress (step key set, completed key absent) | On next visit the **resume prompt** is shown: "Continue where you left off?" with **Resume** (primary) and **Start over** (secondary) actions. |
| Completed or skipped (completed key set) | Tutorial does not auto-open. A manual trigger (e.g. Help button) can re-open it at step 0. |

### Resume prompt

```
┌──────────────────────────────────────┐
│  Continue your tour?                 │
│                                      │
│  You were on step 3 of 5.            │
│                                      │
│  [Start over]        [Resume →]      │
└──────────────────────────────────────┘
```

- **Resume** restores the saved step and shifts focus to the step title.
- **Start over** resets the step counter to 0 and shifts focus to the step title.
- Closing the prompt (×) leaves both keys unchanged so the prompt reappears next visit.

### Focus behaviour

When the tutorial modal opens (any path), focus is programmatically moved to the
`<h3>` step title element. This ensures keyboard users and screen readers receive
the step heading as the first announced content.

The title element carries `data-testid="onboarding-step-title"` so automated tests
can assert which step receives focus after resume or restart.

### Explicit actions map

| User action | Step key | Completed key | Focus target |
|-------------|----------|---------------|--------------|
| Advance to next step | Updated to current index | — | Step title `<h3>` |
| Press Back | Updated to current index | — | Step title `<h3>` |
| Click dot nav | Updated to clicked index | — | Step title `<h3>` |
| Finish tour (last step) | Cleared | Set to `"true"` | — (modal closes) |
| Skip tour | Cleared | Set to `"true"` | — (modal closes) |
| Close resume prompt (×) | Unchanged | Unchanged | — |
| Resume from prompt | Restored from storage | — | Step title `<h3>` |
| Start over from prompt | Reset to `"0"` | — | Step title `<h3>` |

---

## Acceptance criteria

- [ ] Resume prompt appears when `neurowealth-onboarding-step` exists and `neurowealth-onboarding-completed` does not.
- [ ] Resume button restores the saved step index.
- [ ] Start over button resets to step 0.
- [ ] Focus moves to `[data-testid="onboarding-step-title"]` after resume and after start over.
- [ ] Completing the tour clears the step key and sets the completed key.
- [ ] Skipping the tour clears the step key and sets the completed key.
- [ ] Closing the resume prompt leaves keys unchanged (prompt reappears next visit).
