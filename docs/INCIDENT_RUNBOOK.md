# NeuroWealth Incident Response Runbook

Operational procedures for the NeuroWealth agent, database, Stellar RPC, and
Soroban vault. This document is for the on-call responder who is first to see
an alert. It complements [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md), which
covers security incidents and owner-key compromise in more detail.

## 1. Operating Rules

1. Treat alerts as real until a check disproves them. Record UTC timestamps,
   commands, results, transaction hashes, and decisions in the incident thread.
2. The first responder is the Incident Commander (IC) until they explicitly
   hand off. The IC may declare, escalate, mitigate, and close an incident.
3. Do not expose secrets in Slack, PagerDuty, logs, screenshots, or tickets.
   Use environment variables such as `$VAULT_CONTRACT_ID` and
   `$OWNER_SECRET_KEY`; never paste their values.
4. Do not restart both an active agent and its standby at the same time. Check
   the failover lease before starting a replacement to avoid split brain.
5. For suspected fund loss, pause the vault first, then investigate. Use
   [AGENT_KEY_COMPROMISE_RUNBOOK.md](AGENT_KEY_COMPROMISE_RUNBOOK.md) if a key
   may be compromised.

## 2. Severity and Service Levels

| Level | Definition | Acknowledge | Target mitigation / resolution | Escalation path | Communication |
|---|---|---:|---:|---|---|
| **P0** | Vault paused unexpectedly, funds inaccessible, active loss, or imminent fund-safety risk | **< 15 min** | **< 1 h** | On-call -> IC + Security Lead immediately -> Core Protocol Lead; notify executive/stakeholder contact | PagerDuty critical page, `#incidents` war room, status page update |
| **P1** | Service degraded: agent unavailable, rebalance stuck, database or Stellar RPC outage affecting production | **< 15 min** | **< 4 h** | On-call -> IC -> Platform/Protocol Lead; involve vendor/provider when confirmed external | PagerDuty high page, `#incidents`, status page when user-visible |
| **P2** | Non-critical feature broken or delayed with a workaround and no fund risk | **< 4 h** | **< 1 business day** | On-call -> service owner -> Engineering Lead | `#incidents` thread or ticket; status page only if user-visible |
| **P3** | Cosmetic, documentation, or minor monitoring issue | **< 1 business day** | **< 5 business days** | On-call -> backlog owner | Ticket and normal team channel; no page or war room |

Escalate immediately when impact increases, the target time is at risk, or the
root cause is unknown and fund safety cannot be demonstrated. A P1 becomes P0
when vault operations are blocked without a safe fallback or any loss is
suspected.

## 3. On-Call, Contacts, and Tools

The production owner must replace every `TBD` value before launch. Keep this
register in the PagerDuty service and the private operations wiki; do not put
personal phone numbers or secrets in this public repository.

| Role | Primary contact | Backup | PagerDuty service / schedule |
|---|---|---|---|
| Operations on-call | `TBD: name / handle` | `TBD: name / handle` | `NeuroWealth Operations`, weekly rotation, Monday 09:00 UTC |
| Incident Commander | `TBD: name / handle` | `TBD: name / handle` | `NeuroWealth IC`, weekly rotation |
| Protocol / smart-contract lead | `TBD: name / handle` | `TBD: name / handle` | `NeuroWealth Protocol` |
| Platform / database lead | `TBD: name / handle` | `TBD: name / handle` | `NeuroWealth Platform` |
| Security lead | `TBD: name / handle` | `TBD: name / handle` | `NeuroWealth Security` |
| Stellar provider / escalation | `TBD: provider support URL` | `TBD: account owner` | External provider escalation |

### Required integrations

- **Grafana -> PagerDuty:** route P0/P1 alert rules to the corresponding
  PagerDuty service. Include alert name, dashboard URL, environment, contract
  ID, and last observed ledger in the payload.
- **PagerDuty -> Slack:** page `#incidents` and the current on-call. A page is
  not acknowledged until the responder posts in the war room.
- **Dedicated war room:** `#incidents` in Slack. Create a thread or temporary
  `#incident-YYYY-MM-DD-short-name` channel for P0/P1 incidents. Restrict it
  to responders, preserve it after resolution, and link it from the ticket.
- **Status page:** use the configured status page for user-visible P0/P1
  impact. Do not publish transaction hashes, addresses, or investigation
  details that could aid an attacker.

### Incident declaration

Post this message in `#incidents` within the acknowledgement SLA:

```text
INCIDENT DECLARED: INC-YYYY-MM-DD-NNN
Severity: P0 | P1 | P2 | P3
IC: @handle
Impact: <what users or systems cannot do>
Environment/network: <production/mainnet or testnet>
Started/detected (UTC): <timestamp>
Next update: <timestamp>
PagerDuty: <incident URL>
```

For P0, assign these roles in the thread: IC, On-chain operator, Technical
lead, Communications lead, and Scribe. One person may hold multiple roles.

## 4. First Five Minutes

1. Acknowledge the PagerDuty alert and note the incident ID.
2. Open the `#incidents` war room, declare the severity, and assign the IC.
3. Capture the alert, Grafana panel, deployment version, environment, and
   current UTC time. Do not restart or deploy before capturing evidence.
