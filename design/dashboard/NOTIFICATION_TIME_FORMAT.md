# Notification Time-Format Guidelines

**Issue:** #695  
**Workstream:** UI/UX — NeuroWealth Dashboard  
**Target surfaces:** Activity feed, transaction history, vault-update banners, alert notifications

---

## 1. Purpose

Vault updates (deposits, withdrawals, rebalances, yield harvests) happen at any
hour and may be read by users in widely different time zones. A message
timestamped only as "2 h ago" is unambiguous to someone who checks the app
immediately but becomes misleading 18 hours later. This specification defines
how every notification timestamp is formatted, what information is accessible to
users who need it, and how screen readers announce time information.

---

## 2. Display tiers

Apply tiers in priority order based on how much time has elapsed since the event.

| Elapsed time | Visible label | Example | Notes |
|---|---|---|---|
| 0 – 59 s | "Just now" | "Just now" | Do not display seconds |
| 1 – 59 min | "X min ago" | "12 min ago" | Integer minutes; no fractions |
| 1 – 23 h | "X h ago" | "3 h ago" | Integer hours; no fractions |
| Same calendar day (≥ 24 h ago) | Wall-clock time, 24 h | "09:34" | Use user's locale time zone |
| Yesterday | "Yesterday, HH:MM" | "Yesterday, 22:17" | Same locale time zone |
| 2 – 29 days ago | Weekday + date | "Tue 8 Jul, 14:05" | Abbreviated month, no year |
| 30 + days ago | Full date + time | "14 Jul 2026, 09:34" | No relative suffix ever |

The 30-day cutoff for relative display prevents misleading strings like
"47 days ago" on historical entries that users review for reconciliation.

---

## 3. Time-zone access

Users must never need to mentally convert a time. Every absolute timestamp
(tiers 4 – 7) must:

1. **Render in the browser/OS time zone** detected via
   `Intl.DateTimeFormat().resolvedOptions().timeZone`.
2. **Expose the IANA zone name and UTC offset** in a tooltip or disclosure
   that appears on hover (pointer devices) or on focus (keyboard navigation).
   Format: `"Europe/Berlin (UTC+2)"`.
3. **Never hard-code UTC** as the display zone unless the user has explicitly
   set a UTC preference.

### Implementation note

```ts
const userLocale = navigator.language;
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now  = new Date();
  const elapsedMs = now.getTime() - date.getTime();

  if (elapsedMs < 60_000)                        return 'Just now';
  if (elapsedMs < 3_600_000)                     return `${Math.floor(elapsedMs / 60_000)} min ago`;
  if (elapsedMs < 86_400_000)                    return `${Math.floor(elapsedMs / 3_600_000)} h ago`;
  if (elapsedMs < 30 * 86_400_000) {
    return new Intl.DateTimeFormat(userLocale, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: userTimeZone,
    }).format(date);
  }
  return new Intl.DateTimeFormat(userLocale, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: userTimeZone,
  }).format(date);
}
```

---

## 4. Screen-reader wording

The visible short label (e.g. "12 min ago") carries no machine-readable
precision. Screen readers must receive the full context.

### Pattern

```html
<!-- Short visible label hidden from AT -->
<span aria-hidden="true">12 min ago</span>

<!-- Machine-readable datetime + human sentence for AT -->
<time
  datetime="2026-07-14T09:34:00+02:00"
  class="sr-only"
>
  Updated 14 July 2026 at 09:34, Europe/Berlin (UTC+2)
</time>
```

### Rules

- The `datetime` attribute must be a full ISO-8601 string with UTC offset
  (never a bare date or relative value).
- The human sentence in the `<time>` text must include: event verb ("Updated",
  "Deposited", "Withdrawn", "Rebalanced"), full date, 24-hour time, and
  IANA zone name with offset.
- For "Just now" labels: use `datetime` set to the actual event timestamp,
  not the current time.
- `aria-live="polite"` on the notification container ensures screen readers
  re-announce when a relative label ticks forward (e.g. "Just now" becomes
  "1 min ago").

---

## 5. Older-message treatment

Entries older than 30 days appear in the transaction history panel and in
exported activity reports. They must:

1. Show only the absolute date and time (tier 7: "14 Jul 2026, 09:34").
2. Never append a relative suffix ("47 days ago" is forbidden on these entries).
3. Remain sorted in reverse chronological order regardless of display tier.
4. In the accessible `<time datetime>` sentence, include the word "on":
   "Deposited on 14 July 2026 at 09:34, Europe/Berlin (UTC+2)".

---

## 6. Acceptance criteria

| Criterion | Specification |
|---|---|
| Relative display | Messages < 60 s → "Just now"; 1–59 min → "X min ago"; 1–23 h → "X h ago" |
| Absolute display | Same-day and older messages rendered in user's browser time zone via `Intl.DateTimeFormat` |
| Time-zone access | IANA zone + UTC offset exposed on hover/focus for every absolute timestamp |
| Screen-reader wording | Visible label is `aria-hidden`; `<time datetime="ISO-8601">` carries verb + full date + zone |
| Older-message treatment | Entries > 30 days old always show absolute date+time; relative suffix suppressed |

---

## 7. Related documents

- [`design/dashboard/README.md`](README.md) — Design handoff overview
- [`docs/ACCESSIBILITY.md`](../../docs/ACCESSIBILITY.md) — Platform WCAG requirements
- [`docs/DESIGN_SYSTEM.md`](../../docs/DESIGN_SYSTEM.md) — Colour and typography tokens
