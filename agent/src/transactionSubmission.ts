export class SubmissionOutcomeUnknownError extends Error {
  constructor(public readonly txHash: string) {
    super(`Submission outcome for ${txHash} is unknown; refusing to submit a replacement transaction`);
    this.name = 'SubmissionOutcomeUnknownError';
  }
}

export function isSequenceMismatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tx_bad_seq|bad_seq|sequence/i.test(message);
}

export function shouldRetrySequenceMismatch(error: unknown, attempt: number, maxAttempts: number): boolean {
  return isSequenceMismatch(error) && attempt < maxAttempts - 1;
}

/** Resolve a timeout by transaction hash; never build a replacement if acceptance is uncertain. */
export async function submitExactlyOnceOnTimeout<T>(
  submit: () => Promise<T>,
  lookupAccepted: () => Promise<T | null>,
  isTimeout: (error: unknown) => boolean,
  txHash: string,
): Promise<T> {
  try {
    return await submit();
  } catch (error) {
    if (!isTimeout(error)) throw error;
    try {
      const accepted = await lookupAccepted();
      if (accepted !== null) return accepted;
    } catch {
      // A lookup failure also leaves the submission outcome ambiguous.
    }
    throw new SubmissionOutcomeUnknownError(txHash);
  }
}
