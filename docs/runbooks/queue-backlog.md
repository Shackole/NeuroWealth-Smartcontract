# Transaction queue backlog runbook

These alerts are labeled with `environment`, `network`, and `queue_name`. Use
those labels to select the affected deployment before inspecting jobs.

1. Check `GET /metrics` on the agent and inspect pending count, oldest pending
   age, active workers, submission-failure counter, and dead-letter count.
   The configured Prometheus scrape uses the agent's `PORT` (default 3001).
2. Check agent logs for the transaction job ID and failure reason. Confirm the
   configured Stellar network, Horizon/RPC availability, account sequence, and
   transaction status before taking any action.
3. A failed submission may have reached the network even if confirmation was
   lost. Query the transaction hash/account history before retrying; never
   blindly resubmit a financial job.
4. Jobs moved to `transactions:failed` are retained for inspection. Record the
   job ID, type, requested amount in stroops, destination, failure reason, and
   any transaction hash in the incident record. Do not copy secret material
   into the incident notes.
5. Escalate a stuck or dead-lettered deposit/withdrawal to the on-call operator
   for reconciliation and a reviewed retry decision. The checked-in queue
   stats route is not mounted by the production `index.ts`; use Prometheus and
   the deployment's secured Redis/worker observability instead.

Alert thresholds require pending work to be non-zero and sustained; the
oldest-job critical alert catches even a single stuck transaction, while the
worker saturation warning needs pending jobs and a two-minute hold.
