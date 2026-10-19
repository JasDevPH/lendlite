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
- **Tests use a separate `lendlite_test` DB** on local Docker Postgres, never Neon.
- **Dev-only audit findings accepted:** 20 moderate in Jest's coverage tooling (`sprintf-js`, no patched version exists). Production deps: 0. CI should run `npm audit --omit=dev`.
- **Next.js 16 (latest)**: read bundled docs (`web/node_modules/next/dist/docs`) before writing code — async `params`, `proxy` (not middleware), Cache Components on.
- **Web dev-only audit:** 5 high in ESLint's `braces` (no patched release). Web production deps: 0.
- **`CLAUDE.md` is gitignored and untracked** (kept locally only, at user request).
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

## Phase 4 — Calculator + loan applications ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | `utils/money.ts` | Done | `Cents`/`BasisPoints` types, `isValidCents`, `roundToCents` (throws on NaN/∞), `bpsToDecimal`, `dollarsToCents`, `formatAUD` (en-AU). |
| 2 | `utils/amortization.ts` | Done | Pure `calculateMonthlyPayment`, `generateSchedule`, `addMonths` (UTC, month-end clamp, no drift). 0% handled; last installment absorbs rounding → final balance 0. Spec example $888.49/mo ✓; 2,000 random loans pass all invariants. |
| 3 | Calculator module | Done | Public `POST /calculator/quote`. Strict-integer Zod schema using shared `config/loanRules.ts` (`LOAN_LIMITS`). Service reuses `generateSchedule`. Spec example → 88849/mo, 66186 interest ✓. |
| 4 | Applications schema | Done | `createApplicationSchema` (amount/term/purpose required, employment optional), `updateApplicationSchema` (all optional, non-empty), `applicationIdParamsSchema` (UUID). Shared `amountCentsField`/`termMonthsField`/`annualRateBpsField` moved to `config/loanRules.ts`; calculator refactored to use them. Protected fields stripped. |
| 5 | Applications service (create/list/get/update, ownership + status rules) | Done | create (tx + CREATED audit), listMine, get (owner/admin, incl. documents + schedule), updateDraft (owner only, atomic DRAFT-only update, P2025 → 409). Others' apps → 404. Added `types/auth.ts` (`AuthUser`). |
| 6 | Applications controller/routes | Done | `POST/GET /applications` (customer), `GET /applications/:id` (customer+admin), `PATCH /applications/:id` (customer). `requireAuth` on whole router. Verified 17 HTTP cases: 201/400/401/403/404/409. |
| 7 | Submit with idempotency | Done | `POST /applications/:id/submit`. Status machine in `applications.status.ts` (`assertTransition` → 409 `INVALID_STATUS_TRANSITION`). Optional `Idempotency-Key` (8–255): same key+app → replay (`Idempotent-Replayed: true`), other app → 409 `IDEMPOTENCY_KEY_REUSED`. Completeness → 400 `APPLICATION_INCOMPLETE`. Transaction + SUBMITTED audit; race-safe (tested 2 concurrent submits → 1 audit row). Document rule added in Phase 5. |
| 8 | Audit log helper | Done (early, with #5) | `lib/audit.ts` `recordAudit(tx, entry)` — takes a transaction client so audit rows commit atomically with the change. Typed `AuditAction` union. |

**Done when:** a customer can create, edit, and submit a draft; editing after submit → 409; repeated submit with same key returns same result.

## Phase 5 — Documents ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | Multer config (type/size limits) | Done | `middleware/upload.ts`: multer 2.4, PDF/JPG/PNG allow-list (MIME **and** extension must match), 5 MB limit, 1 file, random UUID filenames, absolute `UPLOAD_ROOT`. errorHandler: `LIMIT_FILE_SIZE` → 413 `FILE_TOO_LARGE`, other multer errors → 400. |
| 2 | Documents service | Done | `uploadDocument` (owner, DRAFT only → 409, **magic-byte check** → 400, tx + `DOCUMENT_UPLOADED` audit, relative `storagePath`), `discardUpload`, `getDocumentForDownload` (owner/admin, path-containment guard). Schema: `type` enum + doc id UUID. |
| 3 | Upload + download routes | Done | `POST /applications/:id/documents` (multipart `file` + `type`; auth/role/id checks before multer; any failure → file deleted) and `GET /documents/:id/download` (owner/admin, `attachment`, `private, no-store`, missing file → 404). Verified 16 HTTP cases; 0 orphan files. |
| 4 | Submit rule requiring ID + PAYSLIP | Done | `submitApplication` checks distinct uploaded types; 400 `APPLICATION_INCOMPLETE` with `details.missingFields` + `details.missingDocuments`. BANK_STATEMENT optional. Replay response unchanged. Verified end-to-end. |

**Done when:** uploads saved with random names, bad type → 400, >5MB → 413, submit without docs → 400.

## Phase 6 — Admin review ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | Admin list with filters + pagination | Done | `GET /admin/applications` — router-wide `requireAuth + requireRole(ADMIN)`. Query (coerced): `status`, `minAmount`/`maxAmount` (cents, min ≤ max), `page`, `pageSize` (≤100). DRAFTs hidden unless requested. Count + page in one tx, stable sort (createdAt desc, id). Includes applicant + document count. |
| 2 | start-review | Done | `POST /admin/applications/:id/start-review`: SUBMITTED → UNDER_REVIEW via `assertTransition`; tx update + `REVIEW_STARTED` audit. Shared helpers `loadForTransition` / `rethrowIfConcurrentChange` (P2025 → 409). Race of 2 admins → 200 + 409, 1 audit row. |
| 3 | approve (transaction + schedule) | Done | `POST /admin/applications/:id/approve` `{ annualRateBps }` (500–2500). UNDER_REVIEW only. Schedule computed before tx; one `$transaction`: conditional status update + `createMany` installments + APPROVED audit (with metadata). **Atomicity proven** (forced step-2 failure → nothing saved). Race → 200 + 409, no duplicate schedule. Full DRAFT → APPROVED flow verified; final balance 0. |
| 4 | reject | Done | `POST /admin/applications/:id/reject` `{ reason }` (trimmed, 10–1000). UNDER_REVIEW only; tx update (reason, decidedAt, decidedById) + REJECTED audit (reason in metadata). Final states can't be changed (409). Approve-vs-reject race → consistent single outcome. |
| 5 | Audit trail endpoint | Done | `GET /admin/applications/:id/audit`: 404 for unknown app; entries oldest first; actors batch-loaded in one `IN` query (no N+1), joined via `Map`; `actor: null` if user deleted. Full lifecycle shows all 6 steps. |
| 6 | Stats endpoint (raw SQL) | Done | `GET /admin/stats?since=`: one `$queryRaw` tagged-template `GROUP BY` (counts + sums, `::int`/`::bigint`, `COALESCE`), optional `Prisma.sql` WHERE fragment. Zero-filled statuses, BigInt → Number. Cross-checked against Prisma `groupBy`/`aggregate`; injection demo passed. |

**Done when:** full flow DRAFT → APPROVED works, schedule rows exist and final balance = 0, audit trail shows every step.

## Phase 7 — Backend tests ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | Jest config + test DB setup | Done | Jest 30 + ts-jest + Supertest. Test DB `lendlite_test` on local Docker (override `TEST_DATABASE_URL`), `_test` name guard, `migrate deploy` in globalSetup, env set before app load, `resetDb()` TRUNCATE helper, serial run. Smoke test (health) passes. |
| 2 | Amortization unit tests | Done | `tests/unit/amortization.test.ts` (20: spec example 88849 + final balance 0, 0%, invalid inputs, dates, seeded 1,000-loan property test) + `money.test.ts` (6). Mutation check: breaking the remainder rule → 5 failures. |
| 3 | Auth integration tests | Done | `tests/auth.test.ts` (16): register/login/me, 409/400/401 cases, hash stored, role ignored, identical 401s, expired/forged/deleted-user tokens, 6th login → 429. Added `tests/helpers/factories.ts` and resettable rate-limit stores (`resetRateLimits()`). Full suite 44/44, stable across runs. |
| 4 | Application flow integration tests | Done | `applications.test.ts` (25: CRUD, ownership 404s, submit rules, idempotency incl. concurrent, documents incl. 413 + no orphans) + `admin.test.ts` (21: full HTTP lifecycle w/ schedule + audit, 6 invalid transitions, atomic approve rollback, approve race, reject, list/pagination, raw-SQL stats). Helpers `createApplication`, `PDF_BYTES`, `uploads.ts`. **84/84 pass**, stable over 2 runs. |

**Done when:** `npm test` passes with all of the above.

## Phase 8 — Frontend setup & auth ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | Next.js + Tailwind init | Done | Next **16.4.2** (App Router, `src/`, Cache Components + Partial Prefetching), React 19.3, **Tailwind v4** `@theme` tokens (brand/navy palette, semantic colours, card shadows, `money` tabular-nums utility), Inter via `next/font`, `Logo` component, placeholder fintech landing page. Build/lint/typecheck pass; screenshots checked at desktop + mobile. |
| 2 | `lib/api.ts` (typed fetch wrapper) | Done | `ApiError` (+ `fieldErrors()`), `request<T>` unwraps `{data}`, JSON/FormData, Bearer token (in memory), central 401 handler, network error mapping, `download` → Blob. Plus `lib/types.ts` (API shapes) and `lib/format.ts` (en-AU money/rate/date, safe dollar parsing). Verified against live API. |
| 3 | Auth context/store | Done | `lib/auth.ts` (guarded localStorage) + `AuthProvider`/`useAuth`: tri-state status (loading/authenticated/anonymous), login/register/logout, session restore via `/auth/me` (401 clears token, network error keeps it), central 401 → logout, cross-tab logout. Mounted in root layout. Build passes; runtime verified with 8.4 pages. |
| 4 | Login/register pages | Done | UI primitives (`Button`, `TextField`/`PasswordField`, `Alert`, `Spinner`), Zod client validation, `AuthShell` split layout, `/login` (demo accounts, safe `?next=`, role redirect) + `/register` (live password checklist, EMAIL_TAKEN inline). Temporary `/dashboard` + `/admin` placeholders. Browser e2e (Edge + playwright-core): 19/19, no mobile overflow. |
| 5 | Protected route guard | Done | `RequireAuth` (skeleton while loading, anonymous → `/login?next=`, wrong role → own home) applied via `app/(customer)/layout.tsx` (dashboard moved into group) and `app/admin/layout.tsx`. `PageSkeleton`. `typecheck` = `next typegen && tsc --noEmit`. Browser e2e: guard 8/8, auth 19/19. |
| 6 | Layout/nav | Done | `AppShell` (sticky `AppHeader` w/ role nav + `aria-current`, `UserMenu` dropdown, mobile menu, footer), `PageHeader`, `EmptyState`. Empty dashboard + admin placeholder. Full-reload logout + auth-form reset (Next 16 `<Activity>` keeps hidden pages' state). Fixed stale-token-on-public-page redirect (`skipUnauthorizedHandler`). Browser e2e: layout 15/15, guard 9/9, auth 19/19. |

**Done when:** can register/login from the UI and see an empty dashboard.

## Phase 9 — Customer UI ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | Calculator widget | Done | `LoanCalculator` on landing page: amount/term/example-rate sliders (`RangeField`, accessible), live quote from `POST /calculator/quote`, 250 ms debounce + `AbortController`, pre-filled default quote in static HTML, error state, CTA → `/register` or pre-filled `/applications/new`. Browser e2e 14/14. |
| 2 | Dashboard list | Done | `STATUS_META` + `StatusBadge` (text + colour), reusable `useApi` hook (loading/error/reload, abort), `ApplicationCard` (+ skeleton), `Dashboard` with summary strip and loading/empty/error states. Browser e2e 14/14 (incl. other customer's data hidden, retry). |
| 3 | Multi-step application form | Done | **3c done:** Step 4 review & submit — summary with Edit links, repayment range (quotes at 5%/25%), declaration checkbox, idempotent submit (one key per visit, reused on retry; lost-response test → 1 submission), actionable APPLICATION_INCOMPLETE errors. Full browser journey E2E 16/16. **3a:** wizard shell at `/applications/new` (URL-driven `?draft=&step=`, Stepper, loading/404/non-draft states) + Step 1 loan details (Zod dollars→cents, purpose select + Other, POST then PATCH, API errors mapped to fields, calculator pre-fill). `TextField` prefix, `SelectField`. E2E 21/21. **3b done:** Step 2 employment & income (adaptive employer/business field, $0 allowed, cents, per-month hint, shared `StepActions`). E2E 17/17. |
| 4 | Document upload | Done | Wizard Step 3: `DocumentUploadRow` per type (button + drag-and-drop, client type/size check, friendly API error codes), `DocumentFileItem` (View = authenticated Blob download), Continue gated on ID + PAYSLIP. E2E 15/15 (0 requests for bad files, server catches disguised .exe, drag-drop, exact-bytes download). |
| 5 | Application detail (status timeline + schedule) | Done | `/applications/[id]` (Suspense + `useParams`, Partial Prerender): banners (submitted / draft / declined reason), loan stats, `RepaymentSchedule` (next payment, accessible table, totals, CSV export), details, documents, `StatusTimeline`. Layouts wrap guard in Suspense (usePathname runtime data). Fixed grid min-content mobile overflow. E2E 18/18 + full journey 17/17. |

**Done when:** a customer can complete the whole application flow in the browser.

## Phase 10 — Admin UI ✅ Complete

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | Stats cards | Done | `StatsOverview`: period filter (`?since=`), 4 stat tiles (awaiting, under review, approved + approval rate, total approved compact), `PipelineBar` stacked bar (2px gaps, hover/focus tooltips, legend = table view). Palette **validated** (fixed red/green CVD clash: rose-700, worst ΔE 8.9). Largest-remainder % (always 100). E2E 11/11. |
| 2 | Applications table + filters + pagination | Done | `ApplicationsTable`: URL-driven filters (`?status=&min=&max=&page=`, dollars→cents), validation, accessible table with Review links, pagination summary + Prev/Next, keep-previous-while-loading, empty/error states. Fixed sr-only page overflow (`relative` on scroll box; also schedule table). E2E 15/15. |
| 3 | Detail page | Done | `/admin/applications/[id]`: header (applicant), status-driven `ActionPanel` (Start review; refetch on 409 race), `AffordabilitySnapshot` (income vs expenses vs repayment range, indicative band), documents by type, schedule, Loan/Applicant/Dates cards. API: detail now includes `user {id, fullName, email}` (+ test). Shared `InfoCard`/`DetailRow`. E2E 16/16. |
| 4 | Approve/reject modals | Done | Native `<dialog>` `Modal` (inert background, Escape, focus return), `ApproveDialog` (rate % → bps, presets, live quote preview, "Approve at X% p.a."), `RejectDialog` (trimmed-length counter, customer-facing reason), fresh mount per open + close on Activity hide, 409 → refetch. **Done-when met** (admin decides in browser). E2E 19/19 incl. race (no schedule created). |
| 5 | Audit trail view | Done | `AuditTrail` card on the admin detail page (from `GET /admin/applications/:id/audit`): vertical timeline oldest-first, per-action icon/label, "From → To" status, who (name + Admin/Customer, or "Deleted user"), when, details from metadata (approved rate/monthly/installments/total interest, quoted decline reason, document type + file). Keyed by `updatedAt` → refreshes after each status change. Loading/empty/error+retry. Checked the decline textarea: no error styling (the tint was the border mid-transition after blur). E2E 11/11. |

**Done when:** an admin can review and decide applications in the browser.

## Phase 11 — DevOps & polish ✅ Complete

**Deploy target: Railway** (via the local Railway CLI).

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | API Dockerfile | Done | Multi-stage `api/Dockerfile` (node:20-bookworm-slim + openssl; build → prod-deps `npm ci --omit=dev` → runtime), non-root `node` user, writable `uploads/`, Docker `HEALTHCHECK` on `/health`, CMD `prisma migrate deploy && exec node dist/server.js`. `.dockerignore` (no `.env`, tests, scripts). Railway prep: `prisma` CLI moved to dependencies (migrations at deploy), `TRUST_PROXY` env (0 local / 1 Railway) → `app.set('trust proxy')`. Verified: container healthy, DB ok, login works, runs as `node`, SIGTERM → graceful exit 0. Typecheck + 85/85 tests. |
| 2 | Cloudinary file storage | Done | `FileStorage` interface (`save`/`read`/`remove`) in `lib/storage/` with `diskStorage` (dev/tests) and `cloudinaryStorage` (prod: `raw` + `authenticated` = private; API streams via 60 s signed download link, browser never sees a Cloudinary URL). `STORAGE_DRIVER`, `CLOUDINARY_URL` (format-checked, required when driver=cloudinary), `CLOUDINARY_FOLDER`. Multer → memory storage: validate first, store last (no cleanup of rejected files); orphan file removed if the DB write fails. Download streams with `pipeline`. Tests forced to `local`. +4 disk storage unit tests (89/89). `api/scripts/check-cloudinary.ts` (gitignored) live check 5/5 on the real account; API e2e with `STORAGE_DRIVER=cloudinary` 6/6 (upload, exact-bytes download, other customer 404, disguised file 400, cleanup). Fix: SDK configured explicitly from validated env (it auto-reads `CLOUDINARY_URL` at import, before dotenv). |
| 3 | Web Dockerfile | Done | `next.config.ts` → `output: 'standalone'`. Multi-stage `web/Dockerfile` (deps → build → runtime with only `.next/standalone` + `.next/static` + `public`), `NEXT_PUBLIC_API_URL` as a **build arg** (inlined into browser JS; Railway passes service vars to matching ARGs), `HOSTNAME=0.0.0.0`, non-root `node`, healthcheck, `CMD node server.js`. `public/` created at build (empty dirs aren't in git). `.dockerignore`. Image 388 MB. Verified with API + web containers: healthy, static assets served, calculator calls the baked-in API URL, login → dashboard across containers (CORS), no JS errors, stops in 1 s. Lint + typecheck clean. (Host ran out of RAM mid-way → Docker hung; stopped the other local stacks.) |
| 4 | Full docker-compose | Done | `db` → one-shot `seed` (Dockerfile `build` stage, which has tsx: `migrate deploy` + idempotent `db seed`) → `api` (waits for seed `service_completed_successfully`, `uploads` named volume, local storage) → `web` (waits for api `service_healthy`, `NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1` build arg). Shared `x-api-env` anchor; `JWT_SECRET` local-only default overridable via root `.env`. Ports bound to 127.0.0.1. `docker compose config` valid; images tested individually. Full fresh-clone run couldn't finish locally (8 GB RAM, Docker stopped mid-build) → verified by the CI `compose` job on GitHub runners: fresh clone, seed exit 0, DB ok, demo logins, upload survives API restart, web renders. |
| 5 | GitHub repo (public) + Actions CI | Done | Public repo **https://github.com/JasDevPH/lendlite** (history scanned for secrets first: only placeholders; `.env` never committed). `.github/workflows/ci.yml` on push to main + PRs: **api** (Postgres 16 service, `npm ci`, prisma generate, typecheck, 89 tests, build, `npm audit --omit=dev`), **web** (lint, typecheck, build, audit), **compose** (needs both; `docker compose up --build` from the checkout + curl/jq smoke test; logs on failure; `down -v` always). Concurrency cancels superseded runs; `permissions: contents: read`. First run green in ~2.5 min. Note: API has no ESLint yet (web only). |
| 6 | Railway deploy (GitHub-linked auto-deploy, "Wait for CI") | Done | **Live:** web https://web-production-a5b6c.up.railway.app · API https://api-production-01fb.up.railway.app/api/v1/health. Railway project `lendlite` (region US-East): **Postgres** (template, **PG 18** — volume already initialised, so not downgraded to 16; schema is plain SQL, CI still tests on 16), **api** (root `/api`, Dockerfile, healthcheck `/api/v1/health`, watch `/api/**`, restart on failure), **web** (root `/web`, healthcheck `/`, watch `/web/**`). Vars: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (private network), `WEB_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}`, `NEXT_PUBLIC_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}/api/v1`, `TRUST_PROXY=1`, `STORAGE_DRIVER=cloudinary`; fresh `JWT_SECRET` + `CLOUDINARY_URL` set via stdin (never printed; fixed PowerShell's trailing newline). GitHub source on `main` with **Wait for CI** (`checkSuites: true`) on both services. Migrations run on container start; demo users seeded through a **temporary** TCP proxy, deleted afterwards (DB private-only). CLI `--service-config` didn't apply → used `railway api` GraphQL. Live smoke 12/12 (health, helmet, CORS, logins, Cloudinary upload + exact download, idempotent submit, approve → 24 rows to $0, calculator, both portals, audit trail, no JS errors). Demo approved application kept for reviewers. |
| 8 | Fix: concurrent same-key submit race | Done | Found by CI on the README push (intermittent `[409, 200]`); Railway **skipped the deploy** (gate worked). Cause: key-ownership check after a stale read didn't compare which application owned the key. Fix: owner == this application → replay. Deterministic regression test (stale read via `jest.spyOn`). PR #1: test-only commit red → fix green (90/90) → merged → main CI green → Railway deployed `40774b6`, API healthy. |
| 7 | README | Done | Root `README.md` for interviewers first, then developers: CI badge, **live demo + demo logins**, 6 screenshots from the live site (`docs/screenshots/`), tech stack, Mermaid architecture + status-machine diagrams, folder map, **design decisions table** (cents, service-layer state machine, transaction, idempotency, 404-not-403, pure amortization, `$queryRaw`, private storage, app/server split, JWT localStorage vs httpOnly cookie, fail-fast config, trust proxy), local setup (compose or dev servers), tests, scripts, API table, CI/CD, "What I built" + next steps. `web/README.md` boilerplate replaced with a pointer. |

## Phases overview
- [x] Phase 1 — Backend foundation
- [x] Phase 2 — Database schema
- [x] Phase 3 — Authentication
- [x] Phase 4 — Calculator + applications
- [x] Phase 5 — Documents
- [x] Phase 6 — Admin review
- [x] Phase 7 — Backend tests
- [x] Phase 8 — Frontend setup & auth
- [x] Phase 9 — Customer UI
- [x] Phase 10 — Admin UI
- [x] Phase 11 — DevOps & polish
