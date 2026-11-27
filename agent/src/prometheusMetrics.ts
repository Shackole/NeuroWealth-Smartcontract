import type { RequestHandler } from 'express';
import { Registry } from 'prom-client';

export const agentMetricsRegistry = new Registry();

export const serveAgentMetrics: RequestHandler = async (_req, res, next) => {
  try {
    res.set('Content-Type', agentMetricsRegistry.contentType);
    res.send(await agentMetricsRegistry.metrics());
  } catch (error) {
    next(error);
  }
};
