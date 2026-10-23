# Transaction worker sequence coordination

Transactions from one signing account are submitted under a Redis lease keyed
by that Stellar public key. The lease spans account loading, signing, sequence
retry, and submission. Local promise locks avoid Redis contention between jobs
in the same process; the Redis lease coordinates separate worker processes.
Jobs for separate signer accounts use separate lock keys and can proceed
concurrently.

The default signer is `AGENT_SECRET_KEY`. To select additional signing
accounts, configure `SIGNER_SECRET_KEYS_JSON` as a JSON object from public key
to secret key, and set a job's `signerAddress` to the matching public key. Do
not place secret keys in transaction job payloads. The worker verifies that
the configured secret derives the requested address.

After a submission timeout, the worker queries Horizon by the signed
transaction hash. If Horizon confirms acceptance, that result completes the
job. If acceptance cannot be confirmed, the job is discarded from Bull's
automatic retry path and fails with `SubmissionOutcomeUnknownError`; operators
must reconcile that hash before creating a replacement operation. Sequence
mismatches are safe to retry inside the account lock because the worker loads
the latest account state before signing the next attempt.
