/**
 * vault-helpers.ts
 *
 * Helper functions for interacting with the NeuroWealth vault contract
 * from the frontend using @stellar/stellar-sdk v13.
 *
 * Key constants from the contract:
 *   DECIMAL_PLACES = 7  →  1 USDC = 10_000_000 stroops
 */

import {
  rpc as SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Address,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';

import { signWithFreighter } from '@/lib/freighter';
import type { Strategy } from '@/lib/depositSchema';

export const DECIMAL_PLACES = 7;
export const STROOP = 10 ** DECIMAL_PLACES; // 1 USDC in raw units

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE || Networks.TESTNET;
const VAULT_CONTRACT_ID =
  process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID ||
  'CDLZFC3SYJYD7M6LJEFAPCHRLHAFKP6WYTHRF3EGO5CYD3EP4GZGM37T';

// ─── Stellar testnet explorer ─────────────────────────────────────────────────
export const EXPLORER_BASE_URL = 'https://stellar.expert/explorer/testnet/tx';

/** Build a Stellar Expert link for a transaction hash. */
export function explorerUrl(txHash: string): string {
  return `${EXPLORER_BASE_URL}/${txHash}`;
}

// ─── Unit helpers ─────────────────────────────────────────────────────────────

/** Convert a human-readable USDC amount (e.g. 100) to raw contract units. */
export function toRawUnits(usdc: number): bigint {
  return BigInt(Math.round(usdc * STROOP));
}

/** Convert raw contract units back to human-readable USDC. */
export function fromRawUnits(raw: bigint): number {
  return Number(raw) / STROOP;
}

// ─── Strategy mapping ─────────────────────────────────────────────────────────

/** Map UI strategy names to the lowercase symbols the contract expects. */
export function strategyToSymbol(strategy: Strategy): string {
  return strategy.toLowerCase(); // 'Conservative' → 'conservative'
}

// ─── Soroban RPC server ───────────────────────────────────────────────────────

function getServer() {
  return new SorobanRpc.Server(RPC_URL, {
    allowHttp: RPC_URL.startsWith('http://'),
  });
}

function getContract() {
  return new Contract(VAULT_CONTRACT_ID);
}

// ─── USDC balance ─────────────────────────────────────────────────────────────

/**
 * Fetch the user's current USDC wallet balance (not vault balance).
 * Uses the USDC SEP-41 token contract if configured, otherwise falls back
 * to the vault balance.
 */
export async function fetchUsdcWalletBalance(publicKey: string): Promise<number> {
  const usdcTokenId = process.env.NEXT_PUBLIC_USDC_TOKEN_CONTRACT_ID;

  if (!usdcTokenId) {
    try {
      return await getVaultBalance(publicKey);
    } catch {
      return 0;
    }
  }

  try {
    const server = getServer();
    const account = await server.getAccount(publicKey);

    const usdcContract = new Contract(usdcTokenId);
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        usdcContract.call('balance', new Address(publicKey).toScVal()),
      )
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim)) {
      console.warn('USDC balance simulation error:', (sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error);
      return 0;
    }
    const result = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result;
    if (!result) return 0;
    const raw = scValToNative(result.retval) as bigint;
    return fromRawUnits(raw);
  } catch (err) {
    console.warn('Could not fetch USDC wallet balance:', err);
    return 0;
  }
}

/** Fetch the user's vault balance (deposited USDC). */
export async function getVaultBalance(publicKey: string): Promise<number> {
  try {
    const server = getServer();
    const account = await server.getAccount(publicKey);
    const contract = getContract();

    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call('get_balance', new Address(publicKey).toScVal()),
      )
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim)) return 0;
    const result = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result;
    if (!result) return 0;
    const raw = scValToNative(result.retval) as bigint;
    return fromRawUnits(raw);
  } catch {
    return 0;
  }
}

// ─── Preview shares ───────────────────────────────────────────────────────────

/**
 * Simulate preview_deposit_to_shares via Soroban RPC (no signing required).
 * Returns the number of shares (human-readable) the user would receive.
 */
