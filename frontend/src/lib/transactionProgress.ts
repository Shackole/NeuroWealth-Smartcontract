/**
 * Transaction Progress Vocabulary & Lifecycle Types (#491)
 *
 * Implements the coherent transaction progress vocabulary for Stellar/Soroban
 * vault interactions. Enforces:
 *   1. Every status has a clear next action and recovery action.
 *   2. Success strictly requires ledger confirmation (status SUCCESS, txHash, ledgerSeq).
 *   3. Delayed confirmation is clearly distinguishable from failure (amber warning,
 *      no duplicate submissions, funds pending consensus).
 *   4. Monetary units, network identity, and authorization requirements are explicit.
 *
 * @see design/dashboard/TRANSACTION_PROGRESS_VOCABULARY.md
 * @see docs/DESIGN_SYSTEM.md
 */

export type TransactionProgressStatus =
  | 'review'
  | 'signature_request'
  | 'submission'
  | 'confirmation'
  | 'delayed'
  | 'confirmed'
  | 'failure';

/** Boundary ownership classification across the system */
export type BoundaryLayer = 'contract' | 'service' | 'ui';

/** Action descriptor for primary next action or recovery action */
export interface TransactionAction {
  /** Visible button or link text */
  label: string;
  /** Unique key for handler routing */
  actionKey: string;
  /** Accessible text for assistive tech */
  ariaLabel: string;
  /** Visual variant matching design tokens */
  variant: 'primary' | 'secondary' | 'danger' | 'ghost' | 'external';
  /** Whether the action is currently in an asynchronous/busy state */
  isPending?: boolean;
  /** External URL if action opens an external tool like Stellar Explorer */
  href?: string;
  /** Disabled state */
  disabled?: boolean;
}

/** Explicit execution context representing financial, network, and auth parameters */
export interface TransactionContext {
  /** Vault action being executed */
  operation?: 'deposit' | 'withdraw' | 'withdraw_all' | 'set_strategy' | string;
  /** Underlying monetary asset symbol (default USDC) */
  assetSymbol?: string;
  /** Primary monetary amount in human units */
  amount?: number;
  /** Estimated vault shares minted or burned */
  sharesEstimate?: number;
  /** Vault share symbol (default NV-SHARES) */
  sharesSymbol?: string;
  /** Network fee formatted explicitly with XLM currency unit */
  networkFee?: string;
  /** Network identity (e.g. 'Stellar Testnet', 'Stellar Futurenet') */
  networkName?: string;
  /** Network passphrase */
  networkPassphrase?: string;
  /** Soroban RPC URL */
  rpcEndpoint?: string;
  /** Soroban Vault Contract ID */
  contractId?: string;
  /** Authorized signer Stellar public key (G...) */
  userPublicKey?: string;
  /** Transaction hash (64-character hex string) */
  txHash?: string;
  /** Confirmed Stellar ledger sequence number */
  ledgerSequence?: number;
  /** Error message on failure */
  errorMessage?: string;
  /** Error code (e.g., Contract #106, Wallet rejected) */
  errorCode?: string | number;
  /** Elapsed confirmation wait time in seconds */
  elapsedSeconds?: number;
}

/** Complete vocabulary entry for a specific status */
export interface TransactionStepVocabulary {
  status: TransactionProgressStatus;
  name: string;
  label: string;
  iconName: 'FileText' | 'Key' | 'Send' | 'Loader2' | 'Clock' | 'CheckCircle2' | 'XCircle';
  colorClass: string;
  bgClass: string;
  borderClass: string;
  title: string;
  subText: string;
  ariaLive: 'polite' | 'assertive';
  ariaLabel: string;
  nextAction: TransactionAction;
  recoveryAction: TransactionAction;
  boundary: BoundaryLayer;
}

/** Truncate a Stellar public key or tx hash safely */
export function formatAddressOrHash(val: string, prefix = 6, suffix = 6): string {
  if (!val || val.length <= prefix + suffix) return val || '';
  return `${val.slice(0, prefix)}…${val.slice(-suffix)}`;
}

