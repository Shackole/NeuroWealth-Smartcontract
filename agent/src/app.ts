import express, { Express } from 'express';
import { apiRouter } from './api';
import { ipRateLimiter, userRateLimiter } from './rateLimiter';
import healthRouter from './health';
import { requestContextMiddleware } from './requestContext';

export function createApp(options?: { enableRateLimit?: boolean }): Express {
  const app = express();
  app.use(express.json());

  // Attach requestId to every request via AsyncLocalStorage (Issue #121)
  app.use(requestContextMiddleware);

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
