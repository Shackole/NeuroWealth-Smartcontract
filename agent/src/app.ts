import express, { Express } from 'express';
import { apiRouter } from './api';
import { ipRateLimiter, userRateLimiter } from './rateLimiter';
import healthRouter from './health';

export function createApp(options?: { enableRateLimit?: boolean }): Express {
  const app = express();
  app.use(express.json());

  if (options?.enableRateLimit ?? true) {
    app.use(ipRateLimiter);
    app.use(userRateLimiter);
  }

  app.use(healthRouter);
  app.use('/api', apiRouter);

  return app;
}

export const app = createApp();
export default app;
