/**
 * REST API — earnings and balance endpoints for frontend (#31)
 *
 * All endpoints require JWT auth (via `requireAuth` middleware) except
 * GET /api/stats and GET /api/apy which are public.
 *
 * Endpoints:
 *  GET /api/balance/:address          — current on-chain USDC balance
 *  GET /api/earnings/:address         — earnings time-series (?range=7d|30d|90d)
 *  GET /api/transactions/:address     — paginated transaction history (?page=1&limit=10)
 *  GET /api/apy                       — current APYs for all protocols (public)
 *  GET /api/stats                     — vault-wide TVL, user count, protocol (public)
 *
 * Rate limit: 100 requests/minute per IP (enforced via express-rate-limit).
 */

import { Router, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Pool } from 'pg';
import { Horizon, Networks, Asset } from '@stellar/stellar-sdk';
import { requireAuth } from './authRouter';
import logger from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const STELLAR_RPC_URL =
  process.env.STELLAR_RPC_URL || 'https://horizon-testnet.stellar.org';
const USDC_ISSUER =
  process.env.USDC_ISSUER ||
  'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

const horizonServer = new Horizon.Server(STELLAR_RPC_URL);
const USDC_ASSET = new Asset('USDC', USDC_ISSUER);

// ─────────────────────────────────────────────────────────────────────────────
// Database
// ─────────────────────────────────────────────────────────────────────────────

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _pool.on('error', (err) =>
      logger.error({ error: err.message }, 'API DB pool error'),
    );
  }
  return _pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-IP rate limiter (100 req/min)
// ─────────────────────────────────────────────────────────────────────────────

const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded — max 100 requests per minute.',
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a range string like "7d", "30d", "90d" into days (default 7). */
function parseDays(range: unknown): number {
  if (typeof range !== 'string') return 7;
  const match = range.match(/^(\d+)d$/);
  if (!match) return 7;
  const days = parseInt(match[1], 10);
  return Math.min(Math.max(days, 1), 365);
}

/** Returns a Stellar address from request params; validates basic format. */
function parseAddress(address: unknown): string | null {
  if (typeof address !== 'string') return null;
  if (address.length < 56 || !address.startsWith('G')) return null;
  return address;
}

/**
 * Returns true when the authenticated request carries an explicit operator
 * authorization (operator role/scope). Operators must be granted this
 * explicitly — a plain user token never qualifies.
 */