4. Check the agent health response:

   ```bash
   curl --fail --show-error --max-time 10 http://127.0.0.1:3001/health | jq .
   ```

   A `200` response with `status: "ok"` is healthy. A `503` response includes
   the failing check (`database`, `stellar_rpc`, or `openai_api_keys`).
5. For any possible fund-safety issue, stop automated actions and pause the
   vault immediately:

   ```bash
   stellar contract invoke --id "$VAULT_CONTRACT_ID" \
     --source "$OWNER_SECRET_KEY" --rpc-url "$SOROBAN_RPC_URL" \
     --network "$SOROBAN_NETWORK_PASSPHRASE" -- pause \
     --owner "$OWNER_ADDRESS"
   ```

   Record the transaction hash. Never unpause based only on a healthy process;
   the IC and Protocol Lead must confirm on-chain safety.

## 5. Incident Procedures

### 5.1 Agent down or heartbeat stale (P1)

The primary heartbeat is normally written every 15 seconds and expires after
60 seconds. A stale lease should promote a standby in approximately 90
seconds. The health endpoint returns `503` when the agent is degraded.

1. Check the service and recent logs:

   ```bash
   cd agent
   docker compose ps
   docker compose logs --tail=200 --timestamps agent
   curl --max-time 10 http://127.0.0.1:3001/health || true
   ```

2. Check whether a standby has promoted. Confirm only one instance owns the
   lease in the configured shared state store. Do not start a second primary.
3. If the process is unhealthy but the host and shared store are healthy:

   ```bash
   docker compose restart agent
   docker compose logs --follow --tail=100 agent
   ```

4. If the host is unavailable, use the existing standby. If no standby is
   available, start one replacement instance with the production environment
   and the existing shared Postgres/S3 state configuration. Do not use
   `agent/docker-compose.yml` unchanged for production; its defaults point to
   testnet and development credentials.
5. Verify `GET /health` returns `200`, the last processed ledger advances, and
   no duplicate rebalance is emitted. If the agent key may be compromised,
   kill all agent instances and follow the key-compromise runbook instead.
6. Resolve only after 15 minutes of healthy heartbeats and a successful
   scheduler/event-listener check. Keep the incident P1 if the standby is
   running but the primary has not been repaired.

### 5.2 Rebalance stuck or repeatedly failing (P1)

1. Declare P1 if the scheduled job is overdue, the circuit breaker trips, or
   three consecutive executions fail. Capture scheduler logs and the last
   `RebalanceEvent` before changing anything.

   ```bash
   cd agent
   docker compose logs --tail=300 --timestamps agent | \
     grep -Ei 'rebalance|circuit|failed|cooldown|gas|error'
   curl --fail --show-error http://127.0.0.1:3001/api/metrics/snapshot | jq .
   ```

2. Check the vault pause state, current protocol, last rebalance ledger, and
   recent contract events with the configured Stellar CLI/RPC. A cooldown
   rejection (`RebalanceCooldownActive`) is not a contract failure; record the
   next eligible ledger and wait.
3. Check `GET /health` and the external protocol balances/liquidity. Do not
   retry while Stellar RPC, a pool, or the agent key is unhealthy.
4. If retries could move funds incorrectly, stop the agent scheduler by
   stopping the agent container, then page the Protocol Lead:

   ```bash
   docker compose stop agent
   ```

5. If the vault is safe and the cause is transient, restart one agent instance
   and monitor one complete rebalance. If the cause is an external protocol,
   leave scheduling stopped and use the approved pool/provider recovery path.
6. Escalate to P0 and pause the vault if balances, TVL, share price, or the
   destination protocol are unexplained. Resume only after a dry-run/state
   review and IC + Protocol Lead approval.

### 5.3 Database unreachable (P1)

1. Confirm the failure is database-specific:

   ```bash
   curl --max-time 10 http://127.0.0.1:3001/health | jq '.checks'
   pg_isready -d "$DATABASE_URL"
   ```

2. Check the database provider dashboard, connection limit, and recent
   maintenance. Never print `DATABASE_URL` because it may contain credentials.
3. If the database is restarting, wait for it to become ready and restart the
   agent once:

   ```bash
   cd agent
   docker compose restart agent
   ```

4. If the primary database is unavailable, keep the agent stopped unless the
   configured `MultiStateStore` and application are explicitly validated to
   operate on the surviving backup. Do not point production at a local or
   test database.
5. Verify health, state backup writes, event ingestion, and user read paths.
   Treat missing audit data or uncertain state as P0 if fund balances cannot
   be verified; pause before further on-chain actions.

### 5.4 Stellar RPC unavailable (P1)

1. Confirm both the agent health check and the provider endpoint:

   ```bash
   curl --max-time 10 http://127.0.0.1:3001/health | jq '.checks.stellar_rpc'
   curl --fail --show-error --max-time 10 "$SOROBAN_RPC_URL" \
     -H 'content-type: application/json' \
     --data '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | jq .
   ```

2. Check the Stellar network status and provider status page. Compare a
   second approved RPC endpoint if configured; do not switch to an unapproved
   endpoint during an incident.
