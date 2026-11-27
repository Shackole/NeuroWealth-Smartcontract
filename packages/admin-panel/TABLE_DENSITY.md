# Admin table density

The action-review table offers **Comfortable** (default, 12 px vertical cell padding per side) and **Compact** (6 px per side) at all viewport widths. The selection applies to the active review and resets when the review unmounts. Switching density changes only vertical padding. Column widths, text size, alignment, values and row order stay consistent.

Use a visible **Table density** legend with native radio controls. Tab enters the selected control, arrow keys move selection, and focus stays in the group as the table updates. Keep the radio labels at least 44 px high in either mode and allow the controls to wrap.

## Narrow-screen example

At a 320 px viewport, show the density controls above the table. The three columns share the available width, and long values wrap in place. In both modes the first line of each cell aligns at the top of the row. A longer value increases the entire row's height.

| Setting | Current value | Proposed value |
| --- | --- | --- |
| Pool cap | 5000 USDC | 7500 USDC |
| Agent account | A long public account address wraps inside this column | Another address wraps inside this column |

Keep the column headers and row-header associations available to assistive technology. At narrow widths, preserve full values so the reviewer can read the change before signing.
