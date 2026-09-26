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

    if (req.stellarAddress && req.stellarAddress !== address) {
      res.status(403).json({ error: 'Forbidden — address mismatch with token' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10)));
    const offset = (page - 1) * limit;

    try {
      const pool = getPool();

      const userRow = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE stellar_address = $1',
        [address],
      );

      if (userRow.rowCount === 0) {
        res.json({ address, page, limit, total: 0, transactions: [] });
        return;
      }

      const userId = userRow.rows[0].id;

      // Union deposits + withdrawals, ordered by timestamp descending
      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM (
           SELECT id FROM deposits WHERE user_id = $1
           UNION ALL
           SELECT id FROM withdrawals WHERE user_id = $1
         ) t`,
        [userId],
      );

      const total = parseInt(countResult.rows[0].count, 10);

      const rows = await pool.query<{
        id: string;
        type: string;
        amount: string;
        tx_hash: string;
        timestamp: string;
      }>(
        `SELECT id::text, 'deposit' AS type, amount::text, tx_hash, timestamp::text
         FROM deposits WHERE user_id = $1
         UNION ALL
         SELECT id::text, 'withdrawal' AS type, amount::text, tx_hash, timestamp::text
         FROM withdrawals WHERE user_id = $1
         ORDER BY timestamp DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );

      const transactions = rows.rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        txHash: r.tx_hash,
        timestamp: r.timestamp,
      }));

      res.json({ address, page, limit, total, transactions });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ address, error: msg }, 'Failed to fetch transactions');
      res.status(503).json({ error: 'Transaction history unavailable' });
    }
  },
);

// ─── GET /api/apy  (public) ───────────────────────────────────────────────────

/**
 * Returns current estimated APYs for all supported protocols.
 *
 * Response:
 * ```json
 * {
 *   "updatedAt": "2026-09-26T05:00:00.000Z",
 *   "protocols": {
 *     "blend":        { "apy": 5.8, "risk": "low"    },
 *     "dex":          { "apy": 9.2, "risk": "medium" },
 *     "conservative": { "apy": 5.8, "risk": "low"    },
 *     "balanced":     { "apy": 7.5, "risk": "medium" },
 *     "growth":       { "apy": 9.2, "risk": "high"   }
 *   }
 * }
 * ```
 */
apiRouter.get('/api/apy', async (_req: Request, res: Response) => {
  // In production: fetch from Blend oracle or on-chain call
  // Using representative values for now; the AI agent updates these
  const protocols = {
    blend: { apy: parseFloat(process.env.BLEND_APY || '5.8'), risk: 'low' },
    dex: { apy: parseFloat(process.env.DEX_APY || '9.2'), risk: 'medium' },
    conservative: { apy: parseFloat(process.env.BLEND_APY || '5.8'), risk: 'low' },
    balanced: { apy: parseFloat(process.env.BALANCED_APY || '7.5'), risk: 'medium' },
    growth: { apy: parseFloat(process.env.DEX_APY || '9.2'), risk: 'high' },
  };

  res.json({ updatedAt: new Date().toISOString(), protocols });
});

// ─── GET /api/stats  (public) ─────────────────────────────────────────────────

/**
 * Returns vault-wide TVL, total users, and protocol breakdown.
 *
 * Response:
 * ```json
 * {
 *   "tvlUsdc": "254321.0000000",
 *   "totalUsers": 312,
 *   "protocolBreakdown": {
 *     "blend": "180000.0000000",
 *     "dex":   "74321.0000000",
 *     "idle":  "0.0000000"
 *   },
 *   "updatedAt": "2026-09-26T05:00:00.000Z"
 * }
 * ```
 */
apiRouter.get('/api/stats', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();

    const [usersResult, depositResult] = await Promise.all([
      pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users'),
      pool.query<{ total: string }>(
        "SELECT COALESCE(SUM(amount), 0)::text AS total FROM deposits",
      ),
    ]);

    const withdrawResult = await pool.query<{ total: string }>(
      "SELECT COALESCE(SUM(amount), 0)::text AS total FROM withdrawals",
    );

    const totalDeposits = parseFloat(depositResult.rows[0].total);
    const totalWithdrawals = parseFloat(withdrawResult.rows[0].total);
    const tvl = Math.max(0, totalDeposits - totalWithdrawals).toFixed(7);
    const totalUsers = parseInt(usersResult.rows[0].count, 10);

    // Protocol breakdown — these would come from on-chain state in production
    const tvlNum = parseFloat(tvl);
    res.json({
      tvlUsdc: tvl,
      totalUsers,
      protocolBreakdown: {
        blend: (tvlNum * 0.7).toFixed(7),
        dex: (tvlNum * 0.3).toFixed(7),
        idle: '0.0000000',
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, 'Failed to fetch stats');
    res.status(503).json({ error: 'Stats service unavailable' });
  }
});

export default apiRouter;
