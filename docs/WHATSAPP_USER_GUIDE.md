# NeuroWealth WhatsApp Bot — User Guide

NeuroWealth is fully operable through WhatsApp. No wallet app, browser extension, or
crypto knowledge required — just send a message and the AI agent handles the rest.

---

## Table of Contents

1. [Getting Started (Onboarding)](#getting-started-onboarding)
2. [Supported Commands](#supported-commands)
3. [Example Conversations](#example-conversations)
   - [Deposit](#deposit)
   - [Check Balance](#check-balance)
   - [Check Earnings](#check-earnings)
   - [Withdraw](#withdraw)
   - [Withdraw Everything](#withdraw-everything)
   - [Change Strategy](#change-strategy)
   - [Check Current APY](#check-current-apy)
4. [Error Messages](#error-messages)
5. [FAQ](#faq)

---

## Getting Started (Onboarding)

Follow these steps the first time you use NeuroWealth on WhatsApp.

**Step 1 — Say hello**

Send any message to the NeuroWealth WhatsApp number (e.g., `hi`, `hello`, `start`).

```
You:   hi
Bot:   👋 Welcome to NeuroWealth — your AI-powered USDC yield account!

       I can help you:
       • Deposit USDC and start earning yield automatically
       • Check your balance and earnings anytime
       • Withdraw instantly — no lock-ups

       To get started, I'll need to verify your identity.
       What's your phone number? (include country code, e.g. +1 415 555 0100)
```

**Step 2 — Phone number verification (OTP)**

```
You:   +1 415 555 0100
Bot:   📱 I've sent a 6-digit code to +1 415 555 0100.
       Please enter it here to verify your identity.

You:   847291
Bot:   ✅ Verified! Welcome to NeuroWealth.

       I've set up a secure Stellar wallet for you.
       Your funds are protected by a smart contract — only you can withdraw them.

       Which investment strategy would you like to start with?

       🛡️  Conservative  — stablecoin lending, ~3–6% APY, lowest risk
       ⚖️  Balanced      — lending + DEX liquidity, ~6–10% APY, medium risk
       🚀  Growth        — multi-protocol deployment, ~10–15% APY, higher risk

       Reply with: conservative, balanced, or growth
```

**Step 3 — Choose a strategy**

```
You:   balanced
Bot:   ✅ Balanced strategy selected.

       The AI agent will automatically allocate your funds for the best yield
       within your chosen risk profile. You can change this anytime.

       Ready to make your first deposit? Reply:
       deposit <amount> USDC
       e.g. "deposit 100 USDC"
```

**Step 4 — First deposit**

```
You:   deposit 100 USDC
Bot:   💸 Sending deposit request...

       To deposit, send 100 USDC to your NeuroWealth wallet:
       📋 GDQP...XKZM  (tap to copy)

       I'll notify you the moment it arrives and starts earning. ✅
```

> **Note:** For WhatsApp-onboarded users, NeuroWealth manages a **custodial** Stellar
> keypair on your behalf. Your wallet address is unique to you, but the secret key is
> held by NeuroWealth's backend until non-custodial key export is supported.
> See the [FAQ](#faq) for more on custody and security.

---

## Supported Commands

The bot understands natural language — you do not need to use exact phrases. These
examples show the intent and the types of variations that work.

| Intent | Example Messages |
|--------|-----------------|
| `deposit` | `deposit 50 USDC`, `put in 200`, `add 100 to my account` |
| `withdraw` | `withdraw 50 USDC`, `take out 75`, `I need 100 back` |
| `withdraw_all` | `withdraw everything`, `withdraw all`, `pull out all my money` |
| `balance` | `what's my balance?`, `how much do I have?`, `check my account` |
| `earnings` | `how much have I earned?`, `what are my earnings?`, `show my yield` |
| `set_strategy` | `switch to conservative`, `change strategy to growth`, `set balanced` |
| `get_apy` | `what's my APY?`, `what rate am I earning?`, `current yield` |

---

## Example Conversations

### Deposit

```
You:   deposit 100 USDC
Bot:   💰 Got it! Depositing 100 USDC into your Balanced strategy.
       This will take about 5 seconds on Stellar...

       ✅ Done! 100 USDC deposited.
       You're now earning ~8.4% APY.
       The AI will optimize your allocation automatically.
```

### Check Balance

```
You:   what's my balance?
Bot:   💰 Your NeuroWealth Portfolio

       Balance:       102.47 USDC
       Earnings:      +$2.47 since deposit
       Current APY:   8.4%
       Strategy:      Balanced
       Protocol:      Blend (lending pool)

       Reply "withdraw <amount>" to take funds out anytime.
```

### Check Earnings

```
You:   how much have I earned?
Bot:   📈 Your Earnings Summary

       Total deposited:   100.00 USDC
       Current balance:   102.47 USDC
       Total earned:      +$2.47 USDC

       Daily average:     ~$0.023
       Projected monthly: ~$0.70 (at current APY of 8.4%)

       Earnings grow automatically — no action needed.
```

### Withdraw

```
You:   withdraw 50 USDC
Bot:   💸 Withdrawing 50 USDC from your account...

       ✅ Done! 50 USDC sent to your wallet in 4 seconds.

       Remaining balance: 52.47 USDC
       Still earning 8.4% APY on your remaining balance.
```

### Withdraw Everything

```
You:   withdraw everything
Bot:   💸 Withdrawing your full balance of 52.47 USDC...

       ✅ Done! 52.47 USDC sent to your wallet in 4 seconds.

       Your account is now empty. Come back anytime to deposit again!
       Reply "deposit <amount> USDC" whenever you're ready.
```

### Change Strategy

```
You:   switch to conservative
Bot:   ⚖️  Switching from Balanced to Conservative strategy...

       ✅ Done! Your strategy preference is now set to Conservative.

       The AI agent will move your funds to lower-risk lending positions
       at the next rebalance (within the hour).

       Expected APY range: 3–6%
       Current balance: 52.47 USDC

       Reply "get apy" to see the latest rate once rebalanced.
```

> **Note on strategy:** Your strategy preference is stored on-chain and tells the AI
> agent how to allocate your share of the pooled vault funds. The vault pools all users'
> funds into a single active protocol — your strategy preference guides the agent's
> decision but cannot guarantee isolation of your funds from other users' positions.
> See the FAQ for details.

### Check Current APY

```
You:   what's my APY?
Bot:   📊 Current Rates

       Your strategy:    Balanced
       Active protocol:  Blend (lending)
       Current APY:      8.4%

       Rates update hourly as the AI monitors all available protocols.
       I'll automatically move to a better opportunity if one appears.
```

---

## Error Messages

The bot will reply with one of these messages if something goes wrong.

| Error | Bot Message | What To Do |
|-------|-------------|------------|
| Insufficient balance | `❌ You only have X USDC — you can withdraw up to X.` | Withdraw a smaller amount |
| Vault paused | `⚠️ The vault is temporarily paused for maintenance. Your funds are safe — please try again in a few minutes.` | Wait and retry; contact support if it persists |
| Below minimum deposit | `❌ Minimum deposit is 1 USDC. Please deposit at least 1 USDC.` | Increase the deposit amount |
| Deposit cap reached | `❌ You've reached the maximum deposit limit for this account. Contact support if you'd like to increase your limit.` | Contact `support@neurowealth.io` |
| Vault TVL cap reached | `⚠️ The vault is temporarily full. New deposits are paused until capacity opens. Your existing balance is unaffected.` | Try again later |
| Holding period active | `⏳ Your deposit was very recent. Please wait a few minutes before withdrawing (anti-flash-loan protection).` | Wait and retry after the holding period (~5 seconds to 20 minutes depending on configuration) |
| Unverified phone | `🔒 I don't recognise this number. Reply "hi" to start verification.` | Complete OTP verification |
| Network error | `⚠️ Stellar network error. Please try again in a moment.` | Retry; contact support if it persists |

---

## FAQ

### Is my money safe?

Your USDC is held in an **audited Soroban smart contract** on the Stellar blockchain —
not in a bank account or on an exchange. The contract enforces that only you can
withdraw your own funds, even the contract owner cannot take your USDC directly.

For WhatsApp users, NeuroWealth holds a **custodial Stellar keypair** on your behalf
(since WhatsApp users do not have their own Stellar wallet). This means you trust
NeuroWealth to safeguard that key. We store keys in encrypted, access-controlled
infrastructure. A future update will support key export for users who want full
self-custody.

### How does the AI choose strategies?

The AI agent monitors yield rates across all integrated protocols (currently Blend
lending and Stellar DEX liquidity pools) every hour. When it finds a better
opportunity (> 0.5% APY improvement), it moves funds automatically.

Your **strategy preference** (conservative / balanced / growth) tells the agent
your risk tolerance. This is stored on-chain and influences the agent's allocation
decisions — but does not guarantee that your specific USDC is in a different
position from other users, because the vault **pools all user funds** into a single
active protocol at any given time.

### Can I lose money?

Yes — DeFi involves real risk. You could lose some or all of your deposited USDC in
the following scenarios:

- **Protocol exploit:** A bug or hack in Blend Protocol or the Stellar DEX could
  cause loss of deployed funds. NeuroWealth monitors protocols and can exit to idle
  USDC (no protocol deployed) in response to threats.
- **Blend bad debt:** If Blend borrowers default and liquidations are insufficient,
  Blend socializes the loss across all suppliers. Your balance would decrease pro-rata
  alongside all other depositors.
- **Smart contract bug:** Despite auditing and testing, undiscovered bugs in the
  NeuroWealth vault contract could cause loss of funds.
- **Custodial key risk (WhatsApp users):** If NeuroWealth's key storage is compromised,
  WhatsApp-custodial funds could be at risk.

The vault does **not** apply leverage or borrowing against your deposit. You cannot
lose more than you deposited.

### What is the minimum deposit?

1 USDC (1,000,000 stroops).

### How quickly can I withdraw?

Withdrawals settle in 3–5 seconds on Stellar. There is no lock-up or notice period.
The only delay is the **holding period** (typically a few seconds to 20 minutes,
configurable by the vault owner) which protects against flash-loan attacks. This
applies immediately after depositing.

If the vault's active lending protocol has very high utilisation (near 100%), you may
receive a **partial withdrawal** — you get back all available idle USDC immediately,
and retain shares for the still-deployed portion until liquidity is available.

### Are there any fees?

- **Deposit / Withdrawal fees:** None charged by NeuroWealth.
- **Stellar transaction fees:** Fractions of a penny per transaction (paid from your
  wallet on self-custody flows, or covered by NeuroWealth for WhatsApp-custodial users).
- **Yield management:** NeuroWealth does not currently take a protocol fee from yield.
  This may change before mainnet launch — any fee will be disclosed in advance.

### What does "strategy" mean exactly?

Your strategy preference (`conservative`, `balanced`, or `growth`) is stored on-chain
and visible to the AI agent. It guides how the agent allocates the vault's pooled funds:

- **Conservative** → prioritise Blend stablecoin lending (lower APY, lower risk).
- **Balanced** → mix of lending and DEX liquidity (medium APY, medium risk).
- **Growth** → multi-protocol deployment, including higher-yield DEX positions.

Because the vault pools all user funds into **one active protocol** at a time, your
individual strategy preference influences the agent's decision but does not isolate
your funds from other users' positions.

### Can I use NeuroWealth from a regular Stellar wallet instead of WhatsApp?

Yes. The vault contract is accessible via the web frontend at app.neurowealth.io and
directly via Stellar CLI. WhatsApp is an additional interface, not a requirement.

### How do I get support?

- **WhatsApp:** Send `help` or `support` to the bot.
- **Email:** `support@neurowealth.io`
- **GitHub Issues (non-security):** https://github.com/Shackole/NeuroWealth-Smartcontract/issues

For security vulnerabilities, see [`docs/BUG_BOUNTY.md`](BUG_BOUNTY.md).

---

*Document location: `docs/WHATSAPP_USER_GUIDE.md`*  
*See also: [README.md WhatsApp Integration section](../README.md#whatsapp-integration)*
