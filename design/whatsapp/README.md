# NeuroWealth WhatsApp UI Mockups

This directory contains reference designs for the NeuroWealth WhatsApp conversation interface.

## Files

| File | Description |
|------|-------------|
| `mockup.html` | Interactive HTML mockup rendering all conversation flows in WhatsApp visual style |
| `conversations/onboarding.md` | Onboarding flow message script |
| `conversations/deposit.md` | Deposit flow message script |
| `conversations/balance.md` | Balance check flow message script |
| `conversations/withdrawal.md` | Withdrawal flow message script |
| `conversations/error-states.md` | Error state message scripts |

## Conversation Flows Covered

1. **Onboarding** — Welcome, phone verification (OTP), wallet creation
2. **Deposit** — Deposit confirmation with strategy and APY
3. **Balance Check** — Portfolio card with balance, earnings, APY, strategy
4. **Withdrawal** — Withdrawal confirmation and completion
5. **Error States** — Insufficient balance, vault paused

## Design Principles

- Plain text + Unicode emoji for visual structure (no HTML in actual WhatsApp messages)
- Bot avatar: NeuroWealth neural-net themed icon (green gradient)
- Message bubbles: user messages right-aligned (green), bot messages left-aligned (dark grey)
- Timestamps and delivery checkmarks (grey = sent, blue = read)
- Line breaks and emoji used strategically for readability

## Usage

Open `mockup.html` in a browser to view all flows. Screenshot each section to produce the PNG assets for marketing and user documentation.
