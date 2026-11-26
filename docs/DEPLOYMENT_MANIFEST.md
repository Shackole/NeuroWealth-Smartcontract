# Deployment manifest

A deployment manifest is a JSON object containing the fields below.

| Field | Requirement |
| --- | --- |
| `environment` | `staging` or `production`, matching the intended promotion target |
| `network` | `testnet` for staging or `mainnet` for production |
| `contract_id` | Stellar contract StrKey with a valid checksum |
| `wasm_sha256` | Lowercase, 64-character SHA-256 digest of the deployed WASM |

CI checks the [staging](fixtures/deployment/staging.json) and
[production](fixtures/deployment/production.json) fixtures. Both contain
illustrative IDs and digests. To validate release metadata against the WASM
file used for deployment, run the following command.

```sh
bash scripts/verify-deployment.sh --manifest deployment.json \
  --environment production --wasm neurowealth_vault.wasm
```

The staging deployment validates its generated manifest before publishing the
contract configuration used by the frontend and agent. Both files are retained
in the `staging-contracts` workflow artifact.