function isOperator(req: Request & { stellarAddress?: string }): boolean {
  const r = req as Request & {
    stellarAddress?: string;
    user?: { role?: string; scopes?: string[] };
    auth?: { role?: string; scopes?: string[] };
  };
  const role = r.user?.role ?? r.auth?.role;
  const scopes = r.user?.scopes ?? r.auth?.scopes ?? [];
  return role === 'operator' || scopes.includes('operator:read');
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const apiRouter = Router();
apiRouter.use(apiRateLimiter);

// ─── GET /api/balance/:address ────────────────────────────────────────────────

/**
 * Returns the user's current on-chain USDC balance fetched from Horizon.
 *
 * Response:
 * ```json
 * {
 *   "address": "G...",
 *   "balanceUsdc": "102.3450000",
 *   "fetchedAt": "2026-09-26T05:00:00.000Z"
 * }
 * ```
 */
apiRouter.get(
  '/api/balance/:address',
  requireAuth,
  async (req: Request & { stellarAddress?: string }, res: Response) => {
    const address = parseAddress(req.params.address);
    if (!address) {
      res.status(400).json({ error: 'Invalid Stellar address' });
      return;
    }

    // JWT sub must match the requested address (users can only see their own)
    if (req.stellarAddress && req.stellarAddress !== address) {
      res.status(403).json({ error: 'Forbidden — address mismatch with token' });
      return;
    }

    try {
      const account = await horizonServer.loadAccount(address);
      const usdcBalance = account.balances.find(
        (b) =>
          b.asset_type === 'credit_alphanum12' &&
          (b as Horizon.HorizonApi.BalanceLine<'credit_alphanum12'>).asset_code === 'USDC' &&
          (b as Horizon.HorizonApi.BalanceLine<'credit_alphanum12'>).asset_issuer === USDC_ISSUER,
      );

      res.json({
        address,
        balanceUsdc: usdcBalance ? usdcBalance.balance : '0.0000000',
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ address, error: msg }, 'Failed to fetch balance');

      if (msg.includes('Not Found')) {
        res.status(404).json({ error: 'Account not found on Stellar network' });
        return;
      }
      res.status(503).json({ error: 'Balance service unavailable' });
    }
  },
);

// ─── GET /api/earnings/:address ───────────────────────────────────────────────

/**
 * Returns the earnings time series for a user over the requested range.
 *
 * Query params:
 *  - range: "7d" | "30d" | "90d"  (default "7d")
 *
 * Response:
 * ```json
 * {
 *   "address": "G...",
 *   "range": "7d",
 *   "totalEarnings": "5.2340000",
 *   "series": [
 *     { "date": "2026-09-19", "earnings": "0.7480000" },
 *     ...
 *   ]
 * }
 * ```
 */
apiRouter.get(
  '/api/earnings/:address',
  requireAuth,
  async (req: Request & { stellarAddress?: string }, res: Response) => {
    const address = parseAddress(req.params.address);
    if (!address) {
      res.status(400).json({ error: 'Invalid Stellar address' });
      return;
    }

    if (req.stellarAddress && req.stellarAddress !== address) {
      res.status(403).json({ error: 'Forbidden — address mismatch with token' });
      return;
    }

    const days = parseDays(req.query.range);

    try {
      const pool = getPool();

      // Fetch the user row
      const userRow = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE stellar_address = $1',
        [address],
      );

      if (userRow.rowCount === 0) {
        res.json({ address, range: `${days}d`, totalEarnings: '0.0000000', series: [] });
        return;
      }

      const userId = userRow.rows[0].id;

      const rows = await pool.query<{ date: string; daily_earnings: string }>(
        `SELECT date::text, daily_earnings::text
         FROM earnings_history
         WHERE user_id = $1
           AND date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
         ORDER BY date ASC`,
        [userId, days],
      );

      const series = rows.rows.map((r) => ({
        date: r.date,
        earnings: r.daily_earnings,
      }));

      const total = series
        .reduce((sum, r) => sum + parseFloat(r.earnings), 0)
        .toFixed(7);

      res.json({ address, range: `${days}d`, totalEarnings: total, series });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ address, error: msg }, 'Failed to fetch earnings');
      res.status(503).json({ error: 'Earnings service unavailable' });
    }
  },
);

// ─── GET /api/transactions/:address ──────────────────────────────────────────

/**
 * Returns paginated transaction history for a user.
 *
 * Query params:
 *  - page:  integer ≥ 1  (default 1)
 *  - limit: 1–100        (default 10)
 *
 * Response:
 * ```json
 * {
 *   "address": "G...",
 *   "page": 1,
 *   "limit": 10,
 *   "total": 42,
 *   "transactions": [
 *     {
 *       "id": "uuid",
 *       "type": "deposit",
 *       "amount": "100.0000000",
 *       "txHash": "abc...",
 *       "timestamp": "2026-09-26T00:00:00.000Z"
 *     },
 *     ...
 *   ]
 * }
 * ```
 */
apiRouter.get(
  '/api/transactions/:address',
  requireAuth,
  async (req: Request & { stellarAddress?: string }, res: Response) => {
    const address = parseAddress(req.params.address);
    if (!address) {
      res.status(400).json({ error: 'Invalid Stellar address' });
      return;
    }

    // Ownership check: a user may only inspect their own transaction history.
    // Operators require explicit authorization to read any address.
    const ownsAddress = req.stellarAddress === address;
    if (!ownsAddress && !isOperator(req)) {
      // Do not reveal whether the address exists or has any jobs.
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(
      Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10),
      100,
    );
    const offset = (page - 1) * limit;

    try {
      const pool = getPool();

      const userRow = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE stellar_address = $1',
        [address],
      );

      if (userRow.rowCount === 0) {
        // Missing identifier: return an empty page without leaking contents.
        res.json({ address, page, limit, total: 0, transactions: [] });
        return;
      }

      const userId = userRow.rows[0].id;

      const countRow = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM transactions WHERE user_id = $1',
        [userId],
      );
      const total = parseInt(countRow.rows[0]?.count ?? '0', 10);

      const rows = await pool.query<{
        id: string;
        type: string;
        amount: string;
        tx_hash: string;
        created_at: string;
      }>(
        `SELECT id, type, amount::text, tx_hash, created_at::text
         FROM transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );

      const transactions = rows.rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        txHash: r.tx_hash,
        timestamp: r.created_at,
      }));

      res.json({ address, page, limit, total, transactions });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ address, error: msg }, 'Failed to fetch transactions');
      res.status(503).json({ error: 'Transactions service unavailable' });
    }
  },
);
