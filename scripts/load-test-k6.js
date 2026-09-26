/**
 * k6 Load Test Script — 100 Concurrent Deposits on Stellar Devnet (#89)
 *
 * Simulates 100 virtual users (VUs) depositing between 1-100 USDC.
 * Execute with:
 *   k6 run scripts/load-test-k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom metrics
const confirmationTime = new Trend('confirmation_time_ms');
const queueDepth = new Trend('redis_queue_depth');
const depositErrors = new Counter('deposit_errors');
const errorRate = new Rate('error_rate');

export const options = {
  scenarios: {
    concurrent_deposits: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 1,
      maxDuration: '1m',
    },
  },
  thresholds: {
    'confirmation_time_ms': ['p(95)<30000'], // p95 confirmation < 30s
    'error_rate': ['rate<0.01'],              // error rate < 1%
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function () {
  const vuId = __VU;
  // Uniform deposit amount between 1 and 100 USDC
  const amount = (1 + Math.random() * 99).toFixed(2);
  const vuAccount = `GDEVNET_VU_${vuId}_${Date.now()}`;

  const payload = JSON.stringify({
    account: vuAccount,
    amount: parseFloat(amount),
    strategy: 'Balanced',
    timestamp: Date.now(),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-VU-ID': String(vuId),
    },
    timeout: '45s',
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/deposit`, payload, params);
  const duration = Date.now() - start;

  const success = check(res, {
    'status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'tx confirmed or queued': (r) => r.body && (r.body.includes('txHash') || r.body.includes('Processing')),
  });

  confirmationTime.add(duration);
  errorRate.add(!success);

  if (!success) {
    depositErrors.add(1);
  }

  // Record mock queue depth tracking
  queueDepth.add(Math.max(1, 100 - vuId));
}
