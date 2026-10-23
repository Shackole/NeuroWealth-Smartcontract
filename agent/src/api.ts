import { Router, Request, Response } from 'express';
import { pool } from './db';
import { authenticateToken, generateToken, UserPayload } from './auth';

export const apiRouter = Router();

// ==========================================
// Request validation helpers
// ==========================================

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;
const STRATEGY_NAMES = ['conservative', 'balanced', 'growth'] as const;
// Exact decimal string: no sign, no exponent, no leading zeros (except "0"), optional fraction.
const DECIMAL_RE = /^(0|[1-9]\d*)(\.\d+)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStellarAddress(value: unknown): value is string {
  return typeof value === 'string' && STELLAR_ADDRESS_RE.test(value);
}

function isPositiveDecimalString(value: unknown): value is string {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) return false;
  return /[1-9]/.test(value);
}

function isStrategyName(value: unknown): value is (typeof STRATEGY_NAMES)[number] {
  return typeof value === 'string' && (STRATEGY_NAMES as readonly string[]).includes(value);
}

function parsePagination(query: Record<string, unknown>): { limit: number; offset: number } | null {
  const rawLimit = query.limit;
  const rawOffset = query.offset;

  let limit = 50;
  let offset = 0;

  if (rawLimit !== undefined) {
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit)) return null;
    limit = parseInt(rawLimit, 10);
    if (limit < 1 || limit > 100) return null;
  }

  if (rawOffset !== undefined) {
    if (typeof rawOffset !== 'string' || !/^\d+$/.test(rawOffset)) return null;
    offset = parseInt(rawOffset, 10);
  }

  return { limit, offset };
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: string[]): string | null {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  return unknown.length > 0 ? `Unknown field(s): ${unknown.join(', ')}` : null;
}

function badRequest(res: Response, error: string): void {
  res.status(400).json({ error, code: 'INVALID_INPUT' });
}

// ==========================================
// Authentication Endpoints (/api/auth/*)
// ==========================================

apiRouter.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  if (!isPlainObject(req.body)) {
    badRequest(res, 'Request body must be a JSON object');
    return;
  }

  const unknownError = rejectUnknownFields(req.body, ['stellarAddress']);
  if (unknownError) {
    badRequest(res, unknownError);
    return;
  }

  const { stellarAddress } = req.body;

  if (!isStellarAddress(stellarAddress)) {
    badRequest(res, 'Missing or invalid stellarAddress');
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (stellar_address)
       VALUES ($1)
       ON CONFLICT (stellar_address) DO UPDATE SET updated_at = NOW()
       RETURNING id, stellar_address, strategy_preference`,
      [stellarAddress]
    );

    const user = result.rows[0];
    const payload: UserPayload = {
      userId: user.id,
      stellarAddress: user.stellar_address,
    };

    const token = generateToken(payload);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        stellarAddress: user.stellar_address,
        strategyPreference: user.strategy_preference,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database authentication error', details: err.message });
  }
});

apiRouter.get('/auth/verify', authenticateToken, (req: Request, res: Response): void => {
  res.status(200).json({
    valid: true,
    user: req.user,
  });
});

// ==========================================
// Portfolio & Balance Endpoint (/api/balance)
// ==========================================

apiRouter.get('/balance', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  try {
    const userRes = await pool.query(
      `SELECT strategy_preference FROM users WHERE id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const depRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_deposited,
              COALESCE(SUM(shares), 0) AS total_deposit_shares
       FROM deposits WHERE user_id = $1`,
      [userId]
    );

    const withRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_withdrawn,
              COALESCE(SUM(shares), 0) AS total_withdrawn_shares
       FROM withdrawals WHERE user_id = $1`,
      [userId]
    );

    const totalDeposited = parseFloat(depRes.rows[0].total_deposited);
    const totalWithdrawn = parseFloat(withRes.rows[0].total_withdrawn);
    const depositShares = parseFloat(depRes.rows[0].total_deposit_shares);
    const withdrawnShares = parseFloat(withRes.rows[0].total_withdrawn_shares);

    const balance = Math.max(0, totalDeposited - totalWithdrawn);
    const shares = Math.max(0, depositShares - withdrawnShares);

    res.status(200).json({
      balance,
      shares,
      strategy: userRes.rows[0].strategy_preference,
      exchangeRate: 1.042,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve balance', details: err.message });
  }
});

