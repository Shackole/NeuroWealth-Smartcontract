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
  - Provider signature verification (Twilio `X-Twilio-Signature`) is enforced before any intent parsing or side effects; invalid signatures are rejected with `403`.
  - Inbound message IDs (`MessageSid`) are deduplicated so duplicate deliveries execute once logically.

## Webhook Authenticity & Replay Handling

### Signature verification
Every inbound request is authenticated against the provider signature before any work begins. The signature is computed over the **canonical public URL** of the webhook plus the sorted POST parameters. If verification fails, the request is rejected immediately and no intent is processed.

### Canonical URL behind proxies
When the service runs behind a reverse proxy / load balancer (e.g. nginx, an ingress controller, or a cloud LB), the request URL seen by the app is the internal one (`http://host:port/...`), not the public URL the provider signed. The handler therefore reconstructs the canonical URL from proxy-aware headers:

- `X-Forwarded-Proto` — the public scheme (`https`).
- `X-Forwarded-Host` — the public host (e.g. `api.neurowealth.example`).
- `X-Forwarded-Port` — optional public port when non-default.

If these headers are absent, the handler falls back to the direct request scheme/host.

**Proxy configuration requirements:**
1. The proxy MUST forward `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-Port` to the app.
2. The proxy MUST overwrite (not append to) these headers from untrusted clients so a caller cannot spoof the canonical URL. Only trust these headers when the app is reachable exclusively through the trusted proxy.
3. The public URL configured in the Twilio console MUST match the canonical URL the app reconstructs, otherwise signature verification will fail.

Example nginx snippet:

```nginx
location /api/whatsapp/webhook {
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header X-Forwarded-Port  $server_port;
    proxy_pass http://whatsapp:3000;
}
```

### Replay / duplicate delivery handling
Providers may retry deliveries. Each inbound message carries a unique `MessageSid`. The handler records processed IDs and short-circuits duplicates so a retried delivery is acknowledged (`200`) without re-executing the intent (no double deposit/withdraw).

## Verification Flow
1. User sends `"hi"` to WhatsApp number.
2. Bot sends 6-digit OTP code (expires in 5 minutes).
3. User enters OTP code -> Phone verified!
4. A Stellar custodial wallet is generated only after explicit consent; the user can then check balance, deposit, or withdraw by chat.

---

## Local Sandbox Setup & Testing Guide

This guide enables contributors to reproduce and test the WhatsApp bot locally using the Twilio WhatsApp Sandbox or local synthetic webhook requests.

### 1. Webhook & Environment Setup

#### Prerequisites
- Node.js 20+
- Redis (required for session state management and intent queue)

#### Environment Configuration
Create or update `whatsapp/.env` (using `.env.template` or the following variables):

```bash
# Service Configuration
PORT=3000
NODE_ENV=development

# Redis for queue and session store
REDIS_URL=redis://localhost:6379

# Encryption key for custodial wallet seeds (32-byte hex string)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Twilio Credentials (from Twilio Console)
TWILIO_ACCOUNT_SID=AC_MOCK_ACCOUNT_SID_FOR_LOCAL_DEV
TWILIO_AUTH_TOKEN=mock_auth_token_32_characters_long
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Optional Soroban Vault Network Settings
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VAULT_CONTRACT_ID=C_MOCK_VAULT_CONTRACT_ID
```

#### Starting Local Dependencies & Server
1. **Start Redis**:
   ```bash
   docker run -d --name neurowealth-redis -p 6379:6379 redis:alpine
   ```
2. **Install and run the bot handler**:
   ```bash
   cd whatsapp
   npm install
   npm run dev
   ```
   The service listens on `http://localhost:3000`.

#### Connecting with Twilio WhatsApp Sandbox
1. **Expose localhost with a tunnel** (e.g. ngrok or cloudflared):
   ```bash
   ngrok http 3000
   ```
   Note your forwarding URL (e.g., `https://your-tunnel-subdomain.ngrok-free.app`).
2. **Configure Twilio Sandbox Settings**:
   - Navigate to the **Twilio Console** $\rightarrow$ **Messaging** $\rightarrow$ **Try it out** $\rightarrow$ **Send a WhatsApp message**.
   - Under **Sandbox Settings**, set **WHEN A MESSAGE COMES IN** to:
     `https://your-tunnel-subdomain.ngrok-free.app/api/whatsapp/webhook`
   - Set HTTP method to **HTTP POST** and save.
