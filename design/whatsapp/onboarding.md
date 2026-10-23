# WhatsApp custodial onboarding

This flow describes the implemented WhatsApp path in `whatsapp/src/webhook.ts`.
It deliberately separates phone verification from custodial consent and wallet
creation.

1. The user sends `hi`, `hello`, or `start` and receives a six digit OTP.
2. A valid OTP moves the session into `AWAITING_CUSTODIAL_CONSENT`. No wallet is
   created at this point.
3. The bot explains that NeuroWealth holds the encrypted signing key, signs
   transactions after chat requests, and may be unable to restore access if the
   key or verified phone access is lost. The message warns users not to send
   secrets, identifies supported commands, and gives the network-aware funding
   sequence.
4. `AGREE` or `YES` creates the wallet and shows its complete Stellar address.
   The user must fund that address with USDC on Stellar and verify the asset and
   network before transferring.
5. `HELP` repeats the consent and usage summary. `DECLINE` returns to the
   unverified state without creating a wallet.

Supported post-setup intents are help, balance, earnings, deposit, withdrawal,
and strategy changes as defined by `whatsapp/src/intentParser.ts`. This guide
does not promise chat commands that are absent from that parser.

## Manual review evidence

- Trace `AWAITING_OTP` success in `webhook.ts`: it updates only to
  `AWAITING_CUSTODIAL_CONSENT` and sends the consent message; there is no wallet
  creation call on this path.
- Trace the `AGREE` branch: it calls `createCustodialWallet`, then transitions
  to `VERIFIED` and returns the wallet address and funding/network guidance.
- Trace `HELP` and `DECLINE`: help replays the details; decline resets the
  session and never calls wallet creation.
- The existing conversation flow test harness can exercise this with a mocked
  Express request/response and an OTP returned by the configured OTP service.
  Tests were not run for this change.
