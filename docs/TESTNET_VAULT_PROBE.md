# Testnet vault probe

Set the GitHub Actions variable `STAGING_VAULT_CONTRACT_ID` to the deployed
Stellar testnet vault address in the repository or the `staging` environment.
Update it when the vault is redeployed.

Staging Deploy runs the probe hourly at minute 23 UTC. To run it on demand,
dispatch Staging Deploy with the `synthetic-read` operation. The probe
simulates `get_version` without signing or submitting a transaction.

Each run records the network, contract ID, and failure class in its summary.
The workflow fails if configuration or CLI setup fails, the invocation times
out or fails, or the getter does not return a positive version.