export async function previewDepositToShares(
  publicKey: string,
  amountUsdc: number,
): Promise<number> {
  const server = getServer();
  const contract = getContract();
  const rawAmount = toRawUnits(amountUsdc);

  const account = await server.getAccount(publicKey);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'preview_deposit_to_shares',
        nativeToScVal(rawAmount, { type: 'i128' }),
      ),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    const errSim = sim as SorobanRpc.Api.SimulateTransactionErrorResponse;
    throw new Error(`Preview failed: ${errSim.error}`);
  }

  const result = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result;
  if (!result) return amountUsdc; // fallback: 1:1 ratio

  const rawShares = scValToNative(result.retval) as bigint;
  return fromRawUnits(rawShares);
}

// ─── Build + sign helpers ─────────────────────────────────────────────────────

/**
 * Describes the restore-footprint requirement returned when simulation detects
 * that one or more ledger entries are archived and must be restored before the
 * original operation can proceed.
 */
export interface RestoreRequirement {
  /** Estimated XLM fee (in stroops) for the restore-footprint transaction. */
  feeStroops: bigint;
  /** Human-readable XLM cost, e.g. "0.001 XLM". */
  feeXlm: string;
  /** Number of ledger entries that need to be restored. */
  entryCount: number;
}

/**
 * Check whether a simulation result indicates that archived contract data must
 * be restored before the operation can be executed.
 *
 * The Soroban RPC returns `restorePreamble` on the simulation response when the
 * footprint contains entries whose TTL has expired. In that case the caller must
 * first submit a `restore_footprint` transaction and then re-simulate.
 */
function extractRestoreRequirement(
  sim: SorobanRpc.Api.SimulateTransactionResponse,
): RestoreRequirement | null {
  // @ts-expect-error — restorePreamble is present in SDK ≥ v11 but may not be
  // reflected in older type definitions shipped with the installed version.
  const preamble = (sim as any).restorePreamble as
    | { minResourceFee: string; transactionData: unknown }
    | undefined;

  if (!preamble) return null;

  const feeStroops = BigInt(preamble.minResourceFee ?? '0');
  const feeXlm = (Number(feeStroops) / 1e7).toFixed(7).replace(/\.?0+$/, '') + ' XLM';

  // The restore footprint covers every expired entry referenced by the
  // original transaction. We surface a count of 1+ to the UI; a more precise
  // count would require parsing the SorobanTransactionData, which is optional
  // detail for the user-facing confirmation dialog.
  const entryCount = 1;

  return { feeStroops, feeXlm, entryCount };
}

/**
 * Submit and confirm a restore-footprint transaction.
 *
 * This rebuilds the transaction using the restore preamble provided by the RPC,
 * sends it for Freighter signing, and polls until it is confirmed.
 */