3. Stop automated rebalances while RPC responses are stale, inconsistent, or
   timing out. Preserve the last known ledger and error responses.
4. If an approved failover endpoint exists, update `SOROBAN_RPC_URL` through
   the normal secret/configuration mechanism, restart one agent, and verify
   `getLatestLedger` advances monotonically.
5. Do not submit duplicate transactions after a timeout. Query the transaction
   hash and ledger before retrying. Resolve after RPC is stable for 15 minutes,
   event ingestion catches up, and no rebalance was duplicated.

### 5.5 Vault paused unexpectedly (P0)

1. Declare P0, page Security and Protocol Leads, and stop the agent scheduler
   to prevent retries. Do not call `unpause`.
2. Query pause state and capture the triggering event, ledger, caller, and
   transaction hash using the configured production CLI/RPC:

   ```bash
   stellar contract invoke --id "$VAULT_CONTRACT_ID" \
     --rpc-url "$SOROBAN_RPC_URL" --network "$SOROBAN_NETWORK_PASSPHRASE" \
       -- is_paused
   ```

    The contract exposes `is_paused` as a read-only view. Record the returned
    boolean and the exact ledger used for the query.
3. Review all events since the last known-good ledger, including `paused`,
   `emerg`, upgrade, ownership, agent-update, deposit, withdrawal, and
   rebalance events. Compare TVL, total shares, share price, and token balances.
4. If any event, balance, caller, key, or protocol destination is unknown,
   keep the vault paused and follow the security response runbook. Rotate a
   suspected key before restoring service.
5. If the pause is confirmed expected and balances are safe, the IC records the
   reason and obtains Protocol Lead approval. On-chain operator then runs:

   ```bash
   stellar contract invoke --id "$VAULT_CONTRACT_ID" \
     --source "$OWNER_SECRET_KEY" --rpc-url "$SOROBAN_RPC_URL" \
       --network "$SOROBAN_NETWORK_PASSPHRASE" -- unpause \
       --owner "$OWNER_ADDRESS"
   ```

   Record the transaction hash, verify the unpaused event, and restart the
   scheduler only after health and event monitoring are green.
6. P0 resolution requires: no unexplained balance change, no pending malicious
   proposal, successful withdrawal/deposit read-path checks, and 30 minutes of
   stable monitoring. Communicate the resolution and schedule a review within
   72 hours.

## 6. Communications and Resolution

For P0, update the war room every 15 minutes and the status page at declaration,
mitigation, and resolution. For P1, update every 30 minutes or whenever impact
changes. Communications must state impact, current status, funds status when
known, mitigation, and next update time. Do not speculate about root cause.

Resolution post:

```text
INCIDENT RESOLVED: INC-YYYY-MM-DD-NNN
Severity: P0 | P1 | P2 | P3
Resolved (UTC): <timestamp>
User impact: <summary and duration>
Mitigation: <what changed>
Funds status: <verified safe / loss under investigation>
Follow-up owner and due date: <name, date>
Post-incident review: <ticket or document link>
```

## 7. Post-Incident Review Template

Create `docs/postmortem-INC-YYYY-MM-DD-NNN.md` within 72 hours for every P0
and any P1 with user impact or a confirmed threat.

```markdown
# Incident Review: INC-YYYY-MM-DD-NNN

## Summary
- Severity:
- Start / detection / mitigation / resolution (UTC):
- Services, network, and contract ID:
- Customer impact and duration:
- Funds at risk / actual loss:

## Timeline
| UTC time | Event or observation | Action | Owner | Evidence / transaction hash |
|---|---|---|---|---|
| | | | | |

## Root Cause
- Technical root cause:
- Contributing conditions:
- Why monitoring or controls did not prevent or detect it sooner:

## Response Assessment
- What worked:
- What slowed response:
- Communication and escalation gaps:

## Action Items
| Action | Owner | Priority | Due date | Tracking link | Status |
|---|---|---|---|---|---|
| | | | | | |

## Verification
- [ ] Alerts and dashboards updated
- [ ] Runbook updated
- [ ] Tabletop or recovery drill scheduled
- [ ] Stakeholder and status-page follow-up completed
```

## 8. Readiness Checklist

- [ ] PagerDuty services, schedules, escalation policies, and Grafana routing
      are configured and tested.
- [ ] `#incidents` exists and all responders can access it.
- [ ] Contact register has named primary and backup responders.
- [ ] Production RPC, contract ID, network passphrase, and secret manager are
      configured outside the repository.
- [ ] At least one standby agent and one tested state backup are available.
- [ ] On-call has run the health, database, RPC, pause-state, and failover
      checks without assistance.
- [ ] A quarterly tabletop and monthly forced-failover drill are scheduled.

## Related Documents

- [Incident Response Plan](INCIDENT_RESPONSE.md)
- [Disaster Recovery & Failover](DISASTER_RECOVERY.md)
- [Monitoring & Audit Trail](monitoring.md)
- [Agent Key Compromise Runbook](AGENT_KEY_COMPROMISE_RUNBOOK.md)
- [Security Monitoring](SECURITY_MONITORING.md)