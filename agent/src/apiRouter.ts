/**
 * REST API — earnings and balance endpoints for frontend (#31)
 *
 * All endpoints require JWT auth (via `requireAuth` middleware) except
 * GET /api/stats and GET /api/apy which are public.
 *
 * Endpoints:
 *  GET /api/balance/:address          — current on-chain USDC balance
 *  GET /api/portfolio/:address        — on-chain vault share balance + underlying value
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
 * Convert a raw integer amount (in the asset's smallest unit) to a decimal
 * string with the given number of decimals, preserving full integer precision.
 * Uses BigInt only — never floating point.
 */
function formatUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = decimals > 0 ? '.' + frac.toString().padStart(decimals, '0') : '';
  return `${negative ? '-' : ''}${whole.toString()}${fracStr}`;
}

/**
 * Compute the underlying asset value of a share balance given the vault's
 * on-chain share price (assets per share, scaled by `decimals`).
 * Returns the value in the same smallest-unit scale as the share price.
 * Integer math only — no floating point.
 */
function sharesToAssets(
  shares: bigint,
  assetsPerShare: bigint,
  decimals: number,
): bigint {
  const scale = 10n ** BigInt(decimals);
  return (shares * assetsPerShare) / scale;
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

// ─── GET /api/portfolio/:address ─────────────────────────────────────────────

/**
 * Returns the user's on-chain vault position: share balance and the underlying
 * asset value derived from the vault's current on-chain share price.
 *
 * Values are read from the Soroban vault (share balance + share price) rather
 * than a fixed exchange rate, so yield accrues without a new deposit.
 *
 * All monetary values are integer strings in the asset's smallest unit
 * (7 decimals for Stellar assets) — no floating point is used.
 *
 * If the on-chain read fails, the response is marked `stale: true` and the
 * last known values are returned (or zeros) — never invented values.
 *
 * Response:
 * ```json
 * {
 *   "address": "G...",
 *   "shares": "1000000000",
 *   "assetsPerShare": "10500000",
 *   "underlyingValue": "1050000000",
 *   "decimals": 7,
 *   "stale": false,
 *   "fetchedAt": "2026-09-26T05:00:00.000Z"
 * }
 * ```
 */
apiRouter.get(
  '/api/portfolio/:address',
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

    const decimals = 7;

    try {
      const pool = getPool();

      // Read the latest on-chain snapshot persisted by the vault indexer.
      // `shares` and `assets_per_share` are stored as integer strings in the
      // asset's smallest unit; `observed_at` records when the chain was read.
      const snapshot = await pool.query<{
        shares: string;
        assets_per_share: string;
        observed_at: string;
      }>(
        `SELECT shares::text, assets_per_share::text, observed_at::text
         FROM vault_positions
         WHERE stellar_address = $1
         ORDER BY observed_at DESC
         LIMIT 1`,
        [address],
      );

      if (snapshot.rowCount === 0) {
        // No on-chain data yet — report zeros but mark stale so the client
        // does not treat them as authoritative.
        res.json({
          address,
          shares: '0',
          assetsPerShare: '0',
          underlyingValue: '0',
          decimals,
          stale: true,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      const row = snapshot.rows[0];
      const shares = BigInt(row.shares);
      const assetsPerShare = BigInt(row.assets_per_share);
      const underlyingValue = sharesToAssets(shares, assetsPerShare, decimals);

      res.json({
        address,
        shares: shares.toString(),
        assetsPerShare: assetsPerShare.toString(),
        underlyingValue: underlyingValue.toString(),
        underlyingValueFormatted: formatUnits(underlyingValue, decimals),
        decimals,
        stale: false,
        fetchedAt: new Date(row.observed_at).toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ address, error: msg }, 'Failed to fetch portfolio');

      // RPC/DB unavailable — mark stale rather than inventing values.
      res.status(503).json({
        address,
        shares: '0',
        assetsPerShare: '0',
        underlyingValue: '0',
        decimals,
        stale: true,
        fetchedAt: new Date().toISOString(),
        error: 'Portfolio data unavailable',
      });
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
  '/api/transactions/:ad