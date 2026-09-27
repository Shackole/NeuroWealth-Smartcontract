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
 * Build, simulate, and sign a transaction using Freighter.
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

  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  const xdr = prepared.toXDR();

  // Sign with Freighter (non-custodial — private key stays in extension)
  const signedXdr = await signWithFreighter(xdr, NETWORK_PASSPHRASE);
  if (!signedXdr) {
    throw new Error('Transaction was rejected or Freighter signing failed');
  }

  return signedXdr;
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
}

/**
 * Execute the full deposit flow:
 *   1. set_user_strategy
 *   2. deposit USDC into vault
 *
 * Both transactions are signed with Freighter and submitted in sequence.
 */
export async function executeDeposit(
  publicKey: string,
  amountUsdc: number,
  strategy: Strategy,
): Promise<DepositResult> {
  const contract = getContract();
  const rawAmount = toRawUnits(amountUsdc);
  const strategySymbol = strategyToSymbol(strategy);

  // ── 1. Set user strategy ──────────────────────────────────────────────────
  const strategyOp = contract.call(
    'set_user_strategy',
    new Address(publicKey).toScVal(),
    nativeToScVal(strategySymbol, { type: 'symbol' }),
  );

  const strategyXdr = await buildAndSignTx(publicKey, strategyOp);
  const strategyHash = await submitAndConfirm(strategyXdr);

  // ── 2. Deposit into vault ─────────────────────────────────────────────────
  const depositOp = contract.call(
    'deposit',
    new Address(publicKey).toScVal(),
    nativeToScVal(rawAmount, { type: 'i128' }),
  );

  const depositXdr = await buildAndSignTx(publicKey, depositOp);
  const depositHash = await submitAndConfirm(depositXdr);

  return { strategyHash, depositHash };
}

// ─── Human-readable error messages ───────────────────────────────────────────

/**
 * Translate raw contract / SDK error messages into user-friendly strings.
 */
export function humanizeError(error: unknown): string {
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
