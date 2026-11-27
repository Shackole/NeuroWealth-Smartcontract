# Staging deployment rehearsals

In the **Staging Deploy** workflow, dispatch with `mode=rehearse` and choose
the scope you want to validate. This runs offline input checks and skips all
deployment jobs and the staging Playwright run.

| Mode | Scope | Workflow behavior |
| --- | --- | --- |
| `rehearse` | `full` (default) | Input validation only |
| `rehearse` | `contract-only` | Input validation only |
| `deploy` | `full` | Deploy the contract, frontend, and agent, then run Playwright |
| `deploy` | `contract-only` | Deploy and initialize the testnet contract |

Pushes to the `staging` branch retain the full deployment pipeline. Manual
dispatch defaults to `rehearse`. Empty values and unsupported choices fail
validation. Pull requests that change the workflow, validator, or matrix run
the matrix check only.

The published cases in `.github/staging-input-matrix.json` can also be checked
from the repository root:

```bash
python3 scripts/staging-inputs.py --matrix .github/staging-input-matrix.json
```
