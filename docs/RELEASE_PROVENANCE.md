# Release Provenance and Rollback

Production frontend deployments are made by `.github/workflows/cd.yml` from a
specific Git commit. Each successful deployment retains an immutable
`deployment-provenance-<commit SHA>-<run ID>` workflow artifact for 90 days
containing:

- the source commit and workflow run ID;
- the Vercel deployment URL and a deterministic archive of the `.vercel/output`
  payload, with its SHA-256 digest;
- the contract WASM built from the same commit, with its SHA-256 digest; and
- hashes for the deployment workflow, frontend lockfile, agent Dockerfile, and
  monitoring Compose configuration.

This workflow deploys a Vercel build output, not a container image. It therefore
records no container digest. The agent is deployed through its separate Railway
workflow and must be rolled back using the Railway deployment revision shown in
that service's deployment history.

## Frontend rollback

1. Find the last known-good deployment URL and commit in the Vercel dashboard.
2. Download the matching `deployment-provenance-<commit SHA>` artifact from
   GitHub Actions and verify the archive digest against `manifest.txt`.
3. Extract `vercel-output.tar.gz` into `frontend/.vercel/output` in a clean
   checkout of the matching commit.
4. Pull the production project settings using the approved Vercel token, then
   redeploy the prebuilt output:

   ```bash
   cd frontend
   npx vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
   npx vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
   ```

   Record the new deployment URL and run ID.
5. Verify the deployed frontend health and confirm that its configured vault
   network and contract ID still match the intended environment.

The retained contract WASM is evidence of the source revision; it is not an
automatic rollback mechanism. On-chain upgrades may be irreversible or require
the contract's timelock and migration procedure. Follow
[`UPGRADE_MIGRATION.md`](UPGRADE_MIGRATION.md); never infer that redeploying an
older frontend or WASM reverses contract state.