3. **Join the sandbox**: Send the sandbox join code (e.g. `join <sandbox-keyword>`) from your WhatsApp client to the Twilio sandbox number (`+1 415 523 8886`).

---

### 2. Synthetic Conversation Steps

For automated testing or local verification without Twilio connectivity, contributors can send synthetic `POST /api/whatsapp/webhook` requests using `curl`.

> **Note on Signature Verification**: In testing environments with mock auth tokens, ensure `X-Twilio-Signature` is either generated using the Twilio client helper or tested via the mock test harness in `src/conversationFlow.test.ts`.

#### Step 1: Initial Greeting / Onboarding Trigger
```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp%3A%2B14155550100" \
  -d "To=whatsapp%3A%2B14155238886" \
  -d "Body=hi" \
  -d "MessageSid=SM_TEST_MESSAGE_ID_001"
```

#### Step 2: Submit OTP Verification Code
```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp%3A%2B14155550100" \
  -d "To=whatsapp%3A%2B14155238886" \
  -d "Body=123456" \
  -d "MessageSid=SM_TEST_MESSAGE_ID_002"
```

#### Step 3: Consent to Custodial Terms
```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp%3A%2B14155550100" \
  -d "To=whatsapp%3A%2B14155238886" \
  -d "Body=AGREE" \
  -d "MessageSid=SM_TEST_MESSAGE_ID_003"
```

#### Step 4: Check Balance Intent
```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp%3A%2B14155550100" \
  -d "To=whatsapp%3A%2B14155238886" \
  -d "Body=what%27s+my+balance%3F" \
  -d "MessageSid=SM_TEST_MESSAGE_ID_004"
```

#### Step 5: Deposit Request Intent
```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp%3A%2B14155550100" \
  -d "To=whatsapp%3A%2B14155238886" \
  -d "Body=deposit+100+USDC" \
  -d "MessageSid=SM_TEST_MESSAGE_ID_005"
```

---

### 3. Expected Transcript with Placeholder Values

Contributors should expect the following dialogue progression during end-to-end sandbox walkthroughs:

```text
[User]:  hi
[Bot]:   👋 Welcome to NeuroWealth — your autonomous AI yield vault on Stellar!
         Before we begin, we need to verify your phone number.
         I've sent a 6-digit verification code to <PHONE_NUMBER_PLACEHOLDER>.
         Please reply with the code within 5 minutes.

[User]:  <OTP_CODE_PLACEHOLDER> (e.g. 123456)
[Bot]:   ✅ Phone verified successfully!

         ⚠️ Important Custodial Wallet Notice:
         NeuroWealth creates and manages a custodial Stellar keypair for this chat.
         Your private seed is encrypted at rest and never shared in chat.
         Transfers are authorized directly by your messages.

         Reply AGREE to create your wallet, DECLINE to cancel, or HELP for details.

[User]:  AGREE
[Bot]:   🎉 Your NeuroWealth wallet has been generated!
         Stellar Address: <STELLAR_PUBLIC_KEY_PLACEHOLDER> (e.g. GDQP...XKZM)
         Active Strategy: Balanced (Mix of Blend Lending + DEX Liquidity)
         Estimated APY: ~8.4%

         You can now deposit funds or ask:
         • "what's my balance?"
         • "deposit 100 USDC"
         • "withdraw 50 USDC"
         • "check apy"

[User]:  what's my balance?
[Bot]:   💰 Your NeuroWealth Portfolio:
         Total Assets: <TOTAL_ASSETS_PLACEHOLDER> USDC
         Available Shares: <USER_SHARES_PLACEHOLDER> NWV
         Current APY: <ESTIMATED_APY_PLACEHOLDER>%
         Active Venue: Blend Protocol

[User]:  deposit 100 USDC
[Bot]:   📥 Deposit request received:
         Amount: 100.0000000 USDC
         Target Strategy: Balanced
         Status: Submitting to Soroban vault...
         Tx Hash: <TRANSACTION_HASH_PLACEHOLDER>
         ✅ Deposit confirmed! Your funds are now earning yield.
```

