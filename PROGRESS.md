# LendLite — Build Progress

Tracks what has been built, phase by phase. Updated at the end of each component/phase.

## Phase 1 — Backend foundation ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | `api/package.json` + `tsconfig.json` | Done | Express 4, helmet, cors, pino, Zod 3, dotenv; dev: TypeScript 5 (strict), tsx, pino-pretty. Scripts: `dev`, `build`, `start`, `typecheck`. Root `.gitignore` added. |
| 2 | `config/env.ts` | Done | Zod-validated env vars, typed `env` export, fails fast on boot with a readable list of problems. `api/.env.example` added (local `.env` is gitignored). |
| 3 | `lib/logger.ts` | Done | pino logger: pretty in dev, JSON in prod, silent in test; redacts auth header/password/token fields. |
| 4 | `utils/AppError.ts` + `middleware/errorHandler.ts` | Done | `AppError(statusCode, code, message, details?)`; handler maps AppError / ZodError (400) / bad JSON (400) / oversized body (413) / unknown route (404) / bugs (500, logged, no leak). |
| 4b | Dev scripts: `secret:jwt`, `db:neon` | Done | Random 512-bit JWT secret → `.env`. Neon project `lendlite` (id `odd-dream-83370129`, Sydney, PG 16) created; `DATABASE_URL` → `.env`. Idempotent. `api/scripts/` is gitignored (local only); checked via `npm run typecheck:scripts`. |
| 5 | `app.ts` + `server.ts` with `/health` | Done | helmet, CORS (`WEB_ORIGIN`), JSON body limit 100kb, pino-http request logs (trimmed), `/api/v1` router, `GET /health` → 200. `server.ts`: friendly EADDRINUSE error + graceful SIGINT/SIGTERM shutdown. API port moved to **4001**. |
| 6 | `docker-compose.yml` (Postgres only) | Done | Offline alternative to Neon. `postgres:16-alpine`, host port **5433** (5432 taken by another local stack), localhost-only bind, named volume, `pg_isready` healthcheck. Verified healthy + data persists across restart. |

**Done when:** `docker compose up -d db` + `npm run dev` → `GET /api/v1/health` returns 200.

**Database options** (set `DATABASE_URL` in `api/.env`):
- Neon (cloud, default now): written by `npm run db:neon`
- Docker (offline): `postgresql://lendlite:lendlite@localhost:5433/lendlite`

### Decisions
- **TypeScript pinned to 5.x** — npm defaulted to TS 7 (Go port); ts-jest and most tooling still target TS 5.
- **Express 4** (not 5) — the spec uses an async wrapper for error handling, which is the Express 4 pattern.
- **CommonJS output** — simplest setup for Jest/ts-jest in Phase 7.
- **`module`/`moduleResolution: node16` + `types: ["node"]`** — fixes editor errors under VS Code's bundled TS 6 (node10 resolution deprecated, `@types/node` no longer auto-included). Verified clean on TS 5 and TS 6.
- **Neon (serverless Postgres, Sydney) for the dev database** — added at user request. Docker Compose Postgres remains for the Phase 11 "fresh clone" setup.
- ESLint + Prettier are deferred to a later component; `typecheck` script exists now.

## Phase 2 — Database schema ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | Done | Prisma **6.19** (stable; 8 is RC, 7 needs adapter/config). 3 enums, 5 models per spec + FK indexes on `Document.applicationId` and `AuditLog(applicationId, createdAt)`. `overrides: deepmerge-ts ^8` fixes a CLI-only vuln → `npm audit` 0. Validated + client generated. |
| 2 | First migration | Done | `20261019042311_init` applied to **Neon** (`migrate dev`) and **Docker** (`migrate deploy`); both in sync. Scripts: `db:migrate`, `db:deploy`, `db:studio`. |
| 3 | `lib/prisma.ts` | Done | Singleton PrismaClient, logs via pino (SQL queries at debug in dev). `/health` pings DB (`SELECT 1`) → 200 `database: ok` or 503 `SERVICE_UNAVAILABLE`. `$disconnect()` on shutdown. Verified on Neon, Docker, and Docker stopped. |
| 4 | `prisma/seed.ts` | Done | Upserts `admin@lendlite.dev` / `customer@lendlite.dev` with bcrypt cost 12. Idempotent; refuses to run in production. `npm run db:seed`. `typecheck` now also covers `prisma/`. Seeded on Neon + Docker. |

**Done when:** `npx prisma migrate dev` succeeds, `npx prisma db seed` creates both users, `/health` reports DB ok.

## Phase 3 — Authentication (in progress)

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | `auth.schema.ts` | Done | Zod `registerSchema` (email trimmed+lowercased; password 8–72, letter+number; fullName 2–100) and `loginSchema`. Unknown keys (e.g. `role`) stripped. Inferred types exported. |
| 2 | `auth.service.ts` (register/login/hash/sign) | Todo | |
| 3 | `auth.controller.ts` + routes | Todo | |
| 4 | `middleware/auth.ts` | Todo | |
| 5 | `middleware/requireRole.ts` | Todo | |
| 6 | Rate limiter | Todo | |

**Done when:** register, login, and `/auth/me` work via curl; wrong password → 401; 6th login in a minute → 429.

## Phases overview
- [x] Phase 1 — Backend foundation
- [x] Phase 2 — Database schema
- [ ] Phase 3 — Authentication
- [ ] Phase 4 — Calculator + applications
- [ ] Phase 5 — Documents
- [ ] Phase 6 — Admin review
- [ ] Phase 7 — Backend tests
- [ ] Phase 8 — Frontend setup & auth
- [ ] Phase 9 — Customer UI
- [ ] Phase 10 — Admin UI
- [ ] Phase 11 — DevOps & polish
