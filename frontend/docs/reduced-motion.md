# Reduced motion and financial feedback

The global `prefers-reduced-motion: reduce` rule removes animations and
transitions, including Tailwind spinner, ping, pulse, bounce, modal entrance,
chart, skeleton, and hover movement effects. It also disables smooth scrolling.
Loading, signing, confirmation, and error states continue to render their text
labels and icons without relying on movement or color alone.

## Workflow behavior

- Deposit progress is represented by the visible signing-step label and remains
  tied to transaction state, not animation completion.
- Withdrawal progress and success are represented by visible state headings and
  copy. The motion preference changes presentation only.
- Chart values and labels remain present when visual transitions are removed.
- Skeleton placeholders become static while their surrounding loading state
  remains available to assistive technology.

## Manual review evidence

Set the operating system or browser preference to **Reduce motion**, reload, and
review dashboard charts, modal open/close, deposit signing, withdrawal
processing/success, and skeleton loading. Expected: no decorative movement;
state text and actions remain visible and the financial workflow still advances
from transaction state. The reduced-motion CSS rule is in
`frontend/src/app/globals.css`. This manual review was documented but not run in
this repository session.
