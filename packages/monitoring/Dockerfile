FROM node:20-alpine AS vault-client-build

WORKDIR /workspace/packages/vault-client
COPY packages/vault-client/package*.json ./
RUN npm ci
COPY packages/vault-client/src ./src
COPY packages/vault-client/tsconfig.json ./tsconfig.json
RUN npm run build

FROM node:20-alpine AS monitoring-build

WORKDIR /workspace/packages/monitoring
COPY packages/monitoring/package*.json ./
COPY --from=vault-client-build /workspace/packages/vault-client /workspace/packages/vault-client
RUN npm ci
COPY packages/monitoring/src ./src
COPY packages/monitoring/tsconfig.json ./tsconfig.json
RUN npm run build

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app/packages/monitoring

COPY packages/monitoring/package*.json ./
COPY packages/vault-client/package*.json /app/packages/vault-client/
COPY --from=vault-client-build /workspace/packages/vault-client/dist /app/packages/vault-client/dist
RUN npm ci --omit=dev

COPY --from=monitoring-build /workspace/packages/monitoring/dist ./dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)}).on('error', () => process.exit(1))"

CMD ["npm", "start"]
