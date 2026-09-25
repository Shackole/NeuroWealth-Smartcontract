import request from 'supertest';
import { pool } from '../db';
import { createApp } from '../app';
import { apiRouter } from '../api';
import { generateToken, JWT_SECRET, UserPayload } from '../auth';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import express from 'express';

const app = createApp({ enableRateLimit: false });

describe('Backend API Integration Tests — Real DB & Supertest', () => {
  let testUser: { id: string; stellarAddress: string };
  let validToken: string;

  beforeAll(async () => {
    // Ensure test database connection
    try {
      await pool.query('SELECT 1');
    } catch (err: any) {
      console.error('Database connection failed. Ensure PostgreSQL is running on port 5432:', err.message);
      throw err;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Reset database state to guarantee test isolation
    await pool.query(
      'TRUNCATE TABLE audit_logs, earnings_history, yield_snapshots, rebalances, withdrawals, deposits, users CASCADE'
    );

    // Create a base user for tests requiring authentication
    const userRes = await pool.query(
      `INSERT INTO users (stellar_address, strategy_preference)
       VALUES ('GDTESTUSERSTRLNGADDR123456789012345678901234567890', 'balanced')
       RETURNING id, stellar_address, strategy_preference`
    );

    testUser = {
      id: userRes.rows[0].id,
      stellarAddress: userRes.rows[0].stellar_address,
    };

    validToken = generateToken({
      userId: testUser.id,
      stellarAddress: testUser.stellarAddress,
    });
  });

  // ====================================================
  // 1. Authentication Enforcement Tests (/api/auth/*)
  // ====================================================
  describe('Authentication Enforcement (/api/auth/* and protected endpoints)', () => {
    it('rejects protected endpoint when JWT token is missing with 401', async () => {
      const res = await request(app).get('/api/balance');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.code).toBe('AUTH_TOKEN_MISSING');
    });

    it('rejects protected endpoint when JWT token is expired with 401', async () => {
      const expiredToken = jwt.sign(
        { userId: testUser.id, stellarAddress: testUser.stellarAddress },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/balance')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_TOKEN_EXPIRED');
    });

    it('rejects protected endpoint when JWT token is invalid with 401', async () => {
      const res = await request(app)
        .get('/api/balance')
        .set('Authorization', 'Bearer invalid-token-string');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('POST /api/auth/login creates/authenticates user and returns valid JWT token', async () => {
      const stellarAddress = 'GBNEWUSERSTRLNGADDR987654321098765432109876543210';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ stellarAddress });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({
        stellarAddress,
        strategyPreference: 'balanced',
      });
      expect(res.body.user.id).toBeDefined();

      // Verify user was inserted into the real database
      const dbCheck = await pool.query('SELECT * FROM users WHERE stellar_address = $1', [stellarAddress]);
      expect(dbCheck.rows.length).toBe(1);
      expect(dbCheck.rows[0].id).toBe(res.body.user.id);
    });

    it('POST /api/auth/login rejects empty stellarAddress with 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    it('GET /api/auth/verify accepts valid JWT and returns user payload', async () => {
      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.user.userId).toBe(testUser.id);
    });
  });

  // ====================================================
  // 2. Balance Endpoint Tests (/api/balance)
  // ====================================================
  describe('Balance Endpoint (/api/balance)', () => {
    it('returns zero balance and correct schema for a user with no transactions', async () => {
      const res = await request(app)
        .get('/api/balance')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        balance: 0,
        shares: 0,
        strategy: 'balanced',
        exchangeRate: 1.042,
      });
    });

    it('computes correct net balance after deposits and withdrawals', async () => {
      // Direct DB insert of 100 deposit and 30 withdrawal
      await pool.query(
        `INSERT INTO deposits (user_id, amount, shares, tx_hash)
         VALUES ($1, 100.0, 95.0, 'tx_dep_1')`,
        [testUser.id]
      );
      await pool.query(
        `INSERT INTO withdrawals (user_id, amount, shares, tx_hash)
         VALUES ($1, 30.0, 28.5, 'tx_with_1')`,
        [testUser.id]
      );

      const res = await request(app)
        .get('/api/balance')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.balance).toBe(70);
      expect(res.body.shares).toBe(66.5);
      expect(res.body.strategy).toBe('balanced');
      expect(res.body.exchangeRate).toBe(1.042);
    });
  });

  // ====================================================
  // 3. Earnings Endpoint Tests (/api/earnings)
  // ====================================================
  describe('Earnings Endpoint (/api/earnings)', () => {
    it('returns earnings summary and history schema', async () => {
      // Insert simulated daily earnings
      const todayDate = new Date().toISOString().split('T')[0];
      await pool.query(
        `INSERT INTO earnings_history (user_id, daily_earnings, date)
         VALUES ($1, 2.50, $2)`,
        [testUser.id, todayDate]
      );

      const res = await request(app)
        .get('/api/earnings')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.today).toBe(2.5);
      expect(res.body.week).toBe(2.5);
      expect(res.body.month).toBe(2.5);
      expect(Array.isArray(res.body.history)).toBe(true);
      expect(res.body.history.length).toBe(1);
    });
  });

  // ====================================================
  // 4. Transactions Endpoint Tests & DB State Verification (/api/transactions)
  // ====================================================
  describe('Transactions Endpoint (/api/transactions)', () => {
    it('POST /api/transactions creates deposit, records audit log, and verifies DB state', async () => {
      const payload = {
        type: 'deposit',
        amount: 250.75,
        shares: 240.50,
        txHash: 'tx_stellar_deposit_hash_999',
      };

      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.transaction).toMatchObject({
        type: 'deposit',
        amount: 250.75,
        shares: 240.5,
        txHash: payload.txHash,
      });

      // Verify real database state in deposits table
      const dbDeposit = await pool.query(
        'SELECT * FROM deposits WHERE tx_hash = $1',
        [payload.txHash]
      );
      expect(dbDeposit.rows.length).toBe(1);
      expect(parseFloat(dbDeposit.rows[0].amount)).toBe(250.75);
      expect(parseFloat(dbDeposit.rows[0].shares)).toBe(240.5);
      expect(dbDeposit.rows[0].user_id).toBe(testUser.id);

      // Verify audit_logs table entry
      const auditLog = await pool.query(
        'SELECT * FROM audit_logs WHERE record_id = $1',
        [dbDeposit.rows[0].id]
      );
      expect(auditLog.rows.length).toBe(1);
      expect(auditLog.rows[0].table_name).toBe('deposits');
      expect(auditLog.rows[0].action).toBe('INSERT');
    });

    it('POST /api/transactions creates withdrawal and validates DB state', async () => {
      const payload = {
        type: 'withdraw',
        amount: 50.0,
        shares: 48.0,
        txHash: 'tx_stellar_withdraw_hash_888',
      };

      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const dbWithdraw = await pool.query(
        'SELECT * FROM withdrawals WHERE tx_hash = $1',
        [payload.txHash]
      );
      expect(dbWithdraw.rows.length).toBe(1);
      expect(parseFloat(dbWithdraw.rows[0].amount)).toBe(50.0);
    });

    it('POST /api/transactions rejects invalid inputs with 400', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ type: 'invalid_type', amount: -10, shares: 0 });

      expect(res.status).toBe(400);
    });

    it('GET /api/transactions returns user transaction history', async () => {
      await pool.query(
        `INSERT INTO deposits (user_id, amount, shares, tx_hash)
         VALUES ($1, 15.0, 14.5, 'tx_history_1')`,
        [testUser.id]
      );

      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.transactions)).toBe(true);
      expect(res.body.transactions.length).toBe(1);
      expect(res.body.transactions[0].txHash).toBe('tx_history_1');
    });
  });

  // ====================================================
  // 5. APY & Stats Endpoints (/api/apy, /api/stats)
  // ====================================================
  describe('Public Analytics Endpoints (/api/apy, /api/stats)', () => {
    it('GET /api/apy returns current strategy yields and metadata schema', async () => {
      const res = await request(app).get('/api/apy');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('conservative');
      expect(res.body).toHaveProperty('balanced');
      expect(res.body).toHaveProperty('growth');
      expect(res.body.balanced.apy).toBe(8.4);
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /api/stats computes aggregate TVL, user counts, and active strategies', async () => {
      // Insert another user with conservative strategy and deposits
      const otherUser = await pool.query(
        `INSERT INTO users (stellar_address, strategy_preference)
         VALUES ('GBCONSERVATIVEUSER2222222222222222222222222222222', 'conservative')
         RETURNING id`
      );
      await pool.query(
        `INSERT INTO deposits (user_id, amount, shares, tx_hash)
         VALUES ($1, 500.0, 480.0, 'tx_stats_dep_1')`,
        [otherUser.rows[0].id]
      );

      const res = await request(app).get('/api/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(2);
      expect(res.body.totalDeposits).toBe(500);
      expect(res.body.tvl).toBe(500);
      expect(res.body.activeStrategies.conservative).toBe(1);
      expect(res.body.activeStrategies.balanced).toBe(1);
    });
  });

  // ====================================================
  // 6. Rate Limit Tests (429 Enforcement)
  // ====================================================
  describe('Rate Limiting (429 after exceeding configured limit)', () => {
    it('returns 429 and Retry-After header when rate limit threshold is exceeded', async () => {
      const limitedApp = express();
      limitedApp.use(express.json());

      const strictLimiter = rateLimit({
        windowMs: 60000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: true,
        handler: (_req, res) => {
          res.setHeader('Retry-After', '60');
          res.status(429).json({
            error: 'Too many requests, please try again later.',
            retryAfterSeconds: 60,
          });
        },
      });

      limitedApp.use('/api', strictLimiter, apiRouter);

      // Make 3 allowed requests
      for (let i = 0; i < 3; i++) {
        const res = await request(limitedApp).get('/api/apy');
        expect(res.status).toBe(200);
      }

      // 4th request must be rate limited with HTTP 429
      const rateLimitedRes = await request(limitedApp).get('/api/apy');
      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.headers['retry-after']).toBe('60');
      expect(rateLimitedRes.body.error).toMatch(/too many requests/i);
    });
  });

  // ====================================================
  // 7. Isolation Verification
  // ====================================================
  describe('Database Isolation Check', () => {
    it('confirms previous test writes did not leak into new test run', async () => {
      // The beforeEach hook truncated all tables and inserted only testUser
      const usersRes = await pool.query('SELECT * FROM users');
      expect(usersRes.rows.length).toBe(1);
      expect(usersRes.rows[0].id).toBe(testUser.id);

      const depositsRes = await pool.query('SELECT * FROM deposits');
      expect(depositsRes.rows.length).toBe(0);

      const withdrawalsRes = await pool.query('SELECT * FROM withdrawals');
      expect(withdrawalsRes.rows.length).toBe(0);

      const auditRes = await pool.query('SELECT * FROM audit_logs');
      expect(auditRes.rows.length).toBe(0);
    });
  });
});
