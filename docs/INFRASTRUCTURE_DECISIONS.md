# Infrastructure Decisions

This document records significant infrastructure decisions for the NeuroWealth platform.
Each entry follows the format: context → options considered → decision → consequences.

---

## [2026-09-27] Stellar RPC Node: Self-Hosted vs Third-Party Provider

**Issue:** [#122](https://github.com/Shackole/NeuroWealth-Smartcontract/issues/122)
**Status:** Accepted
**Decided by:** Engineering team

### Context

The AI agent backend requires a reliable Stellar Soroban RPC endpoint to:
- Poll for vault contract events every 5 seconds (event listener loop)
- Fetch protocol APY data and submit rebalance transactions (decision loop, runs hourly)
- Read contract state for health checks and monitoring

The choice of RPC provider directly affects agent reliability, latency, cost,
and operational burden.

---

### Load Estimate

| Source | Frequency | Calls per cycle | Calls per hour |
|--------|-----------|-----------------|----------------|
| Event listener — `getLatestLedger` | every 5 s | 1 | 720 |
| Event listener — `getEvents` | every 5 s | 1 | 720 |
| Decision loop — APY fetch (Blend) | hourly | ~4 | 4 |
| Decision loop — APY fetch (DEX) | hourly | ~4 | 4 |
| Decision loop — `rebalance` submit | hourly (when triggered) | ~4 | 4 |
| **Total** | | | **~1 452 calls/hour** |

Peak headroom (3× burst): ~4 400 calls/hour ≈ **73 calls/minute**.

Monthly at steady state: ~1 452 × 24 × 30 = **~1 045 000 calls/month**.

---

### Comparison Matrix

| Dimension | Self-Hosted (stellar-core + Horizon) | Stellar Public API | QuickNode Stellar | Blockdaemon |
|-----------|--------------------------------------|--------------------|-------------------|-------------|
| **Cost** | ~$80–150/mo VPS + ops time | Free | Free tier: 3 M calls/mo; $49/mo Growth | $200+/mo enterprise |
| **p50 Latency** | 20–60 ms (same-region) | 200–800 ms (shared, variable) | ~80–120 ms | ~80–150 ms |
| **SLA / Reliability** | Self-managed; no SLA | No SLA; rate-limited, outages common | 99.9% SLA on paid plans | 99.95% SLA |
| **Rate Limits** | Unlimited (own node) | ~100 req/s public, no guarantees | 25 req/s free; 500 req/s paid | Custom |
| **Maintenance Burden** | High — upgrades, disk, monitoring | None | None | None |
| **Soroban / RPC Support** | Full (latest) | Partial (public horizon lags) | Full Soroban RPC | Full Soroban RPC |
| **Geo Redundancy** | Manual (multi-VPS) | None | Multi-region | Multi-region |

---

### Decision: QuickNode as Primary + Stellar Public Endpoint as Fallback

**Primary:** QuickNode Stellar RPC (free tier covers ~1 M calls/month; upgrade path to Growth for $49/mo)

**Fallback:** `https://soroban-testnet.stellar.org` (testnet) or `https://soroban-mainnet.stellar.org` (mainnet public endpoint)

**Rationale:**

1. **Load fits comfortably in the free tier.** ~1 045 000 calls/month sits within QuickNode's 3 M free-tier quota with 3× headroom for spikes.
2. **No operational overhead.** Running stellar-core + Horizon requires a dedicated VPS, disk management (ledger history can exceed 200 GB), upgrade cycles aligned with Stellar protocol releases, and 24/7 on-call. This is disproportionate for a bootstrapping project.
3. **Latency is acceptable.** QuickNode's ~100 ms p50 is sufficient for the hourly decision loop and 5-second event polling cadence.
4. **Self-hosted is reserved for Phase 3.** Once TVL and call volume justify it (>10 M calls/month), a co-located node makes economic sense. See `docs/ROADMAP.md`.
5. **Stellar public endpoint is a viable fallback.** It has no SLA but is free and sufficient for temporary failover (circuit open for ≤30 s).

**Rejected alternatives:**
- *Blockdaemon*: No self-service pricing; minimum contract is enterprise. Overkill for current stage.
- *Self-hosted now*: Adds 10+ hours/month of ops burden with no benefit at current call volume.

---

### High-Availability Configuration

The circuit breaker is implemented in `agent/src/rpcClient.ts`:

```
Primary RPC ──[circuit breaker]──► QuickNode endpoint
                │ (open after 3 failures in 60 s)
                ▼
Fallback RPC ──────────────────► Stellar public endpoint
                │ (reset probe after 30 s)
                ▼
Primary RPC ◄──── half-open probe
```

**Circuit breaker parameters:**

| Parameter | Value | Env override |
|-----------|-------|--------------|
| Failure threshold | 3 failures | — |
| Failure window | 60 seconds | — |
| Reset interval | 30 seconds | — |
| Primary URL | `SOROBAN_RPC_URL` | `SOROBAN_RPC_URL` |
| Fallback URL | `SOROBAN_RPC_URL_FALLBACK` | `SOROBAN_RPC_URL_FALLBACK` |

**Behaviour:**
- Circuit `closed` → all calls go to primary.
- Circuit `open` → all calls go to fallback; primary is not contacted.
- Circuit `half-open` → one probe request goes to primary; success closes the circuit, failure re-opens it.

---

### RPC Latency Metric

Every RPC call records a `rpc_request_duration_ms` log field (picked up by the
Prometheus scraper in `infra/metrics/metrics.js` via the existing
`stellar_rpc_latency_seconds` histogram). In-process p50/p95/p99 percentiles are
available via `getRpcLatencyPercentiles()` exported from `agent/src/rpcClient.ts`.

---

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOROBAN_RPC_URL` | Yes | Primary Soroban RPC endpoint (QuickNode URL) |
| `SOROBAN_RPC_URL_FALLBACK` | No | Fallback endpoint (defaults to Stellar public) |

Add to `.env.devnet.template`, `.env.staging.template`, and `.env.mainnet.template`
when provisioning a new environment.

---

### Consequences

- **Positive:** Zero ops burden for RPC infrastructure at current scale.
- **Positive:** Automatic failover within 30 s keeps agent availability high.
- **Positive:** Free tier covers all expected load with room to grow.
- **Negative:** We are dependent on a third-party provider; prolonged QuickNode outages will degrade to the public endpoint (higher latency, no SLA).
- **Mitigated by:** Circuit breaker + fallback endpoint + alert on consecutive RPC failures (via existing `MetricsEngine.recordError`).
- **Review trigger:** Upgrade to QuickNode Growth ($49/mo) or evaluate self-hosting if monthly call volume exceeds 2.5 M or if latency SLA becomes a contractual requirement.