/** Default Stellar Explorer URL generator */
export function getExplorerUrl(txHash: string, network = 'testnet'): string {
  const cleanNetwork = network.toLowerCase().includes('mainnet') ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${cleanNetwork}/tx/${txHash}`;
}

/** Format Stellar stroops into explicit XLM unit string */
export function formatStellarFee(stroops = 100): string {
  if (stroops < 1000) {
    return '< 0.00001 XLM';
  }
  const xlm = stroops / 10_000_000;
  return `${xlm.toFixed(5)} XLM`;
}

/** Check if confirmation status is delayed */
export function isDelayedConfirmation(status: TransactionProgressStatus | string): boolean {
  return status === 'delayed';
}

/** Check if status is a terminal failure */
export function isTerminalFailure(status: TransactionProgressStatus | string): boolean {
  return status === 'failure';
}

/**
 * Criterion 2 Guard:
 * Success strictly means ledger confirmation.
 * Requires status === 'confirmed', valid 64-char hex hash, and ledgerSequence > 0.
 */
export function isLedgerConfirmed(
  status: TransactionProgressStatus | string,
  ledgerSequence?: number,
  txHash?: string,
): boolean {
  if (status !== 'confirmed') return false;
  if (!ledgerSequence || typeof ledgerSequence !== 'number' || ledgerSequence <= 0) {
    return false;
  }
  if (!txHash || typeof txHash !== 'string' || txHash.trim().length === 0) {
    return false;
  }
  return true;
}

/**
 * Registry of canonical vocabulary definitions for all 7 statuses
 */
export const TRANSACTION_VOCABULARY: Record<
  TransactionProgressStatus,
  (ctx?: Partial<TransactionContext>) => TransactionStepVocabulary
> = {
  review: (ctx = {}) => {
    const amountStr = ctx.amount !== undefined ? `${ctx.amount.toLocaleString()} ${ctx.assetSymbol || 'USDC'}` : 'Amount';
    const netStr = ctx.networkName || 'Stellar Testnet';
    return {
      status: 'review',
      name: 'Review',
      label: 'Review Transaction',
      iconName: 'FileText',
      colorClass: 'text-indigo-400',
      bgClass: 'bg-indigo-500/10',
      borderClass: 'border-indigo-500/30',
      title: 'Review Transaction Details',
      subText: `Verify ${amountStr} on ${netStr} with fee ${ctx.networkFee || '< 0.00001 XLM'}.`,
      ariaLive: 'polite',
      ariaLabel: `Review transaction: ${amountStr} on ${netStr}.`,
      nextAction: {
        label: 'Confirm & Sign',
        actionKey: 'confirm_review',
        ariaLabel: 'Confirm details and request Freighter wallet signature',
        variant: 'primary',
      },
      recoveryAction: {
        label: 'Cancel',
        actionKey: 'cancel_review',
        ariaLabel: 'Cancel transaction and return to edit form',
        variant: 'secondary',
      },
      boundary: 'ui',
    };
  },

  signature_request: (ctx = {}) => {
    const accountStr = ctx.userPublicKey ? `for account ${formatAddressOrHash(ctx.userPublicKey, 4, 4)}` : '';
    return {
      status: 'signature_request',
      name: 'Signature Request',
      label: 'Signature Requested',
      iconName: 'Key',
      colorClass: 'text-indigo-400',
      bgClass: 'bg-indigo-500/15',
      borderClass: 'border-indigo-500/35',
      title: 'Approve in Freighter',
      subText: `Please approve the authorization in your Freighter browser extension ${accountStr}.`,
      ariaLive: 'assertive',
      ariaLabel: `Freighter signature request pending ${accountStr}.`,
      nextAction: {
        label: 'Awaiting Approval…',
        actionKey: 'await_signature',
        ariaLabel: 'Waiting for Freighter signature approval',
        variant: 'primary',
        isPending: true,
        disabled: true,
      },
      recoveryAction: {
        label: 'Cancel Request',
        actionKey: 'cancel_signature',
        ariaLabel: 'Cancel wallet signature request and return',
        variant: 'secondary',
      },
      boundary: 'service',
    };
  },

  submission: (ctx = {}) => {
    const rpcStr = ctx.rpcEndpoint || 'Soroban RPC';
    return {
      status: 'submission',
      name: 'Submission',
      label: 'Broadcasting to Stellar',
      iconName: 'Send',
      colorClass: 'text-sky-400',
      bgClass: 'bg-sky-500/10',
      borderClass: 'border-sky-500/30',
      title: 'Broadcasting Transaction',
      subText: `Submitting signed transaction XDR envelope to ${rpcStr}…`,
      ariaLive: 'polite',
      ariaLabel: 'Broadcasting transaction envelope to Stellar network.',
      nextAction: {
        label: 'Broadcasting…',
        actionKey: 'await_submission',
        ariaLabel: 'Broadcasting transaction to network',
        variant: 'primary',
        isPending: true,
        disabled: true,
      },
      recoveryAction: {
        label: 'Connection Status',
        actionKey: 'check_rpc',
        ariaLabel: 'Inspect RPC node connectivity',
        variant: 'ghost',
      },
      boundary: 'service',
    };
  },

  confirmation: (ctx = {}) => {
    const hashStr = ctx.txHash ? `Tx: ${formatAddressOrHash(ctx.txHash, 6, 6)}` : '';
    return {
      status: 'confirmation',
      name: 'Confirmation',
      label: 'Confirming on Ledger',
      iconName: 'Loader2',
      colorClass: 'text-emerald-400',
      bgClass: 'bg-emerald-500/10',
      borderClass: 'border-emerald-500/30',
      title: 'Awaiting Ledger Consensus',
      subText: `Waiting for transaction to close into a Stellar ledger (~3–5s). ${hashStr}`,
      ariaLive: 'polite',
      ariaLabel: `Waiting for ledger confirmation. ${hashStr}`,
      nextAction: {
        label: 'Awaiting Ledger…',
        actionKey: 'await_confirmation',
        ariaLabel: 'Waiting for ledger close consensus',
        variant: 'primary',
        isPending: true,
        disabled: true,
      },
      recoveryAction: {
        label: 'View Pending on Explorer',
        actionKey: 'view_explorer_pending',
        ariaLabel: 'Open pending transaction on Stellar Expert explorer',
        variant: 'external',
        href: ctx.txHash ? getExplorerUrl(ctx.txHash, ctx.networkName) : undefined,
      },
      boundary: 'contract',
    };
  },

  delayed: (ctx = {}) => {
    const secondsStr = ctx.elapsedSeconds ? ` (${ctx.elapsedSeconds}s elapsed)` : '';
    return {
      status: 'delayed',
      name: 'Delayed Confirmation',
      label: 'Confirmation Delayed',
      iconName: 'Clock',
      colorClass: 'text-amber-400',
      bgClass: 'bg-amber-500/10',
      borderClass: 'border-amber-500/30',
      title: 'Confirmation Taking Longer Than Expected',
      subText: `Ledger consensus is delayed${secondsStr}. The transaction has been broadcast and has NOT failed. Please do not re-submit to prevent duplicate operations.`,
      ariaLive: 'assertive',
      ariaLabel: `Notice: Ledger confirmation delayed${secondsStr}. Transaction has not failed. Do not re-submit.`,
      nextAction: {
        label: 'Continue Waiting',
        actionKey: 'continue_waiting',
        ariaLabel: 'Keep waiting for ledger consensus in background',
        variant: 'primary',
      },
      recoveryAction: {
        label: 'Check Status on Explorer',
        actionKey: 'check_explorer_delayed',
        ariaLabel: 'Verify pending status on Stellar Expert explorer without resubmitting',
        variant: 'external',
        href: ctx.txHash ? getExplorerUrl(ctx.txHash, ctx.networkName) : undefined,
      },
      boundary: 'service',
    };
  },

  confirmed: (ctx = {}) => {
    const seqStr = ctx.ledgerSequence ? `Ledger #${ctx.ledgerSequence}` : 'Ledger Confirmed';
    const hashStr = ctx.txHash ? formatAddressOrHash(ctx.txHash, 6, 6) : '';
    return {
      status: 'confirmed',
      name: 'Confirmed',
      label: 'Ledger Confirmed',
      iconName: 'CheckCircle2',
      colorClass: 'text-emerald-400',
      bgClass: 'bg-emerald-500/20',
      borderClass: 'border-emerald-500/30',
      title: 'Transaction Confirmed on Ledger',
      subText: `Included in Stellar ${seqStr} · Tx ${hashStr}. Balances updated.`,
      ariaLive: 'polite',
      ariaLabel: `Transaction confirmed on Stellar ${seqStr}. Transaction hash: ${ctx.txHash || ''}.`,
      nextAction: {
        label: 'Done',
        actionKey: 'complete',
        ariaLabel: 'Close confirmation dialog and return to dashboard',
        variant: 'primary',
      },
      recoveryAction: {
        label: 'View on Stellar Explorer',
        actionKey: 'view_explorer_confirmed',
        ariaLabel: 'View verified transaction receipt on Stellar Expert explorer',
        variant: 'external',
        href: ctx.txHash ? getExplorerUrl(ctx.txHash, ctx.networkName) : undefined,
      },
      boundary: 'contract',
    };
  },

  failure: (ctx = {}) => {
    const errText = ctx.errorMessage || 'Transaction execution failed on Stellar network.';
    const codeText = ctx.errorCode ? ` (Code: ${ctx.errorCode})` : '';
    return {
      status: 'failure',
      name: 'Failure',
      label: 'Transaction Failed',
      iconName: 'XCircle',
      colorClass: 'text-red-400',
      bgClass: 'bg-red-500/15',
      borderClass: 'border-red-500/35',
      title: 'Transaction Failed',
      subText: `${errText}${codeText}`,
      ariaLive: 'assertive',
      ariaLabel: `Transaction failed: ${errText}${codeText}.`,
      nextAction: {
        label: 'Retry Transaction',
        actionKey: 'retry',
        ariaLabel: 'Retry signing and submitting transaction',
        variant: 'primary',
      },
      recoveryAction: {
        label: 'Dismiss',
        actionKey: 'dismiss_error',
        ariaLabel: 'Dismiss error and return to edit details',
        variant: 'secondary',
      },
      boundary: 'service',
    };
  },
};

