# Replay yield observations

From the `agent` directory, run:

```sh
npm run --silent replay:yields -- scripts/fixtures/yield-observations.json
```

Pass a local JSON file containing an array of `ProtocolYieldData` observations.
APYs use fractions (for example, `0.08` means 8%). The command sends the
production ranking engine's JSON output to stdout. It uses only the supplied
observations and requires no credentials, database, or network access.
