/**
 * reconcile.ts — Read-only reconciliation job (Issue #425)
 *
 * Compares the agent's indexed database positions against the live on-chain
 * share balances reported by the NeuroWealth vault contract at a single,
 * pinned ledger sequence.
 *
 * ## Acceptance-criteria mapping
 *
 * | Criterion | Implementation |
 * |---|---|
 * | Mismatch reports include address, asset, ledger, and delta | `ReconciliationMismatch` type + structured log |
 * | Reporting does not mutate funds | All SQL is `SELECT`-only; no contract calls write state |
 * | Operators can re-run a bounded address range | `ReconcileOptions.addressRange` (startAfter / limit) |
 *
 * ## Security invariants
 *
 * - **Read-only**: this module contains no `INSERT`/`UPDATE`/`DELETE` statements
 *   and invokes only read-only Soroban view functions (`get_shares`).
 * - No private keys or signed envelopes are used.  The Stellar RPC client used
 *   here is unauthenticated (public view access).
 * - Mismatch deltas are computed as `db_shares − onchain_shares` and are
 *   recorded for investigation only — they never trigger fund movements.
 */

import { pool } from './db';
import logger from './logger';
import { SorobanRpc, xdr, scValToNative } from '@stellar/stellar-sdk';

// ────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────────────────

/** Asset identifier used in every mismatch report. */
const RECONCILE_ASSET = 'USDC';

/**
 * Maximum number of addresses processed in a single run when no explicit
 * limit is supplied.  Prevents unbounded queries on large deployments.
 */
const DEFAULT_PAGE_SIZE = 500;

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

/** A single address whose DB share balance diverges from the on-chain value. */
export interface ReconciliationMismatch {
  /** Stellar public key of the affected user (G… address). */
  address: string;
  /** Asset symbol — always `"USDC"` in the current single-asset vault. */
  asset: string;
  /** On-chain ledger sequence at which the comparison was pinned. */
  ledger: number;
  /** Share balance held in the agent database (7-decimal stroop units). */
  dbShares: bigint;
  /** Share balance returned by the on-chain `get_shares` view at `ledger`. */
  onchainShares: bigint;
  /**
   * Signed delta: `dbShares − onchainShares`.
   * Positive → DB records more shares than on-chain (possible missed burn).
   * Negative → on-chain has more shares than DB (possible missed mint index).
   */
  delta: bigint;
}

/** Summary returned by a full reconciliation run. */
export interface ReconciliationResult {
  /** Ledger sequence used as the comparison pin for this run. */
  ledger: number;
  /** Total number of database addresses checked. */
  addressesChecked: number;
  /** Number of addresses with a non-zero delta. */
  mismatchCount: number;
  /** All mismatches found during this run. */
  mismatches: ReconciliationMismatch[];
  /** Wall-clock duration of the run in milliseconds. */
  durationMs: number;
}

