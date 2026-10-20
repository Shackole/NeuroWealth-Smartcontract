/**
 * User-facing recovery guidance for wallet, vault, and Soroban RPC failures.
 * Raw SDK/contract text is kept as optional diagnostic detail and is never
 * used as the primary message.
 */
export interface VaultErrorPresentation {
  title: string;
  message: string;
  action: string;
  /** True only when repeating the same operation is safe. */
  retryable: boolean;
  technicalDetails?: string;
}

const CONTRACT_MESSAGES: Record<string, string> = {
  InvalidAmountError: 'The amount is outside the allowed range.',
  DepositCapExceededError: 'This deposit would exceed your deposit limit.',
  TvlCapExceededError: 'The vault has reached its deposit capacity.',
  AmountTooSmall: 'The amount is below the vault minimum.',
  AmountTooLarge: 'The amount is above the vault limit.',
  UserDepositCapExceeded: 'This deposit would exceed your deposit limit.',
  TvlCapExceeded: 'The vault has reached its deposit capacity.',
  InsufficientBalance: 'Your wallet does not have enough USDC for this amount.',
  InsufficientShares: 'Your available vault shares do not cover this withdrawal.',
  InsufficientLiquidity: 'The vault cannot currently provide this withdrawal amount.',
  ContractPaused: 'The vault is paused, so this action is temporarily unavailable.',
  RateLimitExceeded: 'Too many requests were made. Wait before submitting another action.',
};

function rawMessage(error: unknown): string {
  if (error === null || error === undefined) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function withReference(presentation: Omit<VaultErrorPresentation, 'technicalDetails'>, raw: string): VaultErrorPresentation {
  const safeReference = raw
    .replace(/\bS[A-Z2-7]{55}\b/g, '[redacted Stellar secret]')
    .replace(/(secret|private.?key)\s*[:=]\s*\S+/gi, '$1=[redacted]');
  return {
    ...presentation,
    ...(safeReference ? { technicalDetails: safeReference.slice(0, 500) } : {}),
  };
}

export function getVaultErrorPresentation(error: unknown): VaultErrorPresentation {
  const raw = rawMessage(error);
  const value = raw.toLowerCase();

  if (/user rejected|user declined|request rejected|signing was rejected|user canceled|user cancelled/.test(value)) {
    return withReference({
      title: 'Signing was canceled',
      message: 'Your wallet did not approve this transaction. No retry was submitted.',
      action: 'Review the amount and network, then start a new transaction if you still want to continue.',
      retryable: false,
    }, raw);
  }

  if (/wrong network|network mismatch|unsupported network|chain.?id mismatch/.test(value)) {
    return withReference({
      title: 'Switch to the selected network',
      message: 'Your wallet is connected to a different Stellar network than this vault.',
      action: 'Switch networks in your wallet, reconnect, and review the transaction again.',
      retryable: false,
    }, raw);
  }

  if (/insufficient.*(balance|fund)|not enough.*(balance|usdc)|underfunded/.test(value)) {
    return withReference({
      title: 'Available balance is too low',
      message: 'Your available USDC or XLM does not cover this action and its network fee.',
      action: 'Check both balances and enter an amount within your available USDC.',
      retryable: false,
    }, raw);
  }

  if (/amounttoosmall|minimum.*amount|amount.*below.*minimum/.test(value)) {
    return withReference({
      title: 'Amount is below the minimum',
      message: 'Enter an amount at or above the minimum shown beside the amount field.',
      action: 'Increase the amount and review the updated transaction preview.',
      retryable: false,
    }, raw);
  }

  if (/amounttoolarge|maximum.*amount|depositcapexceeded|tvlcapexceeded|amount.*above.*limit/.test(value)) {
    return withReference({
      title: 'Amount is above the current limit',
      message: 'The amount exceeds the per-transaction, personal, or vault limit.',
      action: 'Enter an amount within the limit shown in the form, then review the preview again.',
      retryable: false,
    }, raw);
  }

  if (/simulation.*(expired|stale)|expired.*simulation|stale simulation/.test(value)) {
    return withReference({
      title: 'Transaction preview expired',
      message: 'Network state changed after this transaction was simulated.',
      action: 'Refresh the balance and create a new preview before signing.',
      retryable: true,
    }, raw);
  }

  if (/rpc|failed to fetch|networkerror|network error|econn|http 429|http 5\d\d|service unavailable|timed out/.test(value)) {
    return withReference({
      title: 'Stellar network is temporarily unavailable',
      message: 'The app could not get a reliable response from the selected Stellar network.',
      action: 'Refresh balances and the transaction preview. Retry only if the wallet has not signed or submitted this transaction; otherwise check its status first.',
      retryable: false,
    }, raw);
  }

  for (const [code, message] of Object.entries(CONTRACT_MESSAGES)) {
    if (raw.includes(code)) {
      return withReference({
        title: 'Transaction could not be completed',
        message,
        action: 'Review the updated balance and vault status before creating a new transaction.',
        retryable: false,
      }, raw);
    }
  }

  return withReference({
    title: 'Transaction could not be completed',
    message: 'The app could not safely complete this action.',
    action: 'Check the transaction status and contact support with the reference details before trying again.',
    retryable: false,
  }, raw);
}

/** Backward-compatible concise message for existing form call sites. */
export function translateVaultError(error: unknown): string {
  return getVaultErrorPresentation(error).message;
}