async function executeRestoreFootprint(
  publicKey: string,
  originalTx: import('@stellar/stellar-sdk').Transaction,
  sim: SorobanRpc.Api.SimulateTransactionResponse,
): Promise<string> {
  // @ts-expect-error — restorePreamble typing — see extractRestoreRequirement
  const preamble = (sim as any).restorePreamble as
    | { minResourceFee: string; transactionData: unknown }
    | undefined;

  if (!preamble) {
    throw new Error('No restore preamble found — cannot build restore transaction');
  }

  const { RestoreFootprintOperation, SorobanDataBuilder, xdr } =
    await import('@stellar/stellar-sdk');

  const server = getServer();
  const account = await server.getAccount(publicKey);

  // Reconstruct the transaction data from the preamble so the restore covers
  // exactly the entries identified by the RPC simulation.
  const restoreTxData = SorobanDataBuilder.fromXDR(
    // The SDK serialises transactionData as a base64-encoded XDR string.
    typeof preamble.transactionData === 'string'
      ? preamble.transactionData
      : xdr.SorobanTransactionData.toXDR(preamble.transactionData as any).toString('base64'),
  );

  const restoreTx = new TransactionBuilder(account, {
    fee: preamble.minResourceFee,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(RestoreFootprintOperation.restoreFootprint({}))
    .setSorobanData(restoreTxData.build())
    .setTimeout(30)
    .build();

  const signedXdr = await signWithFreighter(restoreTx.toXDR(), NETWORK_PASSPHRASE);
  if (!signedXdr) {
    throw new Error('Restore transaction was rejected in Freighter');
  }

  return submitAndConfirm(signedXdr);
}

/**
 * Build, simulate, and sign a transaction using Freighter.
 *
 * If the simulation detects archived ledger entries (restore-footprint
 * requirement), this function throws a {@link RestoreNeededError} so that the
 * caller can present the user with a confirmation dialog before proceeding.
 * The caller should then call {@link buildAndSignTxWithRestore} which handles
 * the full restore → re-simulate → sign flow.
 *
 * Returns the signed XDR for submission.
 */
async function buildAndSignTx(
  publicKey: string,
  operation: ReturnType<Contract['call']>,
): Promise<string> {
  const server = getServer();
  const account = await server.getAccount(publicKey);

  const tx = new TransactionBuilder(account, {
    fee: '100000', // 0.01 XLM — sufficient for Soroban
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Prepare (simulate + attach resource footprint)
  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    const errSim = sim as SorobanRpc.Api.SimulateTransactionErrorResponse;
    throw new Error(errSim.error ?? 'Transaction simulation failed');
  }

  // Detect archived-entry requirement before assembling
  const restoreReq = extractRestoreRequirement(sim);
  if (restoreReq) {
    throw new RestoreNeededError(restoreReq, tx, sim);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  const xdr = prepared.toXDR();

  // Sign with Freighter (non-custodial — private key stays in extension)
  const signedXdr = await signWithFreighter(xdr, NETWORK_PASSPHRASE);
  if (!signedXdr) {
    throw new Error('Transaction was rejected or Freighter signing failed');
  }

  return signedXdr;
}

/**
 * Error thrown by {@link buildAndSignTx} when the RPC simulation indicates that
 * one or more ledger entries are archived. The caller should present the user
 * with a restore-footprint confirmation step, then call
 * {@link buildAndSignTxWithRestore} to complete the flow.
 */
export class RestoreNeededError extends Error {
  public readonly requirement: RestoreRequirement;
  /** The unsigned transaction that triggered the restore requirement. */
  public readonly tx: import('@stellar/stellar-sdk').Transaction;
  /** The raw simulation response, used to build the restore transaction. */
  public readonly sim: SorobanRpc.Api.SimulateTransactionResponse;

  constructor(
    requirement: RestoreRequirement,
    tx: import('@stellar/stellar-sdk').Transaction,
    sim: SorobanRpc.Api.SimulateTransactionResponse,
  ) {
    super(
      `Archived contract data must be restored before this transaction can proceed. ` +
        `Restore fee: ${requirement.feeXlm}.`,
    );
    this.name = 'RestoreNeededError';
    this.requirement = requirement;
    this.tx = tx;
    this.sim = sim;
  }
}

/**
 * Full restore → re-simulate → sign flow.
 *
 * Call this after the user has confirmed the restore-footprint step.
 *
 * 1. Submits and confirms the restore-footprint transaction.
 * 2. Re-simulates the original operation (now that entries are live again).
 * 3. Signs and returns the assembled transaction XDR.
 *
 * @param publicKey   - The signer's Stellar public key.
 * @param operation   - The original contract operation that needs signing.
 * @param restoreErr  - The {@link RestoreNeededError} thrown by a prior
 *                      {@link buildAndSignTx} call. Contains the restore
 *                      preamble data needed to build the restore transaction.
 * @returns The signed XDR of the original operation, ready for submission.
 */
export async function buildAndSignTxWithRestore(
  publicKey: string,
  operation: ReturnType<Contract['call']>,
  restoreErr: RestoreNeededError,
): Promise<{ restoreHash: string; signedXdr: string }> {
  // Step 1 — submit restore-footprint transaction
  const restoreHash = await executeRestoreFootprint(
    publicKey,
    restoreErr.tx,
    restoreErr.sim,
  );

  // Step 2 — re-simulate now that all entries have been restored
  const server = getServer();
  const account = await server.getAccount(publicKey);

  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    const errSim = sim as SorobanRpc.Api.SimulateTransactionErrorResponse;
    throw new Error(errSim.error ?? 'Transaction simulation failed after restore');
  }

  // Archived entries should be live again — if another restore is required
  // something unexpected happened; surface a clear error rather than looping.
  const secondRestore = extractRestoreRequirement(sim);
  if (secondRestore) {
    throw new Error(
      'A second restore-footprint was required after the first restore completed. ' +
        'This is unexpected — please contact support.',
    );
  }

  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  const xdr = prepared.toXDR();

  // Step 3 — sign with Freighter
  const signedXdr = await signWithFreighter(xdr, NETWORK_PASSPHRASE);
  if (!signedXdr) {
    throw new Error('Transaction was rejected or Freighter signing failed');
  }

  return { restoreHash, signedXdr };
}

/** Submit a signed XDR and poll until confirmed. Returns the tx hash. */
async function submitAndConfirm(signedXdr: string): Promise<string> {
  const server = getServer();

  // Parse the signed XDR back to a transaction
  const { Transaction } = await import('@stellar/stellar-sdk');
  const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);

  const sendResp = await server.sendTransaction(tx);

  if (sendResp.status === 'ERROR') {
    const errResult = sendResp.errorResult;
    throw new Error(
      errResult
        ? `Transaction failed: ${JSON.stringify(errResult)}`
        : 'Transaction submission failed',
    );
  }

  // Poll until confirmed (up to 30s)
  const deadline = Date.now() + 30_000;
  let getResp = await server.getTransaction(sendResp.hash);

  while (
    getResp.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 1500));
    getResp = await server.getTransaction(sendResp.hash);
  }

  if (getResp.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error('Transaction was included in a ledger but execution failed');
  }

  if (getResp.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new Error('Transaction timed out — it may still be pending. Check the explorer.');
  }

  return sendResp.hash;
}

