# LendLite API image — used by docker compose locally and by Railway in production.
# Multi-stage: compile with dev tools, then ship only what runtime needs (smaller, fewer CVEs).

# ---- base: shared OS layer ----
# Debian slim (glibc), not Alpine: bcrypt and Prisma ship prebuilt glibc binaries
FROM node:24.22.1-bookworm-slim AS base
# Prisma's query engine needs OpenSSL to talk TLS to Postgres
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- build: all deps + TypeScript compile ----
FROM base AS build
# Copy manifests first: this layer stays cached until dependencies change
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---- prod-deps: runtime dependencies only (no jest, tsx, typescript…) ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
# Don't run as root: a compromised process can't take over the container.
# uploads/ must be writable by that user (mount a volume here in production).
RUN mkdir -p uploads && chown node:node uploads
USER node

# Default port; Railway overrides it with its own PORT env var
ENV PORT=4001
EXPOSE 4001

# Used by docker compose (Railway uses its own HTTP healthcheck)
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, then start. `exec` makes node PID 1 so it receives
# SIGTERM directly and our graceful shutdown in server.ts runs.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]
