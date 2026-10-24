# HTTP Proxy and Request Limits

The agent and WhatsApp services accept traffic behind a TLS-terminating
reverse proxy. The proxy must forward traffic over a private or otherwise
trusted network, enforce HTTPS at the public edge, and apply its own request
size and connection limits. The applications do not terminate public TLS.

## Trusted forwarding headers

Both services default to Express `trust proxy: false`. In this mode,
`X-Forwarded-For`, `X-Forwarded-Proto`, and related headers supplied by an
untrusted client do not change the request IP or protocol used by Express.

When deployed behind a trusted proxy, set `TRUSTED_PROXY_CIDRS` to a
comma-separated list of the proxy's exact IPs/CIDRs, for example:

```text
TRUSTED_PROXY_CIDRS=10.20.0.0/16,2001:db8:1234::/48
```

Obtain real ranges from the hosting provider and firewall the service so only
those proxies can connect. Do not set a numeric proxy hop count or `*`; a
different network path could then let a client forge its apparent source IP
and bypass IP-based rate limits. Configure `WEBHOOK_BASE_URL` to the canonical
public HTTPS Twilio webhook URL so signature validation does not depend on
forwarded protocol headers.

## Body and timeout budgets

| Setting | Default | Purpose |
|---------|---------|---------|
| `REQUEST_BODY_LIMIT` | Agent `1mb`; WhatsApp `256kb` | Reject oversized JSON or form requests during parsing. |
| `HTTP_REQUEST_TIMEOUT_MS` | `30000` | Maximum time allowed to receive the complete request. |
| `HTTP_HEADERS_TIMEOUT_MS` | `10000` | Maximum time allowed to receive request headers; must not exceed request timeout. |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | `5000` | Idle keep-alive budget between requests. |

The WhatsApp webhook returns a TwiML response promptly and queues longer work.
Set the proxy's response timeout long enough for that response but below the
provider's callback deadline. `HTTP_REQUEST_TIMEOUT_MS` bounds request-body
receipt; it is separate from the proxy's response timeout. Verify Twilio sends
the `application/x-www-form-urlencoded` body through the proxy unchanged so
`X-Twilio-Signature` validation receives the expected fields. Production
requests fail closed with `503` if `TWILIO_AUTH_TOKEN` is missing; unsigned
requests are accepted only outside production for local development.

Only health endpoints should be used for health checks: `/health/live` reports
process liveness, while `/health/ready` reports dependency readiness. See
[`DEPLOYMENT_CONCURRENCY.md`](DEPLOYMENT_CONCURRENCY.md) for rollout controls.
