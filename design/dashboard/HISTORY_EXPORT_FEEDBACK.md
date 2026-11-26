# History Export Feedback — Design Specification

> **Issue:** #684  
> **Context:** `design/dashboard`  
> **Target surface:** Dashboard → Transaction History page — Export / Download action  
> **Related specs:**
> - [design/dashboard/README.md](README.md)
> - [design/dashboard/TRANSACTION_PROGRESS_VOCABULARY.md](TRANSACTION_PROGRESS_VOCABULARY.md)
> - [docs/DESIGN_SYSTEM.md](../../docs/DESIGN_SYSTEM.md)

---

## 1. Purpose

When a user exports their transaction history (CSV or JSON), the UI must clearly
communicate four distinct outcomes:

| State key | When it applies |
|---|---|
| `export_progress` | Export has been requested; file is being generated |
| `export_complete` | File is ready; download link is live |
| `export_retry` | Export failed; user can safely attempt again |
| `export_empty` | No transactions exist in the requested date range |

Each state has defined copy, iconography, ARIA live-region annotation, and a primary
action so users always know what happened and what to do next.

---

## 2. State Definitions

### 2.1 `export_progress` — In Progress

**Trigger:** User clicks "Export history"; the backend CSV/JSON generation job starts.

| Attribute | Value |
|---|---|
| **Icon** | `Loader2` (animated spin) |
| **Icon colour** | `text-sky-400` |
| **Background** | `bg-sky-500/10` |
| **Heading** | Preparing your export… |
| **Body copy** | Gathering your transaction history. This usually takes a few seconds. |
| **Primary action** | None (dismiss button disabled while in-progress to prevent duplicate requests) |
| **Secondary action** | Cancel — aborts the in-flight request and resets to idle |

**ARIA annotation:**

```html
<div
  role="status"
  aria-live="polite"
  aria-label="Export in progress"
  aria-busy="true"
>
  Preparing your export…
</div>
```

> `aria-live="polite"` — not urgent; the screen reader announces after completing
> the current speech queue. `aria-busy="true"` signals that the region is updating.

---

### 2.2 `export_complete` — Completed

**Trigger:** Backend job returns a signed download URL (or inline Blob URL) for the
generated file.

| Attribute | Value |
|---|---|
| **Icon** | `CheckCircle2` |
| **Icon colour** | `text-emerald-400` |
| **Background** | `bg-emerald-500/10 border border-emerald-500/30` |
| **Heading** | Export ready |
| **Body copy** | Your transaction history is ready to download. The link expires in 15 minutes. |
| **Primary action** | **Download CSV** (or **Download JSON**) — `<a href="…" download>` link, keyboard-focusable, opens the file without leaving the page |
| **Secondary action** | Dismiss — closes the feedback banner; link remains active in the browser |

**ARIA annotation:**

```html
<div
  role="status"
  aria-live="polite"
  aria-label="Export complete"
>
  Export ready. Download link available. Link expires in 15 minutes.
</div>
```

> `aria-live="polite"` is sufficient here — the completion is good news, not an urgent
> interruption. The download `<a>` element carries its own accessible name from its
> visible text (`Download CSV`) and needs no additional `aria-label`.

---

### 2.3 `export_retry` — Failed (Retriable)

**Trigger:** The backend job returns an error (network failure, server-side generation
error, or timeout), and the error is not a permanent data-absence condition.

| Attribute | Value |
|---|---|
| **Icon** | `AlertCircle` |
| **Icon colour** | `text-red-400` |
| **Background** | `bg-red-500/10 border border-red-500/30` |
| **Heading** | Export failed |
| **Body copy** | We couldn't generate your export. Please try again. If the problem persists, check your connection or contact support. |
| **Primary action** | **Try again** — re-initiates the export job without requiring the user to re-select the date range |
| **Secondary action** | Dismiss — closes the feedback without retrying; user can manually re-trigger from the Export button |

**ARIA annotation:**

```html
<div
  role="alert"
  aria-live="assertive"
  aria-label="Export failed"
>
  Export failed. We couldn't generate your export. Select Try again to retry.
</div>
```

> `role="alert"` with `aria-live="assertive"` — failure is an urgent state change that
> must interrupt the screen reader immediately. The word "retry" is in the announcement
> so keyboard-only users understand an action is available before reaching the button.

