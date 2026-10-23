# Vault pause and service status experience

The status API reports availability separately from contract pause state. A
missing or unreachable agent status endpoint is `unavailable`, never a false
"vault is live" response. When available, status can distinguish `normal`,
`pause`, `emergency`, and `recovery`, and reports deposit and withdrawal
availability independently.

| State | Message | Available actions |
| --- | --- | --- |
| Normal | No banner | Contract actions follow their normal controls |
| Standard pause | Vault paused; list deposit and withdrawal availability | Keep withdrawals discoverable when permitted |
| Emergency pause | Emergency pause is active; list each action's availability | Do not imply all funds are locked |
| Recovery | Recovery in progress; list each action's availability | Keep permitted withdrawals discoverable |
| Status service unavailable | Cannot confirm current action availability | Do not claim the vault is live or paused |

`VaultPauseBanner` renders separate deposit and withdrawal states and links to
the withdrawal flow only when the status service says withdrawals are allowed.
`WithdrawalModal` accepts `withdrawalsAllowed` so a pause does not automatically
disable a permitted withdrawal. When this capability is omitted, it retains the
legacy fail-closed behavior of disabling withdrawals during a pause.

## Status service contract

`GET /api/vault/status` normalizes the agent response to `availability`, `mode`,
`paused`, `deposits_allowed`, `withdrawals_allowed`, `reason`, and
`expected_resume`. Deployments must expose the pause mode and independent action
capabilities from the authoritative vault/agent source. Missing fields on an
available legacy response use conservative pause defaults; an unavailable
service leaves action capability unknown.

## Manual review evidence

- Review the unavailable fallback in `frontend/src/app/api/vault/status/route.ts`:
  it uses `availability: unavailable` and does not claim actions are live.
- Review each mode branch and independent capability message in
  `frontend/src/components/VaultPauseBanner.tsx`.
- Review `withdrawalsAllowed` handling in `frontend/src/components/WithdrawalModal.tsx`.
- No live status backend was available for an end-to-end UI observation in this
  repository session.