// ==========================================
// Earnings Endpoint (/api/earnings)
// ==========================================

apiRouter.get('/earnings', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  try {
    const historyRes = await pool.query(
      `SELECT date, daily_earnings
       FROM earnings_history
       WHERE user_id = $1
       ORDER BY date DESC
       LIMIT 30`,
      [userId]
    );

    let today = 0;
    let week = 0;
    let month = 0;

    const rows = historyRes.rows;
    if (rows.length > 0) {
      today = parseFloat(rows[0].daily_earnings);
      week = rows.slice(0, 7).reduce((acc, row) => acc + parseFloat(row.daily_earnings), 0);
      month = rows.reduce((acc, row) => acc + parseFloat(row.daily_earnings), 0);
    }

    res.status(200).json({
      today: Number(today.toFixed(2)),
      week: Number(week.toFixed(2)),
      month: Number(month.toFixed(2)),
      history: rows.map(r => ({
        date: r.date,
        dailyEarnings: parseFloat(r.daily_earnings),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve earnings', details: err.message });
  }
});

// ==========================================
// Transactions Endpoints (/api/transactions)
// ==========================================

apiRouter.get('/transactions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const pagination = parsePagination(req.query as Record<string, unknown>);
  if (!pagination) {
    badRequest(res, 'Invalid pagination; limit must be 1-100 and offset a non-negative integer');
    return;
  }

  try {
    const query = `
      SELECT id, 'deposit' AS type, amount, shares, tx_hash, timestamp
      FROM deposits
      WHERE user_id = $1
      UNION ALL
      SELECT id, 'withdraw' AS type, amount, shares, tx_hash, timestamp
      FROM withdrawals
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    const txRes = await pool.query(query, [userId, pagination.limit, pagination.offset]);

    res.status(200).json({
      transactions: txRes.rows.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        shares: tx.shares,
        txHash: tx.tx_hash,
        timestamp: tx.timestamp,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve transactions', details: err.message });
  }
});

apiRouter.post('/transactions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  if (!isPlainObject(req.body)) {
    badRequest(res, 'Request body must be a JSON object');
    return;
  }

  const unknownError = rejectUnknownFields(req.body, ['type', 'amount', 'shares', 'txHash']);
  if (unknownError) {
    badRequest(res, unknownError);
    return;
  }

  const { type, amount, shares, txHash } = req.body;

  if (!type || !['deposit', 'withdraw'].includes(type as string)) {
    badRequest(res, 'Invalid transaction type; must be deposit or withdraw');
    return;
  }

  if (!isPositiveDecimalString(amount)) {
    badRequest(res, 'Amount must be a positive exact decimal string');
    return;
  }

  if (!isPositiveDecimalString(shares)) {
    badRequest(res, 'Shares must be a positive exact decimal string');
    return;
  }

  if (!txHash || typeof txHash !== 'string' || !txHash.trim()) {
    badRequest(res, 'Missing or invalid txHash');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const table = type === 'deposit' ? 'deposits' : 'withdrawals';
    const insertRes = await client.query(
      `INSERT INTO ${table} (user_id, amount, shares, tx_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, amount, shares, tx_hash, timestamp`,
      [userId, amount, shares, txHash.trim()]
    );

    const record = insertRes.rows[0];

    // Audit log entry
    await client.query(
      `INSERT INTO audit_logs (table_name, action, record_id, details)
       VALUES ($1, $2, $3, $4)`,
      [table, 'INSERT', record.id, JSON.stringify({ amount, shares, txHash })]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      transaction: {
        id: record.id,
        type,
        amount: record.amount,
        shares: record.shares,
        txHash: record.tx_hash,
        timestamp: record.timestamp,
      },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Transaction failed', details: err.message });
  } finally {
    client.release();
  }
});

// ==========================================
// APY Endpoint (/api/apy)
// ==========================================

apiRouter.get('/apy', (_req: Request, res: Response): void => {
  res.status(200).json({
    conservative: { apy: 6.2, protocol: 'blend', risk: 'low' },
    balanced: { apy: 8.4, protocol: 'blend+dex', risk: 'moderate' },
    growth: { apy: 12.8, protocol: 'dex', risk: 'higher' },
    timestamp: new Date().toISOString(),
  });
});

// ==========

/* … truncated 1451 chars — edit only what you need near the top … */
