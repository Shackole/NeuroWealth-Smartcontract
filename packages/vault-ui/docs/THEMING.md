# Vault UI theming

Load the Vault UI stylesheet and set CSS custom properties on a host ancestor. The
properties inherit into the deposit and withdrawal form, earnings history, and
notification settings. Each property accepts a CSS color. Omitted properties
use the defaults below. Set variables on `:root` to theme all instances.

| Variable | Default |
| --- | --- |
| `--vault-canvas` | `#f9fafb` |
| `--vault-surface` | `#ffffff` |
| `--vault-text` | `#111827` |
| `--vault-muted` | `#374151` |
| `--vault-subtle` | `#4b5563` |
| `--vault-border` | `#e5e7eb` |
| `--vault-control-border` | `#d1d5db` |
| `--vault-accent` | `#1d4ed8` |
| `--vault-accent-hover` | `#1e40af` |
| `--vault-accent-soft` | `#dbeafe` |
| `--vault-on-accent` | `#ffffff` |
| `--vault-success` | `#166534` |
| `--vault-success-text` | `#14532d` |
| `--vault-success-surface` | `#f0fdf4` |
| `--vault-success-border` | `#bbf7d0` |
| `--vault-warning` | `#713f12` |
| `--vault-warning-surface` | `#fefce8` |
| `--vault-warning-border` | `#fef08a` |
| `--vault-danger` | `#991b1b` |
| `--vault-danger-surface` | `#fef2f2` |
| `--vault-danger-border` | `#fecaca` |

The canvas is the app background. Surface colors are for cards and inactive
controls. Accent colors cover primary controls, focus indicators, and the
portfolio value chart. The success color also styles the daily earnings chart.
Choose foreground and background colors with sufficient contrast in each state.

## Default and host-themed instances

Render either wrapper as an independent example.

```tsx
// Default colors
<DepositWithdrawModal />

// Overrides inherited by the form
<div className="host-vault-theme">
  <DepositWithdrawModal />
</div>
```

```css
.host-vault-theme {
  --vault-surface: #faf5ff;
  --vault-text: #2e1065;
  --vault-accent: #6b21a8;
  --vault-accent-hover: #581c87;
  --vault-accent-soft: #f3e8ff;
  --vault-on-accent: #ffffff;
}
```