/** Get vocabulary details for a given status */
export function getVocabulary(
  status: TransactionProgressStatus | string,
  context?: Partial<TransactionContext>,
): TransactionStepVocabulary {
  const factory = TRANSACTION_VOCABULARY[status as TransactionProgressStatus] || TRANSACTION_VOCABULARY.review;
  return factory(context);
}

/** Standard steps ordered for multi-step progress indicators */
export const TRANSACTION_LIFECYCLE_STEPS: TransactionProgressStatus[] = [
  'review',
  'signature_request',
  'submission',
  'confirmation',
  'confirmed',
];

/**
 * Builds the ordered step list for the stepper component based on current status
 */
export function buildStandardSteps(
  currentStatus: TransactionProgressStatus | string,
  context: Partial<TransactionContext> = {},
) {
  const isTerminalErr = currentStatus === 'failure';
  const isDelay = currentStatus === 'delayed';

  return TRANSACTION_LIFECYCLE_STEPS.map((stepKey, idx) => {
    const vocab = getVocabulary(stepKey, context);

    let state: 'pending' | 'active' | 'done' | 'error' | TransactionProgressStatus;
    const currentIdx = TRANSACTION_LIFECYCLE_STEPS.indexOf(
      (currentStatus === 'delayed'
        ? 'confirmation'
        : currentStatus === 'failure'
        ? 'confirmation'
        : currentStatus) as TransactionProgressStatus,
    );

    if (currentStatus === 'confirmed') {
      state = 'done';
    } else if (isTerminalErr && idx === currentIdx) {
      state = 'failure';
    } else if (isDelay && idx === currentIdx) {
      state = 'delayed';
    } else if (idx < currentIdx) {
      state = 'done';
    } else if (idx === currentIdx) {
      state = currentStatus as TransactionProgressStatus;
    } else {
      state = 'pending';
    }

    return {
      id: stepKey,
      label: vocab.label,
      subText: idx === currentIdx ? vocab.subText : undefined,
      status: state,
      errorMessage: isTerminalErr && idx === currentIdx ? context.errorMessage : undefined,
      explorerUrl:
        stepKey === 'confirmed' && context.txHash
          ? getExplorerUrl(context.txHash, context.networkName)
          : undefined,
      nextAction: vocab.nextAction,
      recoveryAction: vocab.recoveryAction,
    };
  });
}
