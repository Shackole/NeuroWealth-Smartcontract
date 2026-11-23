# Accessible status icons

Use a visible status label beside each icon. Name the component or design variant by meaning, such as `status/transaction/confirmed` or `status/system/paused`. Keep glyph names in the implementation mapping so a glyph can change without renaming the status. Use the Lucide glyph names below and the transaction terms in the [progress vocabulary](TRANSACTION_PROGRESS_VOCABULARY.md).

| Semantic name | Lucide glyph | Visible label | Use |
| --- | --- | --- | --- |
| `status/transaction/signature-requested` | `KeyRound` | Awaiting wallet signature | The user has a wallet approval to complete |
| `status/transaction/pending` | `Clock` | Awaiting ledger confirmation | A submitted transaction is awaiting a ledger result |
| `status/transaction/delayed` | `AlertTriangle` | Confirmation delayed | Confirmation is taking longer than expected |
| `status/transaction/confirmed` | `CheckCircle2` | Confirmed on ledger | The ledger has confirmed success |
| `status/transaction/failed` | `XCircle` | Transaction failed | A definitive failure has been reported |
| `status/system/operational` | `CheckCircle2` | Vault operational | The vault is accepting operations |
| `status/system/paused` | `PauseCircle` | Vault paused | The vault reports a pause |
| `status/system/unknown` | `HelpCircle` | Vault status unavailable | The current state could not be determined |
| `status/system/info` | `Info` | Read-only mode | An informational restriction applies |

## Placement and announcements

- Use 16 px glyphs with a 2 px stroke and 6 px spacing in table rows and badges. Let labels wrap in narrow layouts and at increased text size. Include the object in the label if the surrounding heading or column leaves it ambiguous.
- Hide the SVG from assistive technology with `aria-hidden="true"` and `focusable="false"` when the adjacent text provides the meaning. Keep the visible label available to screen readers. A separate status-details button needs its own accessible name and keyboard focus.
- For status changes after a user action, update a single polite live region using the visible label. Reserve assertive announcements for urgent failures that require immediate attention. Keep badges in static table history outside live regions.
- Pair color with distinct glyphs and labels. The pending clock works as a static icon and can remain static when reduced motion is requested. In forced colors, let the glyph inherit the system text color and keep any meaningful outline visible.

## Contrast by theme

Use solid foreground/background pairs for status badges. The table reports calculated WCAG relative-luminance contrast for the same foreground on the icon and label. Require at least 4.5:1 for normal-sized labels and 3:1 for meaningful icons against their adjacent surface. In System mode use the pair for the resolved Light or Dark theme.

| Status role | Light on `#FFFFFF` | Ratio | Dark on `#121824` | Ratio |
| --- | --- | ---: | --- | ---: |
| Confirmed, operational | `#1D4ED8` | 6.70:1 | `#93C5FD` | 9.85:1 |
| Delayed, paused | `#92400E` | 7.09:1 | `#FCD34D` | 12.32:1 |
| Failed | `#B91C1C` | 6.47:1 | `#FCA5A5` | 9.36:1 |
| Signature, pending, informational | `#155E75` | 7.27:1 | `#67E8F9` | 12.26:1 |
| Unknown | `#334155` | 10.35:1 | `#CBD5E1` | 11.97:1 |

Recalculate contrast for tinted, translucent or interactive surfaces using the final composited background. In monochrome and print, retain the visible label and render any retained icon in the text color.
