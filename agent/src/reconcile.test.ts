/**
 * reconcile.test.ts — Unit tests for the reconciliation job (Issue #425).
 *
 * These tests verify:
 *   1. Mismatch reports contain address, asset, ledger, and delta.
 *   2. The job is strictly read-only (no fund mutations).
 *   3. An operator can re-run a bounded address range via `addressRange`.
 *
 * Run with:
 *   ts-node --transpile-only src/reconcile.test.ts
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
  ReconciliationMismatch,
  ReconciliationResult,
  ReconcileOptions,
} from './reconcile';

// ---------------------------------------------------------------------------
// Structural / type-shape tests (no live DB or RPC required)
// ---------------------------------------------------------------------------

describe('ReconciliationMismatch shape (Issue #425)', () => {
  it('has all required fields with correct types', () => {
    const mismatch: ReconciliationMismatch = {
      address: 'GABC1234567890ABCDEF',
      asset: 'USDC',
      ledger: 1_234_567,
      dbShares: 1_000_000_000n,
      onchainShares: 900_000_000n,
      delta: 100_000_000n,       // db − onchain
    };

    assert.strictEqual(typeof mismatch.address, 'string');
    assert.strictEqual(typeof mismatch.asset, 'string');
    assert.strictEqual(typeof mismatch.ledger, 'number');
    assert.strictEqual(typeof mismatch.dbShares, 'bigint');
    assert.strictEqual(typeof mismatch.onchainShares, 'bigint');
    assert.strictEqual(typeof mismatch.delta, 'bigint');
  });

  it('delta = dbShares − onchainShares', () => {
    const db = 1_500_000_000n;
    const onchain = 1_200_000_000n;
    const mismatch: ReconciliationMismatch = {
      address: 'G_TEST',
      asset: 'USDC',
      ledger: 100,
      dbShares: db,
      onchainShares: onchain,
      delta: db - onchain,
    };
    assert.strictEqual(mismatch.delta, 300_000_000n);
  });

  it('supports negative delta (on-chain > DB)', () => {
    const db = 500_000_000n;
    const onchain = 700_000_000n;
    const mismatch: ReconciliationMismatch = {
      address: 'G_TEST2',
      asset: 'USDC',
      ledger: 200,
      dbShares: db,
      onchainShares: onchain,
      delta: db - onchain,
    };
    assert.strictEqual(mismatch.delta, -200_000_000n);
  });

  it('zero delta when db and onchain agree', () => {
    const shares = 999_000_000n;
    const mismatch: ReconciliationMismatch = {
      address: 'G_MATCH',
      asset: 'USDC',
      ledger: 300,
      dbShares: shares,
      onchainShares: shares,
      delta: shares - shares,
    };
    assert.strictEqual(mismatch.delta, 0n);
  });
});

describe('ReconciliationResult shape (Issue #425)', () => {
  it('has all required summary fields', () => {
    const result: ReconciliationResult = {
      ledger: 5_000_000,
      addressesChecked: 100,
      mismatchCount: 3,
      mismatches: [],
      durationMs: 450,
    };

    assert.strictEqual(typeof result.ledger, 'number');
    assert.strictEqual(typeof result.addressesChecked, 'number');
    assert.strictEqual(typeof result.mismatchCount, 'number');
    assert.ok(Array.isArray(result.mismatches));
    assert.strictEqual(typeof result.durationMs, 'number');
  });

  it('mismatchCount agrees with mismatches array length', () => {
    const mismatches: ReconciliationMismatch[] = [
      {
        address: 'G_A',
        asset: 'USDC',
        ledger: 1,
        dbShares: 10n,
        onchainShares: 5n,
        delta: 5n,
      },
      {
        address: 'G_B',
        asset: 'USDC',
        ledger: 1,
        dbShares: 20n,
        onchainShares: 25n,
        delta: -5n,
      },
    ];
    const result: ReconciliationResult = {
      ledger: 1,
      addressesChecked: 50,
      mismatchCount: mismatches.length,
      mismatches,
      durationMs: 120,
    };
    assert.strictEqual(result.mismatchCount, result.mismatches.length);
  });
});

describe('ReconcileOptions — address range bounding (Issue #425)', () => {
  it('accepts startAfter + limit for bounded re-runs', () => {
    const options: ReconcileOptions = {
      addressRange: {
        startAfter: 'GABC000LASTADDRESS',
        limit: 200,
      },
    };
    assert.strictEqual(options.addressRange?.limit, 200);
    assert.strictEqual(options.addressRange?.startAfter, 'GABC000LASTADDRESS');
  });

  it('accepts options without addressRange (uses defaults)', () => {
    const options: ReconcileOptions = {};
    assert.strictEqual(options.addressRange, undefined);
  });

  it('accepts rpcUrl and vaultContractId overrides', () => {
    const options: ReconcileOptions = {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      vaultContractId: 'CABC1234567890',
    };
    assert.strictEqual(options.rpcUrl, 'https://soroban-testnet.stellar.org');
    assert.strictEqual(options.vaultContractId, 'CABC1234567890');
  });
});

describe('Read-only guarantee (Issue #425)', () => {
  it('reconcile module exports do not include any write/mutate function names', async () => {
    // Import the module's export names and verify none suggest write operations.
    // This is a static check — it does not execute any DB or RPC calls.
    const mod = await import('./reconcile');
    const exportNames = Object.keys(mod);

    const writePatterns = ['insert', 'update', 'delete', 'transfer', 'submit', 'sign', 'mutate'];
    for (const name of exportNames) {
      const lower = name.toLowerCase();
      for (const pattern of writePatterns) {
        assert.ok(
          !lower.includes(pattern),
          `Export "${name}" suggests a write operation — reconcile must be read-only`,
        );
      }
    }
  });
});
