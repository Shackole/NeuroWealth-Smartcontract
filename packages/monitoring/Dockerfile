FROM node:22.23.2-alpine3.24 AS builder

WORKDIR /workspace

COPY packages/vault-client/package.json packages/vault-client/package-lock.json ./packages/vault-client/
RUN npm ci --prefix packages/vault-client
COPY packages/vault-client/ ./packages/vault-client/
RUN npm run build --prefix packages/vault-client

COPY packages/monitoring/package.json packages/monitoring/package-lock.json ./packages/monitoring/
RUN npm ci --prefix packages/monitoring
COPY packages/monitoring/ ./packages/monitoring/
RUN npm run build --prefix packages/monitoring
RUN npm prune --omit=dev --prefix packages/monitoring

FROM node:22.23.2-alpine3.24 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /app/logs && chown node:node /app/logs
COPY --from=builder --chown=node:node /workspace/packages/monitoring/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/packages/monitoring/dist ./dist
COPY --from=builder --chown=node:node /workspace/packages/vault-client/dist ./node_modules/@neurowealth/vault-client/dist
COPY --from=builder --chown=node:node /workspace/packages/vault-client/package.json ./node_modules/@neurowealth/vault-client/package.json
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

USER node
CMD ["node", "dist/index.js"]
