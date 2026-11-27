# Field-Level Help: Token Amount to Vault Shares Conversion

**Related Issue:** #686  
**Context:** `design/dashboard`  
**Target Users:** First-time depositors and DeFi newcomers interacting with the NeuroWealth vault.

---

## 1. Problem Statement & User Mental Model

First-time users frequently confuse **Underlying Tokens (USDC)** with **Vault Shares (NV-SHARES)**:
- Users depositing `100 USDC` into a mature vault may see an estimated return of `95.9692898 Shares`.
- **Primary cognitive pitfall:** Users intuitively assume a 1:1 balance and fear they are immediately losing ~4% of their money upon depositing.
- **Goal:** Provide contextual, field-level micro-copy, visual disclosures, and an interactive sample conversion validator that build trust and make the mathematical relationship transparent prior to signing.

---

## 2. Core Concepts & Math Formulation

### The Accounting Equation
Vault shares represent a proportional claim on the total pooled assets (USDC) in the vault:

$$\text{Assets (USDC)} = \frac{\text{Shares} \times \text{Exchange Rate}}{10^7}$$

$$\text{Shares} = \frac{\text{Assets (USDC)} \times 10^7}{\text{Exchange Rate}}$$

Where:
- **Exchange Rate**: Maintained by the Soroban smart contract via `get_exchange_rate()`, returned in 7-decimal Stroop precision ($10,000,000 = 1.0000000\text{ USDC/share}$).
- **Yield Accrual**: Over time, as lending interest and liquidity fees accumulate from protocols (e.g., Blend, DEX pools), `total_assets` increases while `total_shares` remains constant. Consequently, the exchange rate rises ($> 1.0000000$), meaning **each share becomes worth more USDC**.

---

## 3. Contextual Help Component Specifications

### 3.1 Field-Level Inline Contextual Trigger
Located directly adjacent to the **Estimated Shares** field and the **Deposit Amount Input**:
- **Visual Design:** An info badge `(?)` or `Why are shares different from USDC?` hyperlink with subtle hover/active highlight.
- **Accessibility:** 
  - `role="button"` with `aria-haspopup="dialog"` and `aria-expanded="false|true"`.
  - Accessible label: `aria-label="Learn how USDC converts to vault shares"`.
  - Full keyboard trigger support: Focused via `Tab`, toggled via `Enter` or `Space`, dismissed via `Escape`.
  - Touch target: Minimum `44x44px` bounding hit area for mobile tapability.

### 3.2 Contextual Popover / Modal Structure
When activated, the help overlay presents three structured tiers:
1. **Plain-English Summary:**
   > *"Think of vault shares like ownership slices in a mutual fund or company. When you deposit USDC, the vault issues you shares. As the vault earns yield, each share becomes worth more USDC over time."*
2. **Interactive Sample Conversion Calculator:**
   - Lets the user slide or enter a sample amount (e.g., `100 USDC`) to see the instant live preview.
   - Shows:
     - **Deposit:** `100.0000000 USDC`
     - **Vault Exchange Rate:** `1.0420000 USDC per share` (Current rate)
     - **Shares Received:** `95.9692898 NV-SHARES`
     - **Total Value Received:** `100.00 USDC` (Zero value lost!)
3. **Yield Growth Example (Future Value):**
   - Shows what happens when withdrawing after yield is earned:
     - If the exchange rate grows to `1.0850000 USDC per share`:
     - `95.9692898 Shares × 1.0850000 = 104.13 USDC`
     - **Net Profit:** `+4.13 USDC (+4.13% return)`

---

## 4. Worked Sample Conversion & Step-by-Step Validation

### Sample Scenario for Interactive Validation

| Stage | Action / State | Asset (USDC) | Share Price | Vault Shares | Total Position Value |
|---|---|---|---|---|---|
| **Step 1: Deposit** | User enters `100 USDC` | `100.0000000 USDC` | `1.0420000` | `95.9692898` | **`$100.00`** |
| **Step 2: Holding** | Vault earns yield | `+4.1266794 USDC` earned | `1.0850000` (up from `1.042`) | `95.9692898` (unchanged) | **`$104.13`** |
| **Step 3: Withdrawal** | User redeems `95.9692898 shares` | `104.1266794 USDC` | `1.0850000` | `0` shares | **`$104.13`** received |

### Validation Check Questions for Users
The prototype includes a 3-question self-validation check to confirm user understanding:
1. **"Did my deposit lose money because I received 95.96 shares instead of 100?"**
   - *Correct Answer:* No. Each share is worth $1.042 USDC, so 95.96 shares equal exactly $100.00 USDC.
2. **"What happens to my share count when the vault earns yield?"**
   - *Correct Answer:* Share count stays the same; the value of each individual share increases.
3. **"How do I determine how much USDC I will get when withdrawing?"**
   - *Correct Answer:* Multiply your share balance by the current exchange rate.

---

## 5. Responsive Layout Specifications

- **Desktop (1440px):** Contextual popover appears as a floating card docked to the right of the amount input, with a fixed width of `380px`, shadow, and subtle pointer arrow.
- **Tablet (768px):** Centered popover dialog with backdrop blur (`rgba(0,0,0,0.5)`).
- **Mobile (375px):** Slides in as a bottom sheet (`BottomSheet`), full width, max-height `85vh`, with swipe-to-dismiss gesture and prominent close button.

---

## 6. Implementation Reference

The interactive component prototype is implemented at:
- [`frontend/src/components/ConversionHelpTooltip.tsx`](../../frontend/src/components/ConversionHelpTooltip.tsx)
- Integrated in [`frontend/src/components/DepositForm.tsx`](../../frontend/src/components/DepositForm.tsx) and [`frontend/src/components/ShareRateCard.tsx`](../../frontend/src/components/ShareRateCard.tsx)
