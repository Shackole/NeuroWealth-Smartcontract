# CI Cloud Credentials

The AWS workflows use GitHub Actions OIDC to assume separate IAM roles. AWS
access keys are not required by these workflows. OIDC tokens are issued for a
workflow job and exchanged for temporary role credentials.

## GitHub configuration

Create these repository or environment variables (role ARNs are identifiers,
not secrets):

| Variable | Workflow environment | Scope |
|----------|---------------------|-------|
| `AWS_TERRAFORM_PLAN_ROLE_ARN` | `terraform-plan` | Read-only plan access to Terraform state and required resource metadata. |
| `AWS_TERRAFORM_APPLY_ROLE_ARN` | `terraform-production` | Terraform state and the specific infrastructure resources managed by this workspace. |
| `AWS_BACKUP_ROLE_ARN` | `database-backup` | Backup bucket read/write and retention operations only; add KMS use only if the bucket configuration requires it. |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | repository or environment | Region identifier; not a credential. |

Move `RAILWAY_TOKEN` into the `terraform-plan`, `terraform-production`,
`staging`, and `production` GitHub environments that use it; configure each
environment with only the project-scoped token it needs. The Vercel deployment
workflow selects `vercel-preview` for previews and `vercel-production` for
`main`; store the corresponding scoped `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
`VERCEL_PROJECT_ID` in those environments. Keep preview credentials separate
from production credentials. Restrict `production`, `terraform-production`,
and `vercel-production` to `main`; restrict `staging` to the staging branch.
Keep `DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, and
`PAGERDUTY_ROUTING_KEY` as `database-backup` environment secrets, and set
`BACKUP_S3_BUCKET` as an environment variable there.

The `terraform-plan` environment must require a reviewer before it exposes the
AWS read-only role and Railway plan token to pull-request code. The
`terraform-production` environment must require reviewers and allow only the
protected `main` branch. Restrict the `database-backup` environment to `main`.
Terraform planning is skipped for fork-originated pull requests because those
revisions must not receive cloud credentials.

## AWS OIDC trust policy

Register GitHub's issuer `https://token.actions.githubusercontent.com` with
audience `sts.amazonaws.com`, then create one trust policy per role. Each
policy must match both the audience and one exact repository/environment
subject. Example for production apply:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:Shackole/NeuroWealth-Smartcontract:environment:terraform-production"
      }
    }
  }]
}
```

Use the corresponding exact subjects for `terraform-plan` and
`database-backup`. Do not use `*` for the subject. GitHub has introduced
immutable owner/repository ID suffixes for OIDC subjects in newer repositories
and opt-in configurations; compare the actual `sub` claim documented for this
repository with the trust condition before enabling a role. See [GitHub's AWS
OIDC guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
and [`configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials).

The trust policy controls which workflow identity may assume a role; the role's
permissions policy must separately limit accessible resources. Do not attach
administrator access to the plan or backup role. Remove and deactivate the
legacy `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` GitHub secrets after the
OIDC configuration is verified.

## Providers that still use API tokens

The current deployment workflows use provider-issued API tokens for Railway,
Vercel, Twilio, Slack, and database services. These are not AWS credentials
and are not exchanged through AWS OIDC. Use project/service-scoped tokens,
store them only as GitHub environment secrets or in the provider's secret
manager, limit preview credentials separately from production where the
provider allows it, set provider expiration where available, and rotate them
immediately after suspected exposure. Do not reuse personal administrator
tokens for automation. If a provider cannot issue expiring tokens, set an
owner and a rotation date in the secret inventory and rotate at least every 90
days or immediately after suspected exposure. The Railway token passed to
Terraform is also a provider token; restrict it to the project Terraform
manages and rotate it through Railway's controls.
