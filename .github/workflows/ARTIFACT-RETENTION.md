# Workflow artifact retention

| Purpose | Days | Workflow artifacts |
| --- | ---: | --- |
| Release and audit evidence | 90 | Release SBOMs (`release-sbom.yml`), deployment provenance (`cd.yml`), contract spec and generated client (`contract-spec.yml`), secret-scan SARIF (`secret-scan.yml`), staging database restore reports (`db-staging-restore.yml`) |
| Build and staging handoff | 30 | Vault WASM (`ci.yml`), staging contract configuration (`staging.yml`) |
| Debugging and regression review | 14 | Devnet E2E output and accessibility reports (`ci.yml`), Rust, agent and frontend coverage (`coverage.yml`) |
| Infrastructure review | 7 | Terraform PR plan (`terraform.yml`) |

These are the requested retention periods for new GitHub Actions uploads,
subject to the repository's Actions retention limit. SBOMs attached to GitHub
Releases are release assets and follow the lifecycle of those releases.