// ─── Deposit flow ─────────────────────────────────────────────────────────────

export interface DepositResult {
  strategyHash?: string;
  depositHash: string;
  /** Restore transaction hash, present when archived data was restored. */
  restoreHash?: string;
}

/**
 * Intermediate state emitted when the deposit simulation detects archived
 * ledger entries. The caller should surface a confirmation dialog showing
 * `requirement` details, then call `executeDepositAfterRestore` to complete.
 */
export interface DepositRestoreStep {
  type: 'restore_required';
  requirement: RestoreRequirement;
  /** Internal error object — pass to executeDepositAfterRestore. */
  restoreErr: RestoreNeededError;
  /** The original operation that needs the restore, held for re-signing. */
  operation: ReturnType<Contract['call']>;
}

/**
 * Execute the full deposit flow:
 *   1. set_user_strategy
 *   2. deposit USDC into vault
 *
 * Both transactions are signed with Freighter and submitted in sequence.
 *
 * If archived ledger entries are detected during simulation, the function
 * returns a {@link DepositRestoreStep} instead of a {@link DepositResult}.
 * The caller must present a restore-footprint confirmation dialog and then
 * call {@link executeDepositAfterRestore} to complete the flow.
 */
export async function executeDeposit(
  publicKey: string,
  amountUsdc: number,
  strategy: Strategy,
): Promise<DepositResult | DepositRestoreStep> {
  const contract = getContract();
  const rawAmount = toRawUnits(amountUsdc);
  const strategySymbol = strategyToSymbol(strategy);

  // ── 1. Set user strategy ──────────────────────────────────────────────────
  const strategyOp = contract.call(
    'set_user_strategy',
    new Address(publicKey).toScVal(),
    nativeToScVal(strategySymbol, { type: 'symbol' }),
  );

  let strategyHash: string | undefined;
  try {
    const strategyXdr = await buildAndSignTx(publicKey, strategyOp);
    strategyHash = await submitAndConfirm(strategyXdr);
  } catch (err) {
    if (err instanceof RestoreNeededError) {
      // Surface the restore requirement — the deposit op is the one blocked,
      // but the strategy op shares the same footprint so we restore for deposit.
      const depositOp = contract.call(
        'deposit',
        new Address(publicKey).toScVal(),
        nativeToScVal(rawAmount, { type: 'i128' }),
      );
      return {
        type: 'restore_required',
        requirement: err.requirement,
        restoreErr: err,
        operation: depositOp,
      };
    }
    throw err;
  }

  // ── 2. Deposit into vault ─────────────────────────────────────────────────
  const depositOp = contract.call(
    'deposit',
    new Address(publicKey).toScVal(),
    nativeToScVal(rawAmount, { type: 'i128' }),
  );

  try {
    const depositXdr = await buildAndSignTx(publicKey, depositOp);
    const depositHash = await submitAndConfirm(depositXdr);
    return { strategyHash, depositHash };
  } catch (err) {
    if (err instanceof RestoreNeededError) {
      return {
        type: 'restore_required',
        requirement: err.requirement,
        restoreErr: err,
        operation: depositOp,
      };
    }
    throw err;
  }
}

