/**
 * SIWS Authentication Router (#35)
 *
 * Routes:
 *  GET  /api/auth/challenge   — issue a one-time nonce for a Stellar address
 *  POST /api/auth/verify      — verify signature, return JWT pair
 *  POST /api/auth/refresh     — rotate refresh token, return new JWT pair
 *
 * All protected routes in the agent use the `requireAuth` middleware exported
 * from this file.
 */

import { Router, Request, Response, NextFunction } from 'express';
import IORedis from 'ioredis';
import {
  issueNonce,
  consumeNonce,
  buildChallengeMessage,
  verifyStellarSignature,
  issueTokenPair,
  storeRefreshToken,
  rotateRefreshToken,
  verifyAccessToken,
} from './authService';
import logger from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Redis client (shared with transactionQueue if same REDIS_URL)
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new IORedis(REDIS_URL, { lazyConnect: true });

redis.on('error', (err) => {
  logger.error({ error: err.message }, 'Redis connection error (auth)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth router
// ─────────────────────────────────────────────────────────────────────────────

const authRouter = Router();

/**
 * GET /api/auth/challenge?address=G...
 *
 * Returns:
 * ```json
 * {
 *   "address": "G...",
 *   "nonce": "abc123...",
 *   "message": "NeuroWealth Authentication\nAddress: G...\nNonce: abc123...\n..."
 * }
 * ```
 * The `message` field is the exact string the client must sign.
 */
authRouter.get('/api/auth/challenge', async (req: Request, res: Response) => {
  const { address } = req.query as { address?: string };

  if (!address || typeof address !== 'string' || address.length < 56) {
    res.status(400).json({ error: 'Valid Stellar address (G...) required as ?address=' });
    return;
  }

  try {
    const nonce = await issueNonce(redis, address);
    const message = buildChallengeMessage(address, nonce);

    res.json({ address, nonce, message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, 'Failed to issue SIWS challenge');
    res.status(503).json({ error: 'Challenge service unavailable' });
  }
});

/**
 * POST /api/auth/verify
 *
 * Body:
 * ```json
 * {
 *   "address":   "G...",
 *   "nonce":     "abc123...",
 *   "signature": "<base64-encoded Ed25519 signature of the challenge message>"
 * }
 * ```
 *
 * Returns:
 * ```json
 * {
 *   "accessToken":  "<jwt>",
 *   "refreshToken": "<jwt>",
 *   "expiresIn":    900
 * }
 * ```
 */
authRouter.post('/api/auth/verify', async (req: Request, res: Response) => {
  const { address, nonce, signature } = req.body as {
    address?: string;
    nonce?: string;
    signature?: string;
  };

  if (!address || !nonce || !signature) {
    res.status(400).json({ error: 'address, nonce, and signature are required' });
    return;
  }

  try {
    // 1. Consume nonce (single-use, 5-min TTL enforced at write time)
    const storedNonce = await consumeNonce(redis, address);

    if (!storedNonce) {
      res.status(401).json({ error: 'Nonce expired or not found. Request a new challenge.' });
      return;
    }

    if (storedNonce !== nonce) {
      res.status(401).json({ error: 'Nonce mismatch.' });
      return;
    }

    // 2. Reconstruct and verify the signature
    const message = buildChallengeMessage(address, nonce);
    const valid = verifyStellarSignature(address, message, signature);

    if (!valid) {
      res.status(401).json({ error: 'Invalid signature.' });
      return;
    }

    // 3. Issue token pair
    const tokens = issueTokenPair(address);
    await storeRefreshToken(redis, address, tokens.refreshToken);

    logger.info({ address }, 'SIWS authentication successful');
    res.json(tokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, 'SIWS verify error');
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
});

/**
 * POST /api/auth/refresh
 *
 * Body:
 * ```json
 * { "refreshToken": "<jwt>" }
 * ```
 *
 * Returns a new token pair on success, or 401 on failure.
 */
authRouter.post('/api/auth/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  try {
    const newPair = await rotateRefreshToken(redis, refreshToken);

    if (!newPair) {
      res.status(401).json({ error: 'Invalid or expired refresh token.' });
      return;
    }

    res.json(newPair);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, 'Token refresh error');
    res.status(503).json({ error: 'Token refresh unavailable' });
  }
});

export default authRouter;

// ─────────────────────────────────────────────────────────────────────────────
// JWT auth middleware — attach to protected routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express middleware that validates the `Authorization: Bearer <token>` header.
 * Attaches `req.stellarAddress` (string) on success.
 * Returns 401 if the token is missing, malformed, or expired.
 */
export function requireAuth(
  req: Request & { stellarAddress?: string },
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header missing or malformed' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired access token' });
    return;
  }

  req.stellarAddress = payload.sub;
  next();
}