**Retry guard:** After three consecutive failures the "Try again" button is replaced with
a "Contact support" link to prevent repeated server-side load from a broken export job.

---

### 2.4 `export_empty` — No Transactions Found

**Trigger:** The export job completes successfully but the requested date range contains
zero transactions.

| Attribute | Value |
|---|---|
| **Icon** | `Inbox` or `FileX` |
| **Icon colour** | `text-slate-400` |
| **Background** | `bg-slate-500/10 border border-slate-500/20` |
| **Heading** | No transactions to export |
| **Body copy** | There are no transactions in the selected date range ({start date} – {end date}). Try adjusting the date filter. |
| **Primary action** | **Adjust date range** — returns focus to the date-range picker with the current range pre-filled for editing |
| **Secondary action** | Dismiss — closes the feedback |

**ARIA annotation:**

```html
<div
  role="status"
  aria-live="polite"
  aria-label="No transactions found"
>
  No transactions to export for the selected date range.
  Adjust the date range to try a different period.
</div>
```

> `role="status"` / `aria-live="polite"` — the absence of data is informational, not an
> error; a polite announcement is appropriate. The suggestion to adjust the range is
> included in the announcement so the user understands the recovery path before reading
> the visual UI.

---

## 3. Full State Matrix

| State | Icon | Colour | `aria-live` | `role` | Primary action | Secondary action |
|---|---|---|---|---|---|---|
| `export_progress` | `Loader2` (spin) | sky-400 | `polite` | `status` | — (disabled) | Cancel |
| `export_complete` | `CheckCircle2` | emerald-400 | `polite` | `status` | Download CSV / JSON | Dismiss |
| `export_retry` | `AlertCircle` | red-400 | `assertive` | `alert` | Try again | Dismiss |
| `export_empty` | `Inbox` | slate-400 | `polite` | `status` | Adjust date range | Dismiss |

---

## 4. Transition Flow

```
Idle (Export button enabled)
  │
  ▼  user clicks Export
export_progress  (aria-busy=true, cancel available)
  │
  ├─── success + records found ──▶  export_complete  (download link)
  │
  ├─── success + no records ────▶  export_empty  (adjust range)
  │
  └─── error ────────────────────▶  export_retry  (try again / support)
                                        │
                                        └─ retry ──▶  export_progress
```

---

## 5. Copy Guidelines

- **Date placeholders** (`{start date}`, `{end date}`) must render in the user's locale
  using `Intl.DateTimeFormat` — do not hard-code US month/day order.
- **File format label** in the Download button must reflect the actual format selected
  (`Download CSV` vs `Download JSON`), not a generic "Download" label.
- **Link-expiry copy** is shown only when the download URL is time-limited (signed S3
  URL or equivalent). If the URL is a client-side Blob URL it does not expire;
  omit the expiry sentence.
- Avoid the word "error" in the `export_empty` state — the system worked correctly;
  there is simply no data. Reserve "failed" for the `export_retry` state.

---

## 6. Accessibility Checklist

- [ ] `export_progress` region has `aria-busy="true"` and `aria-live="polite"`.
- [ ] `export_complete` download link has a visible label (`Download CSV`) and is reachable by keyboard Tab.
- [ ] `export_retry` region uses `role="alert"` with `aria-live="assertive"`.
- [ ] `export_empty` region uses `role="status"` with `aria-live="polite"`.
- [ ] No state uses colour alone to convey meaning (icons + text accompany all colour changes).
- [ ] Colour contrast for each state meets WCAG 2.1 AA (4.5:1 for normal text).
- [ ] Focus is moved to the feedback banner when it appears (use `focus()` on the banner heading or the primary action button).
- [ ] "Cancel" in `export_progress` is reachable via keyboard and has a visible focus ring.

---

## 7. Related Documents

- [design/dashboard/TRANSACTION_PROGRESS_VOCABULARY.md](TRANSACTION_PROGRESS_VOCABULARY.md) — General transaction state vocabulary and ARIA patterns
- [design/dashboard/README.md](README.md) — Dashboard design handoff overview
- [docs/DESIGN_SYSTEM.md](../../docs/DESIGN_SYSTEM.md) — Colour tokens and component inventory
