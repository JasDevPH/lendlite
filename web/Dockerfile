# LendLite web image — used by docker compose locally and by Railway in production.
# Next.js "standalone" output: the runtime image has no npm install, just server.js
# and the traced files it needs.

# ---- base: same OS as the API image ----
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: cached until package*.json changes ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined into the browser JavaScript AT BUILD TIME,
# so the API URL is a build argument, not a runtime env var.
# (Railway passes a service variable with the same name to this ARG automatically.)
ARG NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# public/ may be empty, and git doesn't track empty folders
RUN mkdir -p public && npm run build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
# Listen on all interfaces inside the container (not just localhost)
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# server.js serves public/ and .next/static only if they're copied next to it
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Non-root, like the API image
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# node directly (not npm): receives SIGTERM for a clean shutdown
CMD ["node", "server.js"]
