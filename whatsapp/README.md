# NeuroWealth WhatsApp Bot Handler

WhatsApp integration layer enabling non-custodial and custodial chat-based interaction with the NeuroWealth Soroban Vault on Stellar.

## Features & Architecture
- **Twilio Webhook Handler**: Receives and responds to incoming WhatsApp messages via `POST /api/whatsapp/webhook`.
- **OTP and consent flow**: Enforces 6-digit OTP verification with a 5-minute expiry, then requires explicit custodial-wallet consent before creating a wallet.
- **Custodial Keypair Generation**: Creates encrypted Stellar keypairs for verified chat users using AES-256-GCM. Secret keys are encrypted at rest and never exposed in chat responses.
- **Natural Language Intent Parsing**: Parses user intents (`deposit`, `withdraw`, `balance`, `earnings`, `switch strategy`, `apy`).
- **Security Protections**:
  - PII (Phone Numbers) hashed with SHA-256 at rest.
  - Per-phone rate limiting (max 10 messages/min).
  - 15-minute session timeout for inactive conversations.

## Verification Flow
1. User sends `"hi"` to WhatsApp number.
2. Bot sends 6-digit OTP code (expires in 5 minutes).
3. User enters OTP code -> Phone verified!
4. A Stellar custodial wallet is generated only after explicit consent; the user can then check balance, deposit, or withdraw by chat.
