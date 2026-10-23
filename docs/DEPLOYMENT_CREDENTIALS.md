# Deployment credential boundaries

Create GitHub Actions environments with credentials scoped to the service and
environment. Do not keep a repository-level production token as a fallback.

| Environment | Used by | Credential scope | Protection |
|---|---|---|---|
| `preview` | Vercel pull requests | Preview-only Vercel project/token | No production credentials |
| `production` | Vercel `main` deployment and Railway agent production | Production-only Vercel/Railway credentials | Required reviewers; allow `main` only |
| `staging` | Staging frontend, testnet vault, staging agent, staging database reset | Staging-only Vercel/Railway/database credentials | Allow `staging` only |
| `terraform-preview` | Terraform plans from pull requests | Read-only Railway token and scoped state/plan AWS access | No apply role or production signing keys |
| `terraform-production` | Terraform apply from `main` | Production apply credentials and state access | Required reviewers; allow `main` only |

The workflows intentionally use separate token names for the Railway service
deployments and for read-only versus apply Terraform jobs. Configure each secret
only in the named environment. Configure Vercel project IDs, Railway service IDs,
and AWS region as environment variables rather than repository-wide credentials.

Pull requests never select the `production` or `terraform-production`
environment. The main-branch workflows wait for environment protection rules
before receiving production credentials. Keep protected branch review and
required checks enabled as well.
