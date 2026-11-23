import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const TRANSIENT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
]);

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
    code?: string;
    cause?: { code?: string };
  };
  const status = failure.response?.status ?? failure.status ?? failure.statusCode;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500 && status < 600;
  return TRANSIENT_CODES.has(failure.code ?? failure.cause?.code ?? '');
}

/** Shared by all provider calls in one evaluation, including their backoff. */
export class ApyRetryBudget {
  private readonly deadline: number;
  private retriesRemaining = 2;

  constructor(windowMs = 10_000) {
    this.deadline = performance.now() + windowMs;
  }

  async run<T>(request: () => Promise<T>): Promise<T> {
    const remaining = this.deadline - performance.now();
    if (remaining <= 0) throw new Error('APY provider retry window expired');

    let backoff: number;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('APY provider retry window expired')), Math.ceil(remaining));
        }),
        request(),
      ]);
    } catch (error) {
      if (!isRetryable(error) || this.retriesRemaining === 0) throw error;
      backoff = this.retriesRemaining === 2 ? 100 : 200;
      if (this.deadline - performance.now() <= backoff) throw error;
      this.retriesRemaining--;
    } finally {
      clearTimeout(timer);
    }
    await delay(backoff);
    return this.run(request);
  }
}
