# Deployment Concurrency and Cancellation

Production workflows serialize revisions by workflow and branch with
`cancel-in-progress: false`:

- `.github/workflows/cd.yml` serializes Vercel deployments for `main`.
- `.github/workflows/deploy-agent.yml` serializes Railway deploys and keeps an
  active production migration/rollout from being cancelled by a newer commit.
- `.github/workflows/terraform.yml` serializes production applies in the
  `terraform-production` group.

When another revision arrives during an active run, GitHub leaves the active
run alone and shows the pending run in the Actions queue. GitHub concurrency
keeps the newest pending run for a group; a newer push may replace an older
pending run, but it does not interrupt the active migration or rollout. Check
the Actions run list before dispatching a manual production operation.

The Railway workflow currently contains a placeholder migration step. Replace
it with the real migration command before depending on it for schema rollout.
If database migrations are moved to another workflow, use the same production
concurrency group and keep cancellation disabled there too.
