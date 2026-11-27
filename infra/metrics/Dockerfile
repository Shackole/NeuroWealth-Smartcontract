# RPC TLS certificate expiry exporter (Issue #788)
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY certificate-expiry.js rpc-tls-exporter.js ./

ENV NODE_ENV=production
EXPOSE 9469

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9469/healthz || exit 1

CMD ["node", "rpc-tls-exporter.js"]
