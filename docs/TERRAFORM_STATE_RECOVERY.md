# Terraform state protection and recovery

The root backend uses the S3 object `state/neurowealth/terraform.tfstate` with
backend encryption enabled and a DynamoDB lock table. The separate
`infra/terraform/bootstrap-state` stack provisions the state bucket with
versioning, AES-256 server-side encryption, public access blocks, and a TLS-only
bucket policy. It provisions the lock table with point-in-time recovery and
deletion protection. Keep the bootstrap stack's own state encrypted and outside
the backend it creates.

## First-time setup

1. Apply `infra/terraform/bootstrap-state` from a secured operator environment.
2. Give CI and operators a dedicated IAM role. The emitted
   `state_access_policy_json` limits runtime access to the state object and lock
   table. Add only the separate infrastructure permissions needed for plans or
   applies; never give PR jobs production apply credentials.
3. Configure `TF_STATE_BUCKET` and `TF_LOCK_TABLE`, then run `terraform init`
   in `infra/terraform` with the S3 backend settings in `backend.tf`.
4. Import the bootstrapped lock table into the root state before the first
   apply: `terraform import module.dynamodb_lock.aws_dynamodb_table.tf_lock
   <lock-table-name>`. This avoids trying to create the table already used by
   backend locking.
5. Confirm an apply is serialized by the backend lock and that the S3 object has
   server-side encryption and versioning enabled.

## Recovery procedure

1. Stop all applies and confirm no Terraform job is active. Do not delete a
   DynamoDB lock while an apply may still be running.
2. Preserve the current state object and all versions. Record the bucket, key,
   current version ID, suspected-good version ID, and incident/run ID.
3. Inspect versions with `aws s3api list-object-versions --bucket "$TF_STATE_BUCKET"
   --prefix state/neurowealth/terraform.tfstate`. Download the candidate by its
   version ID to a secured temporary directory and inspect it with
   `terraform state list`/`terraform show -json` without printing secrets into
   logs.
4. Restore by copying the reviewed version to the current object key with:

   ```bash
   aws s3api copy-object \
     --bucket "$TF_STATE_BUCKET" \
     --key state/neurowealth/terraform.tfstate \
     --copy-source "$TF_STATE_BUCKET/state/neurowealth/terraform.tfstate?versionId=<version-id>" \
     --server-side-encryption AES256
   ```

   S3 retains the replaced version.
5. Run `terraform init -reconfigure` and `terraform plan` with production
   approval gates still enabled. Review the plan before any apply.
6. Record who approved recovery, the source and resulting version IDs, the
   commands, the plan result, and any state repair performed.

## Staging recovery exercise record

**Status: not performed in this repository environment.** No staging AWS
credentials or state bucket access were available, and no recovery result is
claimed. Before production use, an operator must run the numbered procedure in
an isolated staging backend, restore a known prior version, confirm the
resulting plan is expected, and replace this status with the run URL, date,
version IDs, operator, and observed result. Do not run a recovery exercise
against production state.
