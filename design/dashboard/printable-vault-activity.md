# Printable vault activity summary

Place **Print activity** next to the date filters on the Activity screen. Open a print preview with one account and vault per document. The preview states the scope before opening the browser print dialog, where users can choose paper or Save as PDF.

## Document layout

- Page 1 starts with “Vault activity summary,” vault name and contract ID, Stellar network, full public account address, and the generation timestamp. Wrap identifiers so readers can recover them from paper. Use the account and vault selected when preview opens and label public identifiers explicitly.
- Display the start and end dates, inclusive, and the timezone used for both filters and row timestamps. For example, “1–31 Oct 2026 · UTC.” Include events from local midnight on the first date up to, excluding, local midnight after the last date. Label an unrestricted view “All available dates” and show its earliest and latest included activity when known.
- Print all matching rows across screen pages in the selected sort order. Default to newest first with a stable event ID tie-breaker. List any active type or status filters in plain text, followed by the number of matching events. Keep rows and scope fixed as of the generation timestamp.
- Use columns for date and time, activity, signed amount with its unit, and written status. Place the full transaction hash and any essential details on a wrapped line within the same row. Use “No transaction hash yet” where applicable.
- Use portrait A4 and US Letter, 15 mm margins, and at least 10 pt body text. Let rows expand. Keep each ordinary row together, repeat column headings on every page, and show the vault, network, account suffix, date range, and “Page n of N” on continuation pages. A controlled renderer should count pages after measuring wrapped rows. For an exceptionally long record, carry its overflow to the next page with the date and activity repeated and marked “continued.”
- Keep the first heading with its context and first row. For an empty range, print one page with the scope and “No vault activity matches this selection.” If any matching data fails to load, hold the preview and show “Activity could not be loaded. Try again.”

## Screen elements in print

| On screen | On paper and PDF |
| --- | --- |
| Filters, sorting and screen pagination | Scope and sort order as static text |
| Explorer, copy and expand controls | Full hash and useful expanded details inline |
| Status badges, spinners and icon-only indicators | Static status label as of generation time |
| Tooltips | Essential context next to the relevant value |
| Navigation, wallet controls and action buttons | Omit |
| Charts and hover values | Use the activity table as the record |

Use dark text, light paper backgrounds and visible row dividers so the record remains legible in grayscale with background graphics disabled. Preserve selectable text and semantic headings and table headers in the PDF export.

## Example

**Vault activity summary**  
USDC Vault · Stellar Mainnet · full vault contract ID and public account address  
1–31 Oct 2026 · UTC · All activity types and statuses · Newest first  
Generated 1 Nov 2026, 09:00 UTC · 42 events

| Date and time (UTC) | Activity | Amount | Status |
| --- | --- | --- | --- |
| 31 Oct 2026, 16:42 | Withdrawal | −25.00 USDC | Confirmed on ledger |
| 31 Oct 2026, 10:07 | Deposit | +100.00 USDC | Awaiting ledger confirmation |

Page 2 repeats the scope and column headings above the next complete row.
