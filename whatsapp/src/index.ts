import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { handleWhatsAppWebhook } from './webhook';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '256kb';
const trustedProxyCidrs = (process.env.TRUSTED_PROXY_CIDRS || '')
  .split(',')
  .map((cidr) => cidr.trim())
  .filter(Boolean);
const requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 30_000);
const headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 10_000);
const keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 5_000);

if (
  !Number.isSafeInteger(requestTimeout) || requestTimeout <= 0 ||
  !Number.isSafeInteger(headersTimeout) || headersTimeout <= 0 ||
  headersTimeout > requestTimeout ||
  !Number.isSafeInteger(keepAliveTimeout) || keepAliveTimeout <= 0
) {
  throw new Error('HTTP timeout settings must be positive integers and headers timeout cannot exceed request timeout');
}

// Keep forwarding headers untrusted unless the operator supplies exact proxy
// addresses/CIDRs. Do not use a hop count: deployments can have different
// network paths and client-supplied X-Forwarded-For values must not set req.ip.
app.set('trust proxy', trustedProxyCidrs.length > 0 ? trustedProxyCidrs : false);

app.use(bodyParser.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
app.use(bodyParser.json({ limit: REQUEST_BODY_LIMIT }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'NeuroWealth WhatsApp Bot Handler' });
});

// WhatsApp Twilio Webhook route
app.post('/api/whatsapp/webhook', handleWhatsAppWebhook);

const server = app.listen(PORT, () => {
  console.log(`🚀 NeuroWealth WhatsApp Bot Handler running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/api/whatsapp/webhook`);
});
server.requestTimeout = requestTimeout;
server.headersTimeout = headersTimeout;
server.keepAliveTimeout = keepAliveTimeout;