/**
 * Complete a deposit that was interrupted by an archived-data restore step.
 *
 * Call this after the user has confirmed the restore-footprint transaction in
 * the UI. Passes `restoreErr` and the blocked operation to
 * {@link buildAndSignTxWithRestore}, then submits the original deposit.
 *
 * @param publicKey   - The signer's Stellar public key.
 * @param restoreStep - The {@link DepositRestoreStep} returned by a prior
 *                      {@link executeDeposit} call.
 * @returns The completed {@link DepositResult} including the restore hash.
 */
export async function executeDepositAfterRestore(
  publicKey: string,
  restoreStep: DepositRestoreStep,
): Promise<DepositResult> {
  const { restoreHash, signedXdr } = await buildAndSignTxWithRestore(
    publicKey,
    restoreStep.operation,
    restoreStep.restoreErr,
  );
  const depositHash = await submitAndConfirm(signedXdr);
  return { depositHash, restoreHash };
}

// ─── Human-readable error messages ───────────────────────────────────────────

/**
 * Translate raw contract / SDK error messages into user-friendly strings.
 */
export function humanizeError(error: unknown): string {
  // RestoreNeededError has its own clear message — surface it directly
  if (error instanceof RestoreNeededError) {
    return error.message;
  }

  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('rejected') || raw.includes('Freighter')) {
    return 'Transaction was cancelled. Please approve the transaction in your Freighter wallet.';
  }
  if (raw.includes('InvalidAmountError') || raw.includes('Error(Contract, #105)')) {
    return 'Invalid amount. Please enter between 1 and 10,000 USDC.';
  }
  if (raw.includes('DepositCapExceededError') || raw.includes('Error(Contract, #106)')) {
    return 'Your deposit would exceed the per-user cap of 10,000 USDC.';
  }
  if (raw.includes('TvlCapExceededError') || raw.includes('Error(Contract, #107)')) {
    return 'The vault is at capacity. Please try a smaller amount or try again later.';
  }
  if (raw.includes('PausedError') || raw.includes('Error(Contract, #101)')) {
    return 'The vault is currently paused for maintenance. Please try again later.';
  }
  if (raw.includes('InsufficientLiquidity')) {
    return 'Insufficient liquidity in the vault. Please try a smaller amount.';
  }
  if (raw.includes('timed out')) {
    return 'Transaction timed out. Your funds are safe — check the Stellar explorer for the latest status.';
  }
  if (raw.includes('simulation failed') || raw.includes('Preview failed')) {
    return 'Could not estimate transaction. The network may be busy — please try again.';
  }
  if (raw.includes('getAccount') || raw.includes('404')) {
    return 'Wallet not found on the Stellar network. Make sure your account is funded.';
  }

  return `Transaction failed: ${raw.length > 120 ? raw.slice(0, 120) + '…' : raw}`;
}
