# Error States — Message Scripts

## Insufficient Balance

**User:** withdraw 500 USDC

**Bot:**
```
⚠️ *Insufficient balance*

You requested 500.00 USDC but your balance is only *23.81 USDC*.

Try: _withdraw 23 USDC_ or _withdraw everything_
```

## Vault Paused

**User:** deposit 50 USDC

**Bot:**
```
🔴 *Vault is paused*

Deposits are temporarily suspended for a security review. Withdrawals are still available.

_We'll notify you when the vault resumes. Your funds are safe._
```

## Unknown Command

**User:** buy bitcoin

**Bot:**
```
🤷 I didn't understand that.

Here's what I can do:
• deposit [amount] USDC
• withdraw [amount] USDC
• balance
• switch to conservative / balanced / growth

Send *help* for full commands.
```
