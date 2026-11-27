# Account Address Copy Feedback & Full Address Access Specification

**Related Issue:** #685  
**Context:** `design/dashboard`  
**Target Users:** All depositors, traders, and vault operators interacting with Stellar public keys.

---

## 1. Problem & User Confidence Goals

In blockchain systems like Stellar, public keys are 56-character alphanumeric strings (e.g., `GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYORZB2O4MWZDURN52C`). Because screens have limited real estate, addresses are typically truncated to 8–10 characters (e.g., `GBRP...N52C`).

**Key User Pain Points & Risks:**
1. **Uncertainty of complete copy:** Users fear they only copied the truncated preview string instead of the full 56-character key.
2. **Silent copy failure:** When browser permissions or focus states block `navigator.clipboard.writeText`, users assume the address was copied and may paste outdated or malicious clipboard contents.
3. **Lack of visual verification:** Users cannot easily double-check the middle segments of the key without opening external tools.

**Design Goals:**
- Guarantee instant, unambiguous confirmation across mouse, keyboard, and touch devices.
- Provide accessible full address inspection prior to or following a copy action.
- Ensure graceful degradation with manual selection fallbacks on permission or API failure.

---

## 2. Full Address Access Architecture

To give users 100% confidence they are interacting with the genuine, complete address:

### 2.1 Truncated Display with Dual Verification
- Default display format: `GBRP...N52C` with high-contrast first-4 and last-4 characters.
- Visual inspection affordance:
  - **Inline Expansion Button:** A dedicated "Inspect" or "Expand" toggle expanding the container to render the full 56-character string in monospace format with `select-all` styling.
  - **Hover Tooltip / Focus Popover:** On pointer hover or keyboard focus, a tooltip shows the full 56-character address in formatted 4-character chunks:
    `GBRP YHIL 2CI3 FNQ4 BXLF MNDL FJUN PU2H Y3ZM FXYO RZB2 O4MW ZDUR N52C`
  - **Identicon / Visual Fingerprint:** A deterministic gradient avatar visually confirms account continuity without relying solely on alphanumeric memorization.

---

## 3. Interaction Modalities & Feedback Matrix

| State / Trigger | Mouse Interaction | Keyboard Interaction | Mobile / Touch Interaction |
|---|---|---|---|
| **Default** | Subtle copy icon beside address; cursor pointer on hover; tooltip: `"Copy full address (56 characters)"`. | Button in natural tab order (`tabIndex={0}`); clear visible focus ring (`focus-visible:ring-2 focus-visible:ring-emerald-500`). | Minimum `48x48px` hit area; copy icon and tap hint; touch callout enabled. |
| **Active / Pressed** | Button background transitions to `bg-slate-800`; subtle active scale (`scale-95`). | Triggered by `Enter` or `Space`; button activates visually. | Instant tactile press feedback (`active:scale-[0.96]`); haptic vibration pulse (`40ms` via `navigator.vibrate` where supported). |
| **Success State** | • Icon transitions to animated `Checkmark` (emerald).<br>• Tooltip updates: `"Copied GBRP...N52C to clipboard!"`.<br>• Subtle green glow border (`border-emerald-500/50`).<br>• Reverts to default after `2.5s`. | • Screen reader announcement via `aria-live="polite"`: `"Stellar address GBRP...N52C copied to clipboard."`<br>• Visual checkmark and focus preserved.<br>• Reverts after `2.5s`. | • Transient confirmation bottom pill/toast: `"Address copied to clipboard"` with checkmark.<br>• Auto-dismisses after `2.5s`.<br>• Copy icon transforms into green checkmark. |
| **Failure State (Permission Denied / Insecure Context)** | • Tooltip updates: `"Unable to access clipboard. Click to select full text"`.<br>• Button border turns amber (`border-amber-500/50`).<br>• Address expands and auto-selects for manual copy (`Ctrl+C`). | • Screen reader announcement: `"Clipboard copy failed. Full address is selected below for manual copy."`<br>• Focus automatically directed to the select-all address input. | • Banner notification: `"Auto-copy unavailable. Long-press the address below to copy."`<br>• Address container highlights with native text-selection handles enabled. |

---

## 4. Accessibility & Assistive Technology (WCAG 2.1 AA)

- **Semantic HTML & Roles:**
  - Copy trigger must use `<button type="button">`, never a clickable `<div>` or `<span>`.
  - Accessible name: `aria-label="Copy full Stellar address for Primary Account (GBRP...N52C)"`.
- **Live Announcements:**
  - An off-screen element with `role="status"` and `aria-live="polite"` announces dynamic state changes without interrupting current speech flow.
- **Color Contrast:**
  - The success checkmark and emerald borders maintain at least `4.5:1` contrast ratio against dark backgrounds (`#080b11`, `#0f172a`).
- **Focus Management:**
  - Triggering copy must never displace keyboard focus away from the button. If fallback text selection is required, focus shifts deliberately to the selectable text container with clear instructions.

---

## 5. Technical Implementation & Clipboard Resilience

### 5.1 Robust Copy Fallback Chain
```typescript
async function copyAddressSafely(address: string): Promise<boolean> {
  // Strategy 1: Asynchronous Clipboard API (Preferred modern standard)
  if (navigator?.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(address);
      return true;
    } catch (err) {
      console.warn('Clipboard API rejected:', err);
    }
  }

  // Strategy 2: Legacy execCommand fallback (for non-secure or restricted iframe contexts)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = address;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (err) {
    console.warn('execCommand failed:', err);
  }

  // Strategy 3: Report failure to UI to trigger manual select-all fallback
  return false;
}
```

---

## 6. Implementation Reference

- Prototype Component: [`frontend/src/components/AddressCopyButton.tsx`](../../frontend/src/components/AddressCopyButton.tsx)
- Integrated into: [`frontend/src/components/WalletConnect.tsx`](../../frontend/src/components/WalletConnect.tsx), [`frontend/src/components/TransactionIdentity.tsx`](../../frontend/src/components/TransactionIdentity.tsx)
