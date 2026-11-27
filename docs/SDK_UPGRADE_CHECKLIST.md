# Stellar SDK Upgrade Checklist for Workspace Packages

> **Issue:** #680  
> **Context:** `CONTRIBUTING.md`  
> **Purpose:** Coordinate `@stellar/stellar-sdk` (and related Soroban tooling) version
> bumps across all workspace packages, ensuring XDR round-tripping, generated code, and
> wallet integration remain consistent after each upgrade.

---

## Overview

The NeuroWealth monorepo contains multiple packages that each declare their own
`@stellar/stellar-sdk` dependency. Because the SDK owns the XDR codec, the contract
bindings generator, and the Freighter wallet integration surface, an unsynchronised
upgrade can produce silent serialisation mismatches or type errors that only surface at
runtime.

This checklist must be completed **in full** for every SDK version bump, regardless of
whether the bump is patch, minor, or major.

---

## 1. Affected Manifests

The following `package.json` files declare a Stellar SDK dependency and must be
updated together:

| Package | Manifest path | Current pinned range | Notes |
|---|---|---|---|
| `@neurowealth/vault-client` | `packages/vault-client/package.json` | `^17.2.1` | Auto-generated contract bindings; re-generate after every SDK bump |
| `@neurowealth/bridge` | `packages/bridge/package.json` | `^17.1.0` | Depends on `vault-client` workspace reference; must stay in lock-step |
| `@neurowealth/vault-ui` | `packages/vault-ui/package.json` | `^12.0.0` | **Currently behind** — align to workspace-wide version |
| `@neurowealth/admin-panel` | `packages/admin-panel/package.json` | *(via vault-client)* | Transitive; re-lock after vault-client bump |
| `frontend` | `frontend/package.json` | *(check current)* | Freighter API peer-dep alignment required |
| `whatsapp` | `whatsapp/package.json` | *(check current)* | Used for Stellar key operations in custodial flow |
| `agent` | `agent/package.json` | *(check current)* | Used for event polling and XDR decoding |

> **Action:** Before upgrading, run `grep -r "stellar-sdk" packages/*/package.json frontend/package.json whatsapp/package.json agent/package.json` to confirm the current pinned version in every manifest.

---

## 2. XDR Round-Trip Verification

XDR compatibility is the highest-risk area of an SDK bump. Stellar SDK minor and
major releases sometimes change XDR encoders, `Operation` builder signatures, or
`TransactionEnvelope` serialisation.

### 2.1 Check for XDR breaking changes in the SDK changelog

```bash
# View the SDK release notes for the target version
open https://github.com/stellar/js-stellar-sdk/releases/tag/v<NEW_VERSION>
# or
curl -s https://api.github.com/repos/stellar/js-stellar-sdk/releases/latest \
  | jq '.body' | head -100
```

Look for entries mentioning:
- `XDR`, `xdr-generated`, or `stellar-base` version bumps.
- Changes to `TransactionBuilder`, `Operation.*`, `SorobanDataBuilder`, or `Keypair`.
- Deprecations of envelope types (`TransactionEnvelope`, `FeeBumpTransaction`).

### 2.2 Run the vault-client XDR round-trip test

```bash
cd packages/vault-client
npm ci
npm test
# Tests in test/**/*.test.js exercise encode → decode → encode equality for
# deposit, withdraw, and set_user_strategy XDR envelopes.
```

Expected: all tests pass. Any `XDR decode error` or `serialisation mismatch` output
means the generated bindings are out of date — proceed to step 3.

### 2.3 Manual round-trip smoke test (simulated transactions)

```bash
# Requires a funded testnet key in SOROBAN_SECRET_KEY
source .env.devnet

stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source "$SOROBAN_SECRET_KEY" \
  --network testnet \
  --build-only \            # do not submit; just build XDR envelope
  -- deposit \
  --amount 10000000 \
  --strategy balanced

# Verify the returned XDR can be decoded without error
echo "<returned-xdr>" | stellar transaction decode
```

If `stellar transaction decode` returns an error, the SDK XDR codec has diverged from
the network. Do not submit transactions with this SDK version until resolved.

---

## 3. Generated Code (`@neurowealth/vault-client`)

The `vault-client` package is auto-generated from `contract-spec.json` using the
Stellar CLI bindings generator. After any SDK bump that changes the generated output
format, regenerate and diff the bindings.

### 3.1 Regenerate the bindings

```bash
# From repo root — requires pinned Stellar CLI (see .stellar-version)
stellar contract bindings typescript \
  --wasm neurowealth-vault/target/wasm32-unknown-unknown/release/neurowealth_vault.wasm \
  --output packages/vault-client/src \
  --overwrite

cd packages/vault-client
npm run build
npm run typecheck
```

### 3.2 Review the diff

```bash
git diff packages/vault-client/src/
```

Expected diff for a patch SDK bump: none, or only comment changes.  
Expected diff for a minor/major SDK bump: type import paths or helper function names.

