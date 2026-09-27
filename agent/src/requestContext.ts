/**
 * Request context middleware and helpers (Issue #121).
 *
 * Provides:
 *  - requestContextMiddleware: Express middleware that generates a UUID v4
 *    requestId for every incoming request, stores it in AsyncLocalStorage,
 *    and echoes it back in the X-Request-ID response header.
 *  - getRequestId(): reads the current requestId from AsyncLocalStorage.
 *
 * The requestId flows through all log calls made within the same async
 * context, enabling full request tracing across the agent's async operations.
 */

import { Request, Response, NextFunction } from 'express';
import { asyncLocalStorage, createRequestLogger, RequestContext } from './logger';

/**
 * Express middleware: generates a UUID v4 requestId, stores it in
 * AsyncLocalStorage, and sets X-Request-ID on the response.
 *
 * Mount before all route handlers:
 *   app.use(requestContextMiddleware);
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Re-use an existing request ID forwarded by a gateway, or generate one.
  const requestId =
    (req.headers['x-request-id'] as string | undefined)?.trim() ||
    crypto.randomUUID();

  // Optionally propagate hashed user from a prior auth step
  const rawUserId = (req as Request & { userId?: string }).userId;

  const context: RequestContext = { requestId, userId: rawUserId };

  // Attach request-scoped logger to the request object for use in handlers
  (req as Request & { log: ReturnType<typeof createRequestLogger> }).log =
    createRequestLogger(requestId, rawUserId);

  res.setHeader('X-Request-ID', requestId);

  asyncLocalStorage.run(context, () => next());
}

/**
 * Reads the current requestId from AsyncLocalStorage.
 * Returns 'unknown' when called outside a request context.
 */
export function getRequestId(): string {
  return asyncLocalStorage.getStore()?.requestId ?? 'unknown';
}
