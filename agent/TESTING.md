# Agent tests

`npm test` runs `scripts/run-tests.cjs`. The runner recursively discovers every
`*.test.ts`, `*.integration.test.ts`, and TSX equivalent under `src`, sorts the
list, and routes the focused Jest suites through Jest and the remaining suites
through Node's test runner with `ts-node` loaded. Any child failure returns a
nonzero exit code. GitHub Actions uses the same command and adds the discovered,
scheduled, and excluded counts to its summary. The Redis integration suite uses
the isolated Redis service in that workflow.

`test-manifest.json` records the only current exclusion:

- `src/__tests__/api.integration.test.ts` uses the shared `DATABASE_URL` pool
  and currently has no disposable database fixture. It stays excluded until
  that suite is isolated from production credentials and can run against a
  throwaway PostgreSQL service.

The other suites use local fixtures, in-memory dependencies, or test-only
configuration. CI deliberately supplies no production credentials.
