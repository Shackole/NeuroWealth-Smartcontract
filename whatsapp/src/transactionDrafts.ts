export const TRANSACTION_DRAFT_TTL_MS = 5 * 60 * 1000;

type TransactionAction = 'deposit' | 'withdraw';

interface TransactionDraft {
  action: TransactionAction;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const drafts = new Map<string, TransactionDraft>();

export function clearTransactionDraft(phoneHash: string): void {
  const draft = drafts.get(phoneHash);
  if (!draft) return;

  clearTimeout(draft.timer);
  drafts.delete(phoneHash);
}

export function startTransactionDraft(phoneHash: string, action: TransactionAction): void {
  clearTransactionDraft(phoneHash);
  const expiresAt = Date.now() + TRANSACTION_DRAFT_TTL_MS;
  const timer = setTimeout(() => drafts.delete(phoneHash), TRANSACTION_DRAFT_TTL_MS);
  timer.unref();
  drafts.set(phoneHash, { action, expiresAt, timer });
}

export function takeTransactionDraft(phoneHash: string): TransactionAction | undefined {
  const draft = drafts.get(phoneHash);
  clearTransactionDraft(phoneHash);
  if (draft && Date.now() < draft.expiresAt) return draft.action;
}
