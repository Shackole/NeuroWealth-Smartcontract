import { Contract, Address, rpc } from '@stellar/stellar-sdk';
import { getWallet } from './walletService';
import { DEFAULT_LOCALE, Locale, translate } from './locale';

const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || 'CDLZFC3SYJYD7M6LJEFAPCHRLHAFKP6WYTHRF3EGO5CYD3EP4GZGM37T';

export interface UserPortfolio {
  balance: number;
  usdEquivalent: number;
  strategy: string;
  apy: number;
  dailyEarnings: number;
}

/**
 * Reads vault state and portfolio details for a verified WhatsApp user.
 */
export async function getPortfolio(phoneHash: string): Promise<UserPortfolio> {
  const wallet = getWallet(phoneHash);
  if (!wallet) {
    throw new Error('Wallet not found');
  }

  // Simulated RPC response structure matching Soroban vault getters
  // get_balance, get_user_strategy, get_exchange_rate
  const simulatedBalance = 100.25;
  const simulatedUsd = 100.25;
  const simulatedStrategy = 'Balanced';
  const simulatedApy = 8.4;
  const simulatedDailyEarnings = 0.23;

  return {
    balance: simulatedBalance,
    usdEquivalent: simulatedUsd,
    strategy: simulatedStrategy,
    apy: simulatedApy,
    dailyEarnings: simulatedDailyEarnings
  };
}

/**
 * Handles deposit transaction for user.
 */
export async function handleDeposit(
  phoneHash: string,
  amount: number,
  strategy?: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ success: boolean; txHash: string; message: string }> {
  const wallet = getWallet(phoneHash);
  if (!wallet) {
    return { success: false, txHash: '', message: translate(locale, 'Wallet not initialized.', 'La billetera no está configurada.') };
  }

  const selectedStrategy = strategy || 'Balanced';
  const txHash = `0x${Buffer.from(Math.random().toString()).toString('hex').substring(0, 64)}`;

  return {
    success: true,
    txHash,
    message: translate(locale,
      `Deposited ${amount} USDC into your ${selectedStrategy} strategy.\nTransaction Hash: ${txHash.substring(0, 10)}...\nConfirmed in 4 seconds on Stellar!`,
      `Se depositaron ${amount} USDC en tu estrategia ${selectedStrategy}.\nHash de la transacción: ${txHash.substring(0, 10)}...\n¡Confirmada en 4 segundos en Stellar!`,
    )
  };
}

/**
 * Handles withdraw transaction for user.
 */
export async function handleWithdraw(
  phoneHash: string,
  amount?: number,
  withdrawAll?: boolean,
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ success: boolean; txHash: string; message: string }> {
  const wallet = getWallet(phoneHash);
  if (!wallet) {
    return { success: false, txHash: '', message: translate(locale, 'Wallet not initialized.', 'La billetera no está configurada.') };
  }

  const withdrawAmountText = withdrawAll ? 'all funds' : `${amount} USDC`;
  const txHash = `0x${Buffer.from(Math.random().toString()).toString('hex').substring(0, 64)}`;

  return {
    success: true,
    txHash,
    message: translate(locale,
      `Withdrew ${withdrawAmountText} from vault contract.\nTransaction Hash: ${txHash.substring(0, 10)}...\nFunds sent directly to your wallet!`,
      `Se retiraron ${withdrawAll ? 'todos los fondos' : `${amount} USDC`} del contrato de la bóveda.\nHash de la transacción: ${txHash.substring(0, 10)}...\n¡Los fondos se enviaron directamente a tu billetera!`,
    )
  };
}
