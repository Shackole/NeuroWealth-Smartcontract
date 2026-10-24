# Service container builds

The agent, WhatsApp handler, and monitoring service use exact Node.js Alpine
release tags and committed npm lockfiles. Runtime stages install only
production dependencies, copy compiled output instead of source trees, and run
as the unprivileged `node` account. Health checks use Node's built-in HTTP
client rather than adding shell utilities to the runtime image.

| Service | Dockerfile | Build context | Runtime command |
|---|---|---|---|
| Agent | `agent/Dockerfile` | `agent/` | `node dist/index.js` |
| WhatsApp | `whatsapp/Dockerfile` | `whatsapp/` | `node dist/index.js` |
| Monitoring | `packages/monitoring/Dockerfile` | repository root | `node dist/index.js` |

Build monitoring through `packages/monitoring/docker-compose.yml` so its
relative `file:../vault-client` dependency is included in the build context.
Prometheus and Grafana images in both monitoring Compose files use fixed
version tags. Supply `GRAFANA_ADMIN_PASSWORD` through a local secrets manager
or deployment environment; Compose intentionally has no default password.

Do not pass production credentials as Docker build arguments or copy `.env`
files into an image. Local `.dockerignore` files exclude environment files,
generated output, caches, and test sources from image contexts.