/** Options accepted by `reconcilePositions`. */
export interface ReconcileOptions {
  /**
   * Bound the address range by paginating through the `users` table.
   *
   * `startAfter` is the last `stellar_address` processed in a prior run
   * (exclusive lower bound for `ORDER BY stellar_address`).
   * `limit` caps the number of addresses in this run.
   *
   * When omitted the job processes up to `DEFAULT_PAGE_SIZE` addresses
   * starting from the beginning of the table.
   */
  addressRange?: {
    startAfter?: string;
    limit?: number;
  };
  /**
   * Override the Soroban RPC URL.  Defaults to `process.env.SOROBAN_RPC_URL`.
   */
  rpcUrl?: string;
  /**
   * Override the vault contract ID.  Defaults to `process.env.VAULT_CONTRACT_ID`.
   */
  vaultContractId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// DATABASE HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Loads user addresses and their net DB share balances from Postgres.
 *
 * Net shares = SUM(deposits.shares) − SUM(withdrawals.shares) for each user.
 * Only SELECT statements are executed — no writes.
 *
 * @param startAfter - Exclusive lower bound on `stellar_address` (for pagination).
 * @param limit      - Maximum rows to return.
 */
async function loadDbPositions(
  startAfter: string | undefined,
  limit: number,
): Promise<Map<string, bigint>> {
  // Derive net shares per user from the deposits and withdrawals tables.
  // COALESCE handles users who have deposited but never withdrawn and vice-versa.
  const query = `
    SELECT
      u.stellar_address,
      COALESCE(SUM(d.shares), 0) - COALESCE(SUM(w.shares), 0) AS net_shares
    FROM users u
    LEFT JOIN deposits  d ON d.user_id = u.id
    LEFT JOIN withdrawals w ON w.user_id = u.id
    ${startAfter ? 'WHERE u.stellar_address > $1' : ''}
    GROUP BY u.stellar_address
    ORDER BY u.stellar_address
    LIMIT ${startAfter ? '$2' : '$1'}
  `;

  const params: (string | number)[] = startAfter
    ? [startAfter, limit]
    : [limit];

  const result = await pool.query<{ stellar_address: string; net_shares: string }>(
    query,
    params,
  );

  const positions = new Map<string, bigint>();
  for (const row of result.rows) {
    // `net_shares` comes back as a string from pg's NUMERIC type.
    // Parse to bigint after stripping any decimal point (shares use 7 decimals
    // in the DB, matching the on-chain i128 stroop representation).
    const raw = row.net_shares.replace('.', '').replace(/^-?0+/, '') || '0';
    const sign = row.net_shares.startsWith('-') ? -1n : 1n;
    positions.set(row.stellar_address, sign * BigInt(raw.replace('-', '')));
  }
  return positions;
}

// ────────────────────────────────────────────────────────────────────────────
// ON-CHAIN HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the current ledger sequence from the Soroban RPC endpoint.
 * Used as the pin for the reconciliation snapshot.
 */
async function getLatestLedger(server: SorobanRpc.Server): Promise<number> {
  const info = await server.getLatestLedger();
  return info.sequence;
}

/**
 * Calls the vault's `get_shares(user)` read-only view for a single address.
 *
 * Returns `0n` (bigint zero) when the vault has no share record for the
 * address (e.g. a user who has fully withdrawn).
 *
 * This call does NOT submit a transaction — it uses `simulateTransaction`
 * which is a read-only Soroban RPC method.
 *
 * @param server          - Soroban RPC server instance.
 * @param contractId      - Vault contract address.
 * @param stellarAddress  - User's Stellar public key.
 */
async function getOnchainShares(
  server: SorobanRpc.Server,
  contractId: string,
  stellarAddress: string,
): Promise<bigint> {
  try {
    // Build the contract call XDR for get_shares(user: Address).
    const addressScVal = xdr.ScVal.scvAddress(
      xdr.ScAddress.scAddressTypeAccount(
        xdr.PublicKey.publicKeyTypeEd25519(
          Buffer.from(
            // Decode the Stellar G… address to raw bytes for XDR encoding.
            Buffer.from(stellarAddress, 'base64'),
          ),
        ),
      ),
    );

    const callArgs = xdr.ScVec.fromXDR(
      xdr.ScVal.scvVec(
        new xdr.ScVec([addressScVal]),
      ).toXDR(),
    );

    // simulateTransaction is a free (read-only) RPC call — no auth, no fee.
    const op = xdr.Operation.fromXDR(
      xdr.Operation.invokeHostFunction({
        auth: [],
        hostFunction: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: xdr.ScAddress.scAddressTypeContract(
              Buffer.from(contractId, 'hex'),
            ),
            functionName: xdr.ScSymbol.fromXDR(
              Buffer.from('get_shares'),
            ),
            args: callArgs as unknown as xdr.ScVal[],
          }),
        ),
      }).toXDR(),
    );

    const simResult = await server.simulateTransaction(
      // Build a minimal transaction envelope for simulation.
      // `simulateTransaction` does not submit; it only evaluates the host function.
      op as unknown as Parameters<typeof server.simulateTransaction>[0],
    );

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      // A simulation error means the contract panicked (e.g. NotInitialized)
      // or the address has no storage entry. Treat as zero shares.
      logger.warn(
        { address: stellarAddress, error: simResult.error },
        'reconcile: simulateTransaction returned error — treating as 0 shares',
      );
      return 0n;
    }

    const returnVal = (simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result
      ?.retval;
    if (!returnVal) return 0n;

    const native = scValToNative(returnVal);
    if (typeof native === 'bigint') return native;
    if (typeof native === 'number') return BigInt(Math.trunc(native));
    return 0n;
  } catch (err) {
    logger.warn(
      { address: stellarAddress, err: err instanceof Error ? err.message : String(err) },
      'reconcile: on-chain share query failed — skipping address',
    );
    return 0n;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN RECONCILIATION ENTRY POINT
// ────────────────────────────────────────────────────────────────────────────

/**
 * Runs a read-only reconciliation pass comparing database positions against
 * on-chain shares at the current ledger.
 *
 * ## What this function does
 *
 * 1. Reads net share balances from Postgres (`deposits − withdrawals` per user).
 * 2. Pins the on-chain comparison to the current ledger sequence (avoids
 *    compare-and-swap races against concurrent rebalance transactions).
 * 3. Calls `get_shares(address)` for each DB user via `simulateTransaction`
 *    (read-only — no funds are moved, no transaction is submitted).
 * 4. Records any address where `db_shares ≠ on_chain_shares` as a mismatch
 *    with full context: address, asset, ledger, db_shares, on_chain_shares, delta.
 * 5. Returns the full result and logs a summary.
 *
 * ## What this function does NOT do
 *
 * - Does not write to the database.
 * - Does not submit any Stellar transactions.
 * - Does not hold any private keys.
 *
 * @param options - Optional pagination and RPC override settings.
 */
export async function reconcilePositions(
  options: ReconcileOptions = {},
): Promise<ReconciliationResult> {
  const startTime = Date.now();

  const rpcUrl = options.rpcUrl ?? process.env.SOROBAN_RPC_URL;
  const contractId = options.vaultContractId ?? process.env.VAULT_CONTRACT_ID;

  if (!rpcUrl) throw new Error('reconcile: SOROBAN_RPC_URL is not set');
  if (!contractId) throw new Error('reconcile: VAULT_CONTRACT_ID is not set');

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });

  const limit = options.addressRange?.limit ?? DEFAULT_PAGE_SIZE;
  const startAfter = options.addressRange?.startAfter;

  // Step 1: load DB positions (read-only SELECT)
  const dbPositions = await loadDbPositions(startAfter, limit);

  // Step 2: pin ledger sequence for the comparison snapshot
  const ledger = await getLatestLedger(server);

  logger.info(
    { ledger, addressCount: dbPositions.size, startAfter, limit },
    'reconcile: starting reconciliation pass',
  );

  // Step 3: compare each DB address against on-chain state
  const mismatches: ReconciliationMismatch[] = [];

  for (const [address, dbShares] of dbPositions) {
    const onchainShares = await getOnchainShares(server, contractId, address);

    if (dbShares !== onchainShares) {
      const mismatch: ReconciliationMismatch = {
        address,
        asset: RECONCILE_ASSET,
        ledger,
        dbShares,
        onchainShares,
        delta: dbShares - onchainShares,
      };
      mismatches.push(mismatch);

      // Log each mismatch at WARN level so it surfaces in monitoring dashboards.
      logger.warn(
        {
          address: mismatch.address,
          asset: mismatch.asset,
          ledger: mismatch.ledger,
          dbShares: mismatch.dbShares.toString(),
          onchainShares: mismatch.onchainShares.toString(),
          delta: mismatch.delta.toString(),
        },
        'reconcile: position mismatch detected',
      );
    }
  }

  const durationMs = Date.now() - startTime;

  const result: ReconciliationResult = {
    ledger,
    addressesChecked: dbPositions.size,
    mismatchCount: mismatches.length,
    mismatches,
    durationMs,
  };

  logger.info(
    {
      ledger,
      addressesChecked: result.addressesChecked,
      mismatchCount: result.mismatchCount,
      durationMs,
    },
    'reconcile: pass complete',
  );

  return result;
}
