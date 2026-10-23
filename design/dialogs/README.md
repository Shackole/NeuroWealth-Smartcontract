# Accessible dialog interaction contract (Issue #493)

This spec applies to deposit, withdrawal, strategy-confirmation, and wallet
connection prompts. A modal dialog has `role="dialog"`, `aria-modal="true"`,
and an accessible name from a visible heading. A non-modal strategy popover must
remain non-modal and must not trap focus.

## Focus and keyboard behavior

| Moment | Required behavior |
|---|---|
| Open | Save the invoking element. Move focus to the dialog heading (`tabIndex=-1`) when the dialog contains explanatory content, otherwise to the first required field. Do not move focus to a destructive or final-confirm action by default. |
| Tab / Shift+Tab | Keep focus within the active modal. Wrap from the last focusable control to the first and vice versa. Disabled controls and hidden controls are excluded. |
| Close | Restore focus to the invoking element if it is still mounted and enabled; otherwise focus the nearest logical page heading or action. |
| Escape before signing/submission | Close the current dialog and return focus. No transaction is sent. Nested dialogs close only the topmost layer first. |
| Escape while wallet approval or transaction submission is pending | Do not dismiss the modal or imply cancellation. Explain that signing/submission is pending. Once an outcome is known, enable normal dismissal. A wallet prompt is external and cannot be canceled by closing the page dialog. |
| Backdrop click | Treat as a dismissal only before a transaction is pending. Never dismiss the parent when interacting with a nested dialog. |
| Screen reader | Keep the dialog name and purpose available; announce validation errors and status changes with `aria-describedby` and a polite/live status region. Do not announce decorative icons. |

## Nested wallet interactions

Freighter or another wallet may open its own browser-controlled prompt. The
application must not create a second modal around that external prompt, steal
focus while it is open, or claim that Escape in the page canceled wallet
approval. Keep the transaction summary and pending state in the application;
when focus returns, report approved, rejected, or indeterminate submission
status. An indeterminate result requires checking the transaction hash/status
before offering another submission.

For nested in-app dialogs (for example, a deposit review over the deposit
form), only the topmost dialog receives keyboard focus. Closing the child
returns focus to its triggering control inside the parent. The parent remains
modal until it is separately closed.

## Content and dismissal rules

- Give each dialog a visible title and a concise purpose statement.
- Label all form fields and link field errors with `aria-describedby`.
- While a transaction is pending, disable duplicate submission and every
  dismissal path that would suggest the request was canceled.
- On success or failure, announce the outcome before restoring focus.
- Strategy details are a non-modal disclosure/popover; Escape closes it and
  returns focus to its trigger.

## Manual review scenarios

Review each flow with keyboard only and a screen reader at desktop (1440 px)
and mobile (375 px): open, traverse controls in both directions, trigger
validation, invoke/cancel the wallet prompt, return from the external wallet,
complete or reject the transaction, and close. Confirm the exact focus target
and that Escape/backdrop behavior matches the transaction state. No production
wallet key or live transaction is needed for this review.
