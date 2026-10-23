# NeuroWealth WhatsApp Bot Handler

WhatsApp integration layer enabling non-custodial and custodial chat-based interaction with the NeuroWealth Soroban Vault on Stellar.

## Features & Architecture
- **Twilio Webhook Handler**: Receives and responds to incoming WhatsApp messages via `POST /api/whatsapp/webhook`.
- **OTP Verification Flow**: Enforces 6-digit OTP verification for new phone numbers with strict 5-minute expiry window.
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
4. Stellar custodial wallet generated & user can check balance, deposit, or withdraw directly via chat.
