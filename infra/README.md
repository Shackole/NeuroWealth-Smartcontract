# NeuroWealth Infrastructure (Terraform)

Terraform modules for reproducible provisioning of NeuroWealth infrastructure
on AWS and Railway (#119).

---

## Directory structure

```
infra/terraform/
├── main.tf                   # Root module — calls all child modules
├── variables.tf              # Input variables
├── outputs.tf                # Aggregated outputs
├── versions.tf               # Terraform + provider version requirements
├── backend.tf                # S3 remote state backend configuration
├── terraform.tfvars.example  # Example variable values (copy → terraform.tfvars)
└── modules/
    ├── railway/              # Railway project + staging/production services
    ├── s3-backup/            # S3 bucket for PostgreSQL database backups
    ├── kms/                  # KMS key for custodial Stellar keypair encryption
    ├── cloudwatch-alarms/    # CloudWatch alarms + SNS topic for backup monitoring
    └── dynamodb-lock/        # DynamoDB table for Terraform remote state locking
```

---

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured with credentials
- A Railway account and [API token](https://railway.app/account/tokens)
- An AWS IAM user or role with permissions for: S3, KMS, DynamoDB, CloudWatch, SNS

---

## Bootstrap (run once)

Before running `terraform init` you need an S3 bucket for remote state and a
DynamoDB table for state locking. Create them manually (chicken-and-egg):

```bash
# 1. Create the state bucket
aws s3api create-bucket \
  --bucket my-neurowealth-tf-state \
  --region us-east-1

# Enable versioning (protects state history)
aws s3api put-bucket-versioning \
  --bucket my-neurowealth-tf-state \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket my-neurowealth-tf-state \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Block all public access
aws s3api put-public-access-block \
  --bucket my-neurowealth-tf-state \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 2. Create the DynamoDB lock table
aws dynamodb create-table \
  --table-name neurowealth-tf-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

---

## Usage

### 1. Configure variables

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values (never commit this file)
```

### 2. Initialise

```bash
terraform init \
  -backend-config="bucket=my-neurowealth-tf-state" \
  -backend-config="dynamodb_table=neurowealth-tf-lock" \
  -backend-config="region=us-east-1"
```

### 3. Plan

```bash
terraform plan
```

### 4. Apply

```bash
terraform apply
```

---

## Modules

### `railway`

Creates a Railway project with two environments (production, staging) and two
agent services — one per environment.

| Output | Description |
|--------|-------------|
| `project_id` | Railway project ID |
| `staging_service_id` | Staging agent service ID (set as `RAILWAY_SERVICE_ID_STAGING` in GitHub secrets) |
| `production_service_id` | Production agent service ID (set as `RAILWAY_SERVICE_ID_PRODUCTION`) |

### `s3-backup`

Secure S3 bucket for PostgreSQL database backups.

- Versioning enabled
- AES256 server-side encryption
- All public access blocked
- Lifecycle: transition to Glacier after 30 days, expire after `backup_retention_days` (default 365)

### `kms`

AWS KMS customer-managed key for encrypting custodial Stellar keypairs stored
in the database.

- Annual automatic key rotation enabled
- Configurable deletion window (7–30 days)

### `cloudwatch-alarms`

CloudWatch monitoring for backup health and agent logs.

- SNS topic with optional email subscription
- Alarm: fires if no objects are written to the backup bucket in 24 hours
- CloudWatch log group for agent application logs (30-day retention)

### `dynamodb-lock`

DynamoDB table used by the Terraform S3 backend for state locking. Prevents
concurrent `terraform apply` runs from corrupting remote state.

---

## CI/CD pipeline

`.github/workflows/terraform.yml` automates plan and apply:

| Event | Jobs run |
|-------|----------|
| PR touching `infra/**` | Format check → Validate → Plan → Post plan as PR comment |
| Push to `main` touching `infra/**` | Plan → Apply (requires manual approval via `terraform-production` environment) |

### Required secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM credentials |
| `AWS_REGION` | AWS region (e.g. `us-east-1`) |
| `RAILWAY_TOKEN` | Railway API token |
| `TF_STATE_BUCKET` | S3 bucket name for remote state |
| `TF_LOCK_TABLE` | DynamoDB table name for state locking |

---

## State management

Remote state is stored in S3 with DynamoDB locking:

- **Bucket:** configured via `TF_STATE_BUCKET` secret
- **Key:** `state/neurowealth/terraform.tfstate`
- **Lock table:** configured via `TF_LOCK_TABLE` secret
- **Encryption:** AES256 (enforced by backend config)

State contains sensitive values (KMS key IDs, Railway service IDs). Never
commit `.tfstate` files or share state access broadly.