If generated types change (e.g. `Option<i128>` becomes `i128 | undefined`), update
all consumer packages that import from `@neurowealth/vault-client`:
- `packages/bridge/src/**`
- `packages/vault-ui/src/**`
- `packages/admin-panel/src/**`
- `frontend/src/**`

### 3.3 Verify contract-spec.json is still in sync

```bash
# Build the WASM and regenerate the spec
cd neurowealth-vault
stellar contract build
stellar contract inspect \
  --wasm target/wasm32-unknown-unknown/release/neurowealth_vault.wasm \
  --output json > ../contract-spec.json

git diff contract-spec.json
# Expect no diff unless the contract itself changed in this PR
```

---

## 4. Wallet Integration (`@stellar/freighter-api`)

The Freighter browser extension wallet is integrated in `frontend` and uses
`@stellar/freighter-api`. The Freighter API version must be compatible with the
`@stellar/stellar-sdk` version installed in the same package.

### 4.1 Check the Freighter API peer dependency

```bash
# Check the peer dep declared by freighter-api
cat node_modules/@stellar/freighter-api/package.json | \
  python3 -c "import sys,json; p=json.load(sys.stdin); print(p.get('peerDependencies',{}))"
```

The printed peer dep range must include the target SDK version. If not:

1. Check the [Freighter API releases](https://github.com/stellar/freighter-api/releases)
   for a compatible version.
2. Bump `@stellar/freighter-api` in `frontend/package.json` to the compatible version.
3. Re-run the Freighter integration smoke test (see §4.2).

### 4.2 Freighter integration smoke test

This test cannot be automated in CI (requires a live browser extension). Verify
manually in a local dev environment:

1. Start the frontend: `cd frontend && npm run dev`.
2. Open `http://localhost:3000` with Freighter installed and connected to Stellar testnet.
3. Initiate a deposit:
   - Confirm the **Signature Request** modal appears (status `signature_request` per
     [TRANSACTION_PROGRESS_VOCABULARY.md](design/dashboard/TRANSACTION_PROGRESS_VOCABULARY.md)).
   - Approve in Freighter.
   - Confirm the transaction reaches `confirmed` status (ledger sequence visible).
4. Initiate a withdrawal and confirm the same flow.
5. Verify no console errors referencing `stellar-base`, `XDR`, or `Keypair`.

---

## 5. Lock-Step Version Alignment Check

After completing the upgrade in all manifests, verify no package is on a divergent
SDK version:

```bash
# Print the resolved stellar-sdk version in every workspace
for dir in packages/vault-client packages/bridge packages/vault-ui packages/admin-panel \
           frontend whatsapp agent; do
  echo -n "$dir: "
  node -e "const p=require('./$dir/node_modules/@stellar/stellar-sdk/package.json'); \
    console.log(p.version)" 2>/dev/null \
    || echo "(not installed — run npm ci in $dir)"
done
```

All lines must print the **same resolved version**. Any divergence means two packages
are using different XDR codecs, which can cause silent serialisation bugs.

---

## 6. CI Checks That Must Stay Green

After an SDK upgrade PR is opened, verify the following CI checks pass before
requesting review:

| CI check | What it validates |
|---|---|
| `vault-client` build & typecheck | Generated bindings compile with the new SDK |
| `vault-client` test | XDR round-trip tests pass |
| `bridge` typecheck | Consumer types remain compatible |
| `vault-ui` test | UI component tests pass with new SDK types |
| `admin-panel` typecheck | Admin panel compiles |
| `frontend` typecheck | Main app compiles (catches Freighter API mismatches) |
| `agent` typecheck | Agent event-listener XDR decoding compiles |
| Fuzz tests (if contract changed) | Deposit/withdraw share accounting round-trips |

> **Note:** The CI pipeline does not currently run a live Freighter browser test.
> The manual smoke test in §4.2 is the only coverage for wallet signing integration.

---

## 7. PR Checklist for SDK Upgrade PRs

- [ ] All manifests in §1 updated to the new SDK version.
- [ ] `npm ci` run in every affected package (no peer-dep warnings).
- [ ] XDR round-trip test (`packages/vault-client npm test`) passes.
- [ ] `vault-client` bindings regenerated if the generated output changed.
- [ ] `contract-spec.json` diff reviewed — no unintended contract-spec changes.
- [ ] Freighter API peer-dep checked; `@stellar/freighter-api` bumped if needed.
- [ ] Manual Freighter smoke test completed and noted in PR description.
- [ ] Lock-step alignment check run; all packages on the same resolved SDK version.
- [ ] CHANGELOG.md updated under `[Unreleased]` with the SDK bump and issue reference.

---

## Related Documents

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Branch naming, CI requirements, and PR process
- [`docs/DEPENDENCY_MANAGEMENT.md`](docs/DEPENDENCY_MANAGEMENT.md) — General dependency upgrade policy
- [`contract-spec.json`](contract-spec.json) — Contract ABI; must stay in sync with WASM
- [`packages/vault-client/README.md`](packages/vault-client/README.md) — Generated bindings usage
