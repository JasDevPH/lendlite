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

## Phase 3 — Authentication ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | `auth.schema.ts` | Done | Zod `registerSchema` (email trimmed+lowercased; password 8–72, letter+number; fullName 2–100) and `loginSchema`. Unknown keys (e.g. `role`) stripped. Inferred types exported. |
| 2 | `auth.service.ts` (register/login/hash/sign) | Done | bcrypt cost 12; JWT HS256 `{sub, role}` 1h, algorithm pinned, payload Zod-validated. Register → CUSTOMER only, 409 `EMAIL_TAKEN` (incl. P2002 race). Login → 401 `INVALID_CREDENTIALS` (same msg + dummy-hash timing defence). `getCurrentUser`. `passwordHash` never returned. |
| 3 | `auth.controller.ts` + routes | Done | `POST /auth/register` (201) and `POST /auth/login` live. Added `utils/asyncHandler.ts`, `middleware/validate.ts` (parsed output replaces req parts), `types/express.d.ts` (`req.user`). `me` controller ready; its route lands with the auth middleware. Verified via curl: 201/409/400/200/401/400. |
| 4 | `middleware/auth.ts` | Done | `requireAuth`: parses `Bearer` header (case-insensitive), verifies JWT, sets `req.user = {id, role}`; 401 otherwise. `GET /auth/me` live. Verified 8 header/token cases. |
| 5 | `middleware/requireRole.ts` | Done | `requireRole(...roles)` factory → 403 `FORBIDDEN` on wrong role; 401 if `req.user` missing (fails closed). Tested on a throwaway app (admin routes come in Phase 6). |
| 6 | Rate limiter | Done | `express-rate-limit` v8: `loginLimiter` 5/min/IP on `/auth/login`, `authLimiter` 30/min/IP on all `/auth/*`. 429 `RATE_LIMITED` via errorHandler, `RateLimit` + `Retry-After` headers. In-memory store (Redis + `trust proxy` noted for deploy). Verified 6th login → 429. |

**Done when:** register, login, and `/auth/me` work via curl; wrong password → 401; 6th login in a minute → 429.

## Phase 4 — Calculator + loan applications (in progress)

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | `utils/money.ts` | Done | `Cents`/`BasisPoints` types, `isValidCents`, `roundToCents` (throws on NaN/∞), `bpsToDecimal`, `dollarsToCents`, `formatAUD` (en-AU). |
| 2 | `utils/amortization.ts` | Done | Pure `calculateMonthlyPayment`, `generateSchedule`, `addMonths` (UTC, month-end clamp, no drift). 0% handled; last installment absorbs rounding → final balance 0. Spec example $888.49/mo ✓; 2,000 random loans pass all invariants. |
| 3 | Calculator module | Done | Public `POST /calculator/quote`. Strict-integer Zod schema using shared `config/loanRules.ts` (`LOAN_LIMITS`). Service reuses `generateSchedule`. Spec example → 88849/mo, 66186 interest ✓. |
| 4 | Applications schema | Done | `createApplicationSchema` (amount/term/purpose required, employment optional), `updateApplicationSchema` (all optional, non-empty), `applicationIdParamsSchema` (UUID). Shared `amountCentsField`/`termMonthsField`/`annualRateBpsField` moved to `config/loanRules.ts`; calculator refactored to use them. Protected fields stripped. |
| 5 | Applications service (create/list/get/update, ownership + status rules) | Todo | |
| 6 | Applications controller/routes | Todo | |
| 7 | Submit with idempotency | Todo | |
| 8 | Audit log helper | Todo | |

**Done when:** a customer can create, edit, and submit a draft; editing after submit → 409; repeated submit with same key returns same result.

## Phases overview
- [x] Phase 1 — Backend foundation
- [x] Phase 2 — Database schema
- [x] Phase 3 — Authentication
- [ ] Phase 4 — Calculator + applications
- [ ] Phase 5 — Documents
- [ ] Phase 6 — Admin review
- [ ] Phase 7 — Backend tests
- [ ] Phase 8 — Frontend setup & auth
- [ ] Phase 9 — Customer UI
- [ ] Phase 10 — Admin UI
- [ ] Phase 11 — DevOps & polish
