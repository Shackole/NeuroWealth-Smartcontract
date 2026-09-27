/**
 * Soroban vault contract error codes → human-readable messages.
 *
 * These codes are derived from the NeuroWealth vault contract error types.
 * Add new codes here as the contract evolves.
 */
export const VAULT_ERROR_MESSAGES: Record<string, string> = {
  // Deposit / withdrawal errors
  AmountTooSmall: 'Minimum deposit is 1 USDC.',
  AmountTooLarge: 'Amount exceeds the maximum allowed per transaction.',
  UserDepositCapExceeded: 'This deposit would exceed your personal deposit cap.',
  TvlCapExceeded: 'The vault has reached its total capacity. Try again later.',
  InsufficientBalance: 'Insufficient balance to complete this withdrawal.',
  InsufficientShares: 'You do not have enough shares for this withdrawal.',

  // Auth / access errors
  Unauthorized: 'You are not authorised to perform this action.',
  NotOwner: 'Only the vault owner can perform this action.',
  NotAgent: 'Only the AI agent can perform this action.',

  // State errors
  AlreadyInitialized: 'The vault has already been initialised.',
  NotInitialized: 'The vault has not been initialised yet.',
  ContractPaused: 'The vault is temporarily paused. Please try again later.',

  // Rate-limiting / cooldown
  RebalanceCooldownActive: 'A rebalance was performed recently. Please wait before rebalancing again.',
  RateLimitExceeded: 'Too many requests. Please wait a moment and try again.',

  // Upgrade / timelock
  TimelockNotElapsed: 'The timelock period has not elapsed yet.',
  NoPendingUpgrade: 'There is no pending upgrade to execute.',
  NoPendingAgentUpdate: 'There is no pending agent update to confirm.',

  // Generic fallback
  Unknown: 'An unexpected error occurred. Please try again.',
};

/**
 * Translates a raw error (from the Stellar SDK or RPC) into a
 * user-friendly string by matching against known vault error codes.
 *
 * Falls back to the raw message if no match is found.
 */
export function translateVaultError(error: unknown): string {
  if (!error) return VAULT_ERROR_MESSAGES.Unknown;

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error);

  // Check each known key against the raw error string
  for (const [key, message] of Object.entries(VAULT_ERROR_MESSAGES)) {
    if (raw.includes(key)) return message;
  }

  // If the raw string is short enough, surface it directly (dev feedback)
  if (raw.length <= 120) return raw;

  return VAULT_ERROR_MESSAGES.Unknown;
}
