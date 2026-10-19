# LendLite — Study Notes

What each piece does, why it's built that way, and what to say about it in an interview.
Updated after every component. Pair with [PROGRESS.md](PROGRESS.md) (what's done) and [CLAUDE.md](CLAUDE.md) (the spec).

---

# Phase 1 — Backend foundation

## 1.1 `api/package.json` + `tsconfig.json`

### What it does
- **package.json** declares the API's dependencies and the scripts that run it. Only Phase 1 packages are installed; others (Prisma, bcrypt, multer…) arrive in the phase that needs them.
  - Runtime: `express` (HTTP server), `helmet` (security headers), `cors` (which origins may call the API), `pino` (structured logging), `zod` (validation), `dotenv` (loads `.env`).
  - Dev: `typescript`, `tsx` (runs TS directly, auto-restarts on save), `@types/*`, `pino-pretty` (readable dev logs).
  - Scripts: `dev` (tsx watch), `build` (tsc → `dist/`), `start` (run compiled JS), `typecheck` (`tsc --noEmit`).
- **tsconfig.json** configures the compiler: `strict` mode, plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. Outputs CommonJS to `dist/`.
- **.gitignore** keeps `node_modules`, `dist`, `.env`, and `uploads/` out of git, but allows `.env.example`.

### Why
- **Strict TypeScript** catches null/undefined bugs at compile time instead of in production.
- **`noUncheckedIndexedAccess`** makes `arr[0]` typed as `T | undefined`, which forces a check before use. That catches real bugs.
- **CommonJS output** keeps the Jest/ts-jest setup simple (Phase 7).
- **TypeScript pinned to 5.x.** npm defaulted to TS 7 (the Go port), but ts-jest and most tooling still target TS 5.
- **`module`/`moduleResolution: "node16"`.** This uses Node's real module rules (e.g. it understands package `exports`, like `dotenv/config`). It still emits CommonJS because package.json has no `"type": "module"`. The old `"node"` (node10) setting is deprecated from TS 6.
- **`types: ["node"]`.** Newer TS versions don't auto-load `@types/node`. Without it, `process` and `console` are unknown, and TS can't see that `process.exit()` never returns.
- *Gotcha:* VS Code ships its own (newer) TypeScript, so the editor can show errors that `npm run typecheck` doesn't. Config is now valid for both. You can also pick "Use Workspace Version" via *TypeScript: Select TypeScript Version* in the command palette.
- **Express 4, not 5.** The spec uses an async wrapper to forward errors, which is the Express 4 pattern. Express 5 catches async errors on its own.
- **`.env` is never committed.** Secrets stay out of git history, and `.env.example` documents what's needed.

### Interview points
- *"Why TypeScript strict mode?"* — It turns whole classes of runtime errors (undefined access, implicit `any`) into compile errors. That matters in fintech, where a bug can mean wrong money.
- *"Why separate dependencies and devDependencies?"* — Production images install only runtime deps. That gives a smaller image and less attack surface.
- *"Why tsx in dev but tsc for production?"* — tsx is fast and skips type-checking, which is good for iteration. `tsc` produces plain JS, so production doesn't need a TS runtime. The `typecheck` script and CI still enforce types.

---

## 1.2 `src/config/env.ts` + `.env.example`

### What it does
1. `import 'dotenv/config'` loads `api/.env` into `process.env`.
2. A **Zod schema** describes every env var:
   - `z.coerce.number()` turns `"4000"` into `4000` (env vars are always strings).
   - Safe values get defaults (`PORT=4000`, `JWT_EXPIRES_IN=1h`).
   - `DATABASE_URL` and `JWT_SECRET` are required, and `JWT_SECRET` must be at least 32 characters.
3. It runs `safeParse(process.env)`. If anything is invalid, it prints **every** problem and calls `process.exit(1)`.
4. It exports a typed `env` object. Other files use `env.PORT` (a `number`), never raw `process.env.PORT` (`string | undefined`).

### Why
- **Fail fast:** a misconfigured server should crash at boot with a clear message, not half-work and fail on the first DB call or login.
- **One source of truth:** every file reads config from one validated, typed object.
- **Minimum JWT secret length:** a short secret can be brute-forced, and then anyone could forge login tokens.
- **Uses `console.error`, not the logger,** because the logger itself depends on `env` (it would be a circular dependency).

### How to test
```powershell
cd api
npx tsx -e "import { env } from './src/config/env'; console.log(env)"   # prints parsed config, PORT as number
# rename .env → "DATABASE_URL: Required", "JWT_SECRET: Required", exit 1
# $env:PORT='abc' → "PORT: Expected number, received nan"
```

### Interview points
- *"How do you manage configuration/secrets?"* — Env vars, validated at startup with Zod. Only `.env.example` is committed. In production they'd come from the platform's secret store (e.g. AWS Secrets Manager or Render env settings).
- *"Why validate env vars at all?"* — It turns a vague runtime crash ("cannot read property of undefined" an hour after deploy) into an immediate, explicit boot failure.
- *"Why `z.coerce`?"* — `process.env` is `Record<string, string | undefined>`. Coercion converts and validates in one step.

---

## 1.3 `src/lib/logger.ts`

### What it does
Exports one shared **pino** logger for the whole API. Its behaviour depends on `NODE_ENV`:

| NODE_ENV | Level | Output |
|---|---|---|
| development | `debug` | Coloured, human-readable (via `pino-pretty`) |
| production | `info` | One JSON object per line |
| test | `silent` | Nothing (keeps Jest output clean) |

It also **redacts** sensitive fields (`authorization` header, `password`, `passwordHash`, `token`), replacing them with `[REDACTED]`.

Usage: `logger.info({ applicationId }, 'Application submitted')`. Put the data object first and the message second.

### Why
- **Structured JSON logs in production:** log platforms (CloudWatch, Datadog, ELK) can filter by field, e.g. "all errors for applicationId X". Plain `console.log` strings can't do that.
- **pino over winston/console:** it's very fast (async, low overhead) and JSON by default.
- **Redaction:** in fintech, leaking passwords or tokens into logs is a security and compliance incident. Redaction protects you even if someone accidentally logs a whole request body.
- **Log levels:** `debug` noise is useful in dev but hidden in production. `silent` in tests stops log spam from drowning out test results.
- **pino-pretty is a devDependency only** and only loaded in development, so production stays lean.

### How to test
```powershell
cd api
npx tsx -e "import { logger } from './src/lib/logger'; logger.info({ user: { password: 'x' } }, 'login attempt')"
# dev → coloured line, password: "[REDACTED]"
$env:NODE_ENV='production'   # → {"level":30,...,"user":{"password":"[REDACTED]"},"msg":"login attempt"}
$env:NODE_ENV='test'         # → prints nothing
Remove-Item Env:NODE_ENV     # reset afterwards
```

### Interview points
- *"Why structured logging?"* — Logs become queryable data. In an incident you can filter by `applicationId` or `userId` across thousands of lines.
- *"How do you avoid logging sensitive data?"* — Redaction at the logger level, as a safety net. Also: never log whole request bodies on auth routes.
- *"Why different log levels per environment?"* — Signal vs noise. Debug detail helps locally but costs money and hides real problems in production.

---

## 1.4 `utils/AppError.ts` + `middleware/errorHandler.ts`

### What it does
- **`AppError`** is a custom error class for *expected* failures. It carries `statusCode`, a machine-readable `code`, a `message`, and optional `details`.
  Usage anywhere in a service: `throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Cannot submit an APPROVED application')`.
- **`notFoundHandler`** is registered after all routes. Any request that matched nothing becomes `404 NOT_FOUND`.
- **`errorHandler`** is registered last. It catches every error and formats it as `{ error: { code, message, details? } }`:

| Error | Status | code |
|---|---|---|
| `AppError` | its own `statusCode` | its own `code` |
| `ZodError` | 400 | `VALIDATION_ERROR` (+ per-field `details`) |
| Malformed JSON body | 400 | `INVALID_JSON` |
| Body over the size limit | 413 | `PAYLOAD_TOO_LARGE` |
| Unknown route | 404 | `NOT_FOUND` |
| Anything else (a bug) | 500 | `INTERNAL_ERROR`. The full error and stack are **logged server-side only** |

### Why
- **One place formats every error.** Controllers and services just `throw`; there's no try/catch + `res.status().json()` repeated in every route. The response shape is guaranteed consistent, so the frontend can rely on `error.code`.
- **`code` and `message` are separate.** The UI switches on a stable `code` (e.g. show a specific message for `INVALID_STATUS_TRANSITION`), while `message` can change freely.
- **Never leak internals on 500.** Stack traces and error messages can expose DB details, file paths or secrets. Clients get a generic message, and the logger keeps everything for debugging.
- **4 parameters are required:** Express identifies error middleware by `fn.length === 4`, so the unused `_next` must stay.
- **Order matters:** routes → `notFoundHandler` → `errorHandler`.
- **`instanceof AppError` works** because we compile to ES2022 (native classes). When compiling to ES5, subclassing `Error` breaks `instanceof` unless you call `Object.setPrototypeOf`. That's a classic gotcha.

### How to test
Tested with a throwaway Express app that threw each error type. Expected output:
```
AppError       → 409 {"error":{"code":"INVALID_STATUS_TRANSITION","message":"..."}}
ZodError       → 400 {"error":{"code":"VALIDATION_ERROR","details":[{"path":"amountCents",...}]}}
Bad JSON       → 400 INVALID_JSON
Too large      → 413 PAYLOAD_TOO_LARGE
Unknown route  → 404 NOT_FOUND
Unexpected bug → 500 INTERNAL_ERROR   (stack appears only in the server log)
```
You'll test it for real against `/health` and unknown routes once `app.ts` exists (1.5).

### Interview points
- *"How do you handle errors in Express?"* — Centralised error middleware. Business code throws typed `AppError`s; one handler maps error types to HTTP responses with a consistent JSON shape.
- *"What's the difference between operational errors and bugs?"* — Operational errors (not found, invalid input, conflict) are expected and get a 4xx with a clear message. Bugs are unexpected, so they're logged in full and return a generic 500.
- *"Why not return the error message on a 500?"* — Information disclosure: it could reveal SQL, file paths or secrets to an attacker.
- *"How do async errors reach the handler?"* — In Express 4, a rejected promise in a route isn't caught automatically. We'll use an async wrapper that calls `next(err)` (built with the controllers in Phase 3).

---

## 1.4b Dev scripts — JWT secret generator + Neon database setup

### What it does
- **`scripts/lib/env-file.ts`** has two helpers:
  - `upsertEnvVar(key, value)` replaces a `KEY=` line in `api/.env` or appends it. It creates `.env` from `.env.example` first if needed.
  - `mask(secret)` prints secrets safely as `abcd…wxyz`.
- **`scripts/generate-jwt-secret.ts`** (`npm run secret:jwt`) builds a secret from 64 random bytes from `crypto.randomBytes`, encoded as base64url (86 chars).
  - Prints it by default.
  - With `-- --write`, saves it to `.env` and only prints a masked version.
- **`scripts/setup-neon.ts`** (`npm run db:neon`) provisions a serverless Postgres database on **Neon** using the `neonctl` CLI:
  1. Checks you're logged in (`neonctl me`).
  2. Resolves the org (auto if you have one; otherwise set `NEON_ORG_ID`).
  3. Finds the `lendlite` project, or creates it: **Sydney (`aws-ap-southeast-2`), Postgres 16**, database + role `lendlite`.
  4. Gets the **direct** (non-pooled) connection string and writes `DATABASE_URL` to `.env`. The password is masked in the output.
  - **Idempotent:** re-running reuses the existing project instead of creating a duplicate.
- **`scripts/tsconfig.json`** lets `npm run typecheck:scripts` check these scripts. They run with `tsx` and are never compiled into `dist/`.
- **`api/scripts/` is gitignored** (local-only helpers). That's why the main `typecheck` doesn't include them: on a fresh clone or in CI the folder doesn't exist.

### Why
- **`crypto.randomBytes`, not `Math.random`.** `Math.random` is predictable and not meant for security. `randomBytes` uses the OS's cryptographically secure generator.
- **512 bits** is well above the 256-bit minimum for HS256 (HMAC-SHA256) signing.
- **base64url** is safe in `.env` files and URLs (no `+ / =` or spaces).
- **Scripts write to `.env` directly,** so secrets never need copy-pasting through chat, terminals or screenshots. Output is masked.
- **Neon instead of local Docker for dev:** a real managed Postgres with nothing to install, and the same connection string works from CI or a deployed API. Docker Compose still matters for the "fresh clone runs everything" goal in Phase 11.
- **Sydney region:** an Australian fintech would keep customer financial data onshore (lower latency, and data-residency expectations).
- **Direct, not pooled, connection:** Prisma migrations need a direct connection. A pooled URL (PgBouncer) is better for many short-lived serverless connections at runtime, which is a Phase 11 deploy concern.
- **`sslmode=require`:** Neon only accepts encrypted connections, so data in transit is encrypted.

### How to test
```powershell
cd api
npm run secret:jwt                 # prints a random 86-char secret
npm run secret:jwt -- --write      # → "JWT_SECRET written to api/.env (kdOD…Y1lQ, 86 chars)"
npm run db:neon                    # 1st run: "Created project …"; re-run: "Using existing project …"
npx tsx -e "import { env } from './src/config/env'; console.log(new URL(env.DATABASE_URL).host)"
# → ep-…ap-southeast-2.aws.neon.tech
```
⚠️ Rotating `JWT_SECRET` logs everyone out: tokens signed with the old secret stop verifying.

### Interview points
- *"How do you generate secrets?"* — With a CSPRNG (`crypto.randomBytes`), with enough entropy for the algorithm. Never hand-typed, never committed. In production they live in a secrets manager.
- *"What happens if the JWT secret leaks?"* — Anyone can forge tokens for any user, including admins. You rotate the secret, which invalidates every existing token. That's one reason to keep token expiry short (1h).
- *"Pooled vs direct DB connections?"* — Pooling reuses a few DB connections across many app requests (important for serverless). Migrations and some session features need a direct connection.
- *"Why make setup scripts idempotent?"* — They're safe to re-run by anyone, including CI, without creating duplicate resources. It's the same idea as the idempotent submit endpoint.

---

## 1.6 `docker-compose.yml` — local Postgres (offline alternative to Neon)

*(Built before 1.5 on purpose, so you have both database options before the server's `/health` check uses one.)*

### What it does
Defines one service, `db`, using `postgres:16-alpine`:
- **Credentials:** user, password and database all `lendlite`.
- **Port:** host **5433** → container 5432, bound to `127.0.0.1` only.
- **Volume:** a named volume `db-data` keeps data across restarts.
- **Healthcheck:** `pg_isready` reports when Postgres is actually ready to accept connections.

**Switching between databases** is one line in `api/.env`:
```
# Neon (cloud)   → whatever `npm run db:neon` wrote
# Docker (local) → DATABASE_URL=postgresql://lendlite:lendlite@localhost:5433/lendlite
```

### Why
- **Offline/zero-cost option:** it works without internet and gives you a disposable DB to wipe freely (`down -v`).
- **`16-alpine`:** pinned major version, matching the spec and the Neon project. Alpine images are small.
- **Port 5433, not 5432:** another stack on this machine (`jasdev-postgres-1`) already uses 5432. Inside Docker it's still 5432; only the host side changes. Format: `HOST:CONTAINER`.
- **`127.0.0.1:` bind:** without it, Docker publishes on all interfaces (`0.0.0.0`), so anyone on your Wi-Fi could reach a DB whose password is `lendlite`. Docker port publishing also bypasses Windows/Linux firewall rules.
- **Committed dev credentials are fine:** this DB only listens locally and holds no real data. Real secrets never go in compose files.
- **Named volume:** containers are disposable; volumes hold the state. `docker compose down` keeps data, `down -v` deletes it.
- **Healthcheck:** "container started" ≠ "Postgres ready". In Phase 11 the api service will `depends_on: { db: { condition: service_healthy } }`, so it doesn't crash-loop on boot.

### How to test
```powershell
docker compose up -d db
docker compose ps                    # lendlite-db  127.0.0.1:5433->5432/tcp  Up (healthy)
docker exec lendlite-db psql -U lendlite -d lendlite -c "select version();"   # PostgreSQL 16.x
docker compose down                  # stop (data kept)
docker compose down -v               # stop AND wipe data
```
Verified: healthy, reachable on 127.0.0.1:5433, and a test row survived `down` → `up`.

### Interview points
- *"Image vs container vs volume?"* — An image is the blueprint, a container is a running instance of it (disposable), and a volume is persistent storage that outlives containers.
- *"What does `ports: '127.0.0.1:5433:5432'` mean?"* — Host loopback port 5433 forwards to port 5432 inside the container. Binding to loopback keeps it private to your machine.
- *"Why a healthcheck?"* — So orchestration knows when a service is *ready*, not just *started*. Dependents wait for healthy.
- *"Why both Neon and Docker?"* — Docker gives a reproducible, offline local environment (and CI can use the same Postgres image). Neon is a managed cloud DB closer to production. The app doesn't care: it only reads `DATABASE_URL`, a [12-factor](https://12factor.net/config) config principle.

---

## 1.5 `app.ts` + `server.ts` with `/health`

### What it does
- **`app.ts`** builds the Express app but **never calls `listen()`**. Middleware runs in this order:
  1. `helmet()`: security headers (CSP, HSTS, `nosniff`, `X-Frame-Options`, hides `X-Powered-By`)
  2. `cors({ origin: WEB_ORIGIN })`: only the web frontend may call the API from a browser
  3. `express.json({ limit: '100kb' })`: parses JSON bodies; bigger ones → 413
  4. `pino-http`: one log line per request (method, URL, status, response time). The level is `warn` for 4xx and `error` for 5xx.
  5. The router mounted at **`/api/v1`**, with `GET /health` → `{ data: { status: 'ok', uptimeSeconds, timestamp } }`
  6. `notFoundHandler` → `errorHandler` (from 1.4)
- **`server.ts`** is the only file that opens a port:
  - `app.listen(env.PORT)`.
  - Gives a friendly message and exits if the port is taken (`EADDRINUSE`).
  - **Graceful shutdown** on `SIGINT` (Ctrl+C) / `SIGTERM` (Docker, hosting): stop accepting new requests, let in-flight ones finish, and force exit after 10s.
- **Port changed to 4001** (`.env`, `.env.example`, `env.ts` default, CLAUDE.md) because another local stack uses 4000.

### Why
- **`app.ts` separate from `server.ts` = testability.** Supertest imports `app` and sends requests in-memory: no real port, no clashes between parallel tests, no server to shut down.
- **Middleware order matters:** security headers and body parsing run before routes; 404 and the error handler come last.
- **`/api/v1` prefix:** API versioning. Breaking changes can ship as `/api/v2` while old clients keep working.
- **Health endpoint:** Docker, load balancers, CI and uptime monitors poll it to know the service is alive. In Phase 2 it will also check the DB (a "readiness" check).
- **Trimmed request logs:** full headers are noisy and could contain cookies/tokens. Log only method, URL, status and timing.
- **Graceful shutdown:** during a deploy, the platform sends SIGTERM. Without handling it, requests in progress (e.g. someone mid-submit) get cut off.
- **CORS isn't authentication.** It only stops *browsers* on other sites from reading responses; curl/Postman ignore it. Real protection is JWT auth (Phase 3).

### How to test
```powershell
cd api
npm run dev                          # → "LendLite API listening on http://localhost:4001/api/v1"
# in another terminal:
curl.exe http://localhost:4001/api/v1/health      # 200 {"data":{"status":"ok",...}}
curl.exe http://localhost:4001/api/v1/nope        # 404 {"error":{"code":"NOT_FOUND",...}}
curl.exe -i http://localhost:4001/api/v1/health   # see helmet headers, no X-Powered-By
```
Verified: 200 health, 404 unknown route, 400 bad JSON, helmet headers present, CORS limited to `http://localhost:3000`, clear error when port is in use.

### Interview points
- *"Why separate app and server?"* — Testability (Supertest uses the app without a port) and separation of concerns (configuring the app vs running a process).
- *"What does helmet do?"* — It sets secure HTTP headers: CSP against XSS, HSTS to force HTTPS, `nosniff`, clickjacking protection, and it hides the framework fingerprint (`X-Powered-By: Express`).
- *"What is CORS and does it protect your API?"* — A browser rule controlling which origins may read responses. It protects users' browsers, not the API. Auth protects the API.
- *"How do you handle shutdowns/deploys?"* — Catch SIGTERM, stop accepting connections, drain in-flight requests, exit, with a timeout as a safety net.
- *"Why version the API?"* — Mobile apps and other clients can't all upgrade at once, so you need to evolve the API without breaking them.

---

# ✅ Phase 1 complete

Express + TypeScript API with validated config, structured logging, centralised errors, security middleware, a health check, and two database options (Neon cloud + Docker local).

---

# Phase 2 — Database schema

## 2.1 `prisma/schema.prisma`

### What it does
The single source of truth for the database structure. From it Prisma:
- generates **SQL migrations** (next component), and
- generates a **fully typed client** (`prisma.loanApplication.findMany(...)` with autocomplete and type errors for wrong fields).

It contains:
- **`generator` / `datasource`:** use the JS client; connect to PostgreSQL via `DATABASE_URL` (Neon or Docker; Prisma doesn't care which).
- **3 enums:** `Role`, `ApplicationStatus`, `EmploymentType`. These become real Postgres enum types, so the DB itself rejects invalid values.
- **5 models:**

| Model | Purpose | Key relations |
|---|---|---|
| `User` | Customers + admins; `email` unique | has many `LoanApplication` |
| `LoanApplication` | The loan, its status, money fields | belongs to `User`; has many documents, installments, audit logs |
| `Document` | Metadata for an uploaded file (file itself is on disk) | belongs to application, **cascade delete** |
| `RepaymentInstallment` | One row per month of the schedule | `@@unique([applicationId, installmentNo])` |
| `AuditLog` | Who changed what, from/to status | belongs to application |

### Why
- **Integer cents and basis points, never floats.** Floating point can't represent most decimals exactly (`0.1 + 0.2 = 0.30000000000000004`). With money that becomes cents going missing. Integers are exact; formatting to dollars happens only at display time.
- **UUID ids, not auto-increment:** IDs can't be guessed or enumerated (`/applications/1`, `/2`, `/3`…), and don't leak how many loans exist.
- **DB enums:** the database enforces valid statuses even if a bug bypasses app validation (defence in depth).
- **`idempotencyKey @unique`:** the database guarantees one key maps to at most one application, even under a race between two simultaneous requests.
- **Indexes:**
  - `status` (admin filter) and `userId` (customer's own list) on `LoanApplication`.
  - `applicationId` on `Document`, and `(applicationId, createdAt)` on `AuditLog` (fetch the trail in time order).
  - **Postgres does not auto-index foreign keys,** so lookups by `applicationId` would otherwise scan the whole table.
- **`@@unique([applicationId, installmentNo])`:** you can't accidentally insert installment #3 twice. It also acts as the index for `applicationId`.
- **`onDelete: Cascade`** on child tables: deleting an application cleans up its documents/schedule/audit rows. `User → LoanApplication` keeps the default (**Restrict**): you can't delete a user who has loans, because in lending you keep that history.
- **`@updatedAt`:** Prisma sets it automatically on every update.
- **`decidedById`/`actorId` are plain strings (no FK), as in the spec.** Audit records should survive even if a user record changes. It also keeps the schema simple.
- **Prisma 6, not 7/8:** 8 is a release candidate, and 7 needs a config file + driver adapter + custom client output. Prisma 6 is stable and simpler to explain. `$transaction` / `$queryRaw` work the same.
- **npm `overrides` for `deepmerge-ts`:** the Prisma 6 CLI pulled in a version with a known vulnerability (stack exhaustion). Rather than a breaking upgrade, we force the patched v8 of that one sub-dependency. `npm audit` → 0 vulnerabilities, and the CLI still works.

### How to test
```powershell
cd api
npx prisma format      # tidies alignment
npx prisma validate    # → "The schema at prisma\schema.prisma is valid 🚀"
npx prisma generate    # → "Generated Prisma Client (v6.19.3)"
npm audit              # → found 0 vulnerabilities
```
(No tables exist yet; the migration is the next component.)

### Interview points
- *"Why store money as integer cents?"* — Floats are binary approximations, and rounding errors compound across interest calculations. Integers are exact. Alternative: Postgres `NUMERIC`/`DECIMAL`, but integers are simplest and fastest when you only need cents.
- *"Why UUIDs over auto-increment IDs?"* — They aren't guessable (it pairs with returning 404 for others' applications), can be generated anywhere, and don't leak business volume. Trade-off: bigger indexes and random insert order.
- *"Which indexes did you add and why?"* — For each real query pattern: filter by status, list by user, fetch documents/audit by application. Foreign keys aren't indexed automatically in Postgres.
- *"How does the DB help enforce business rules?"* — Enums, unique constraints (email, idempotency key, installment number) and FKs are a safety net under the app-level validation.
- *"What's an ORM's advantage / risk?"* — Type safety, migrations and parameterised queries by default (no SQL injection). The risk is hidden inefficient queries, so you check generated SQL and drop to raw SQL where needed (our stats endpoint).
- *"How did you handle a vulnerable transitive dependency?"* — I checked whether it was actually reachable (CLI-only, merges our own config), then used `overrides` to pin the patched version instead of a breaking major upgrade, and re-ran audit and the CLI to verify.

---

## 2.2 First migration (`prisma/migrations/…_init/`)

### What it does
`npx prisma migrate dev --name init` compared the schema with the (empty) database and:
1. **Generated SQL** in `prisma/migrations/20261019042311_init/migration.sql`:
   - `CREATE TYPE` for the 3 enums and `CREATE TABLE` for the 5 tables.
   - Unique indexes (email, idempotencyKey, applicationId+installmentNo) and our regular indexes.
   - Foreign keys: `ON DELETE RESTRICT` for User→LoanApplication, `CASCADE` for the children.
2. **Applied it** to Neon, recording it in a `_prisma_migrations` table.
3. **Regenerated the Prisma Client.**

Also created `migration_lock.toml` (locks the provider to postgresql) and these npm scripts:

| Script | Command | When |
|---|---|---|
| `npm run db:migrate` | `prisma migrate dev` | Dev: after changing the schema. Creates + applies a new migration |
| `npm run db:deploy` | `prisma migrate deploy` | CI / production / a fresh DB: applies existing migrations only, never generates |
| `npm run db:studio` | `prisma studio` | Browse/edit data in a web UI |

The same migration was applied to the **Docker** DB with `migrate deploy`, so both databases are identical.

### Why
- **Migrations are versioned SQL committed to git.** Every environment (your laptop, CI, production) reaches the exact same schema by replaying the same files in order. No "works on my DB".
- **`migrate dev` vs `migrate deploy`:** `dev` can create new migrations and may offer to reset the DB, so it's for development only. `deploy` only applies already-reviewed migrations, safe for production and CI.
- **Always read the generated SQL.** It's what actually runs against the DB. Ours shows exactly the constraints and indexes we designed.
- **`_prisma_migrations` table:** Prisma records which migrations ran (with checksums), so it never applies one twice and detects if an applied file was edited.
- **Never edit an applied migration.** Change the schema and create a new migration instead.
- **Shadow database:** `migrate dev` briefly creates a temporary DB to check for drift. Neon's role is allowed to do that, which is why it just worked.
- Tables are named like the models (`"LoanApplication"`, camelCase columns), so raw SQL must quote them: `SELECT "amountCents" FROM "LoanApplication"`. That matters for the stats query in Phase 6.

### How to test
```powershell
cd api
npx prisma migrate status     # → "1 migration found… Database schema is up to date!"
npm run db:studio             # opens http://localhost:5555, shows 5 empty tables
# Docker DB:
docker exec lendlite-db psql -U lendlite -d lendlite -c "\dt"
```

### Interview points
- *"How do you change a production database schema safely?"* — Versioned migrations in git, reviewed like code, applied by CI/CD with `migrate deploy`. For risky changes use expand/contract: add the new column, backfill, switch code, then remove the old column later.
- *"What's the difference between `migrate dev` and `migrate deploy`?"* — `dev` generates migrations and can reset (development only); `deploy` only applies committed migrations (CI/production).
- *"What happens if two developers create migrations at the same time?"* — Both are timestamped files; git merges them, and Prisma detects drift or ordering issues. You may need to regenerate one on top of the other.
- *"Why commit migration files instead of just the schema?"* — The schema says what the DB should look like *now*; migrations say *how to get there* from every past state, including data-safe steps.

---

## 2.3 `lib/prisma.ts` + DB-aware `/health`

### What it does
- **`lib/prisma.ts`** exports **one shared `PrismaClient`** for the whole app.
  - Prisma's `warn`/`error` events go through **pino**, so all logs share one format.
  - In development, every SQL query is logged at `debug` level with its duration.
- **`/health` now pings the database** with `prisma.$queryRaw\`SELECT 1\``:
  - DB reachable → `200 { data: { status: 'ok', database: 'ok', uptimeSeconds, timestamp } }`
  - DB unreachable → `503 { error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unreachable' } }`. The real Prisma error is logged server-side only.
- **`server.ts`** calls `prisma.$disconnect()` during graceful shutdown.

### Why
- **Singleton client:** each `PrismaClient` has its own connection pool. A new client per request would open more and more connections until Postgres refuses them (Neon's free tier has low limits).
- **No global-caching trick needed:** that pattern is for Next.js hot reload. `tsx watch` restarts the whole process, so the module-level `const` is enough.
- **`SELECT 1`:** the cheapest real round-trip. It proves the network, credentials and DB are all working without touching any table.
- **503, not 500:** 503 "Service Unavailable" means *temporarily* can't serve. Load balancers and Kubernetes treat it as "take this instance out of rotation", which is exactly right when the DB is down.
- **try/catch here, unlike elsewhere:** in an Express 4 `async` route, a thrown error would become an unhandled promise rejection, not reach the error handler. Here we catch and `next(new AppError(...))` explicitly. In Phase 3 an `asyncHandler` wrapper will do this for every controller automatically.
- **`$queryRaw` with a tagged template** is parameterised (injection-safe). We'll rely on that again for the stats query.
- **`$disconnect` on shutdown:** closes pool connections cleanly instead of leaving the DB to time them out.
- **Env vars override `.env`:** dotenv never overwrites variables already set in the shell. That's how we tested Docker without editing `.env`.

### How to test
```powershell
cd api
npm run dev
curl.exe http://localhost:4001/api/v1/health
# → 200 {"data":{"status":"ok","database":"ok",...}}

# Simulate DB outage (when DATABASE_URL points at Docker):
docker compose stop db     # → health returns 503 SERVICE_UNAVAILABLE
docker compose start db    # → back to 200
```
Verified: Neon → 200, Docker → 200, Docker stopped → 503 with the error logged server-side.

### Interview points
- *"Why a single Prisma client?"* — Connection pooling. DB connections are expensive and limited; one pool is shared by all requests.
- *"Liveness vs readiness checks?"* — Liveness: "is the process alive?" (restart it if not). Readiness: "can it serve traffic right now?" (stop routing to it if not). Our `/health` is a readiness check because it includes the DB.
- *"Why 503 when the DB is down?"* — It signals a temporary dependency failure, so orchestrators stop routing traffic but don't treat the app as broken code.
- *"How do async errors reach Express's error handler?"* — In Express 4 they don't automatically. You must catch and call `next(err)`, or use a wrapper. (Express 5 does it natively.)

---

## 2.4 `prisma/seed.ts`

### What it does
Creates the two demo users from the spec:

| Email | Password | Role |
|---|---|---|
| `admin@lendlite.dev` | `Admin1234` | ADMIN |
| `customer@lendlite.dev` | `Customer1234` | CUSTOMER |

- Hashes each password with **bcrypt, cost 12**.
- Uses **`upsert` by email**: creates the user if missing, otherwise resets them to the known demo values. Running it twice never creates duplicates.
- **Refuses to run when `NODE_ENV=production`.**
- Always calls `prisma.$disconnect()` (in `.finally`), and sets `process.exitCode = 1` on failure.
- Wired up via `package.json` → `"prisma": { "seed": "tsx prisma/seed.ts" }`, so `npx prisma db seed` (or `npm run db:seed`) runs it. Prisma also runs it automatically after `prisma migrate reset`.
- `prisma/tsconfig.json` makes `npm run typecheck` cover `seed.ts` too.

### Why
- **Never store plain passwords; hash them.** If the DB leaks, attackers get hashes, not passwords.
- **Why bcrypt (not SHA-256)?** bcrypt is *deliberately slow* and *salted*:
  - **Salt:** a random value is stored inside the hash, so two users with the same password get different hashes. That defeats precomputed "rainbow tables".
  - **Cost factor:** cost 12 = 2¹² rounds ≈ 200ms per hash. That's fine for one login but makes billions of guesses impractical. SHA-256 is built to be fast, which is exactly what attackers want. Raise the cost as hardware gets faster.
  - The hash format `$2b$12$…` stores the algorithm version, cost and salt, so `bcrypt.compare` needs nothing else.
- **`bcrypt` (native) vs `bcryptjs` (pure JS):** same algorithm. Native is faster, which matters at cost 12. It installed cleanly with prebuilt binaries for Node 24.
- **Idempotent seed (upsert):** safe to re-run anytime (after a reset, on a new DB, in CI) without "unique constraint failed on email" errors.
- **Production guard:** known demo passwords like `Admin1234` in production would be an instant admin takeover.
- **`process.exitCode` instead of `process.exit(1)`:** lets `.finally()` still disconnect before the process ends.
- *Note:* Prisma 6 warns that `package.json#prisma` is deprecated (in favour of `prisma.config.ts` in Prisma 7). It still works fine on Prisma 6.

### How to test
```powershell
cd api
npm run db:seed        # → ✔ ADMIN admin@lendlite.dev / ✔ CUSTOMER customer@lendlite.dev / Seed complete
npm run db:seed        # run again → same 2 users, no duplicates
npm run db:studio      # User table: 2 rows, passwordHash starts with $2b$12$
```
Verified on Neon and Docker: 2 users, hashes `$2b$12$…` (60 chars), `bcrypt.compare('Admin1234', hash)` → true, wrong password → false, production guard exits 1.

### Interview points
- *"How do you store passwords?"* — Never plaintext and never a fast hash. Use a slow, salted algorithm (bcrypt, or argon2/scrypt) with a tunable cost. We use bcrypt cost 12, and the hash is never returned by the API.
- *"What is a salt and why does it matter?"* — Random data mixed in per password, so identical passwords produce different hashes and rainbow tables are useless.
- *"Why is a slow hash good?"* — The legitimate user pays ~200ms once per login. An attacker trying billions of guesses pays it billions of times.
- *"How do you seed data safely?"* — Idempotent upserts, demo-only data, and an explicit guard against running in production.

---

# ✅ Phase 2 complete

Prisma schema (5 models, 3 enums, indexes), initial migration applied to both Neon and Docker, shared Prisma client, `/health` with DB check (200/503), and idempotent seed of admin + customer users.

---

# Phase 3 — Authentication

## 3.1 `modules/auth/auth.schema.ts`

### What it does
Zod schemas describing what a valid request body looks like:
- **`registerSchema`**:
  - `email`: trimmed, lowercased, valid format, ≤254 chars.
  - `password`: 8–72 chars, ≥1 letter, ≥1 number.
  - `fullName`: trimmed, 2–100 chars.
- **`loginSchema`**: `email` (same normalisation); `password` only needs to be present (1–72 chars).
- **`RegisterInput` / `LoginInput`** types are *inferred* from the schemas with `z.infer`.

These will be used by a `validate` middleware (next components) before the controller ever runs.

### Why
- **Validate at the boundary:** never trust client input. Bad data is rejected with a 400 before it touches business logic or the DB.
- **Normalise emails (trim + lowercase):** otherwise `Jo@Example.com` and `jo@example.com` could register as two accounts, and login would fail on a stray space.
- **Max 72 chars:** bcrypt only uses the first 72 bytes. A 100-char password would silently be the same as its first 72 chars. Better to reject it honestly.
- **Strength rules only on register, not login:** login just checks the hash. Applying rules there would also lock out older accounts if rules change, and leak hints about valid passwords.
- **Unknown keys are stripped** (Zod's default): sending `role: "ADMIN"` in register is silently dropped. That's protection against **mass assignment**, i.e. users setting fields they shouldn't, like their own role.
- **`z.infer` = one source of truth:** the validation rules and the TypeScript types can never drift apart.
- **Collects all errors at once:** a missing name *and* a bad email are both reported, so the form can highlight every field.

### How to test
Verified with a throwaway script:
```
valid "  Jo@Example.COM "   → {"email":"jo@example.com", ...}   (trimmed + lowercased)
"abc1"                      → Password must be at least 8 characters
"password"                  → must contain at least one number
"12345678"                  → must contain at least one letter
73-char password            → must be at most 72 characters
bad email + no name         → email: Invalid email address | fullName: Required
extra role:"ADMIN"          → stripped from output
login with weak password    → accepted (strength rules don't apply to login)
```

### Interview points
- *"Where do you validate input?"* — At the API boundary with Zod, on every body/query/params, before the controller runs. The DB constraints are a second safety net.
- *"What is mass assignment?"* — When an API copies the request body straight into the DB, letting attackers set fields like `role` or `status`. We prevent it by whitelisting fields in schemas (unknown keys are stripped).
- *"Why limit password length?"* — bcrypt's 72-byte limit. Also, unbounded inputs into a slow hash could be a DoS vector.
- *"Why lowercase emails?"* — Prevents duplicate accounts and login failures. (Technically the local part *can* be case-sensitive, but virtually no provider treats it that way.)

---

## 3.2 `modules/auth/auth.service.ts`

### What it does
All authentication business logic. No HTTP here: it takes plain inputs and returns data or throws `AppError`.

| Function | Does | Errors |
|---|---|---|
| `hashPassword` / `verifyPassword` | bcrypt hash (cost 12) / compare | — |
| `signToken(user)` | JWT `{ sub: userId, role }`, HS256, expires in `JWT_EXPIRES_IN` (1h) | — |
| `verifyToken(token)` | Checks signature + expiry, **pins HS256**, validates payload shape with Zod | 401 `UNAUTHORIZED` |
| `register(input)` | Rejects duplicate email; creates a **CUSTOMER**; returns `{ token, user }` | 409 `EMAIL_TAKEN` |
| `login(input)` | Finds user, checks password; returns `{ token, user }` | 401 `INVALID_CREDENTIALS` |
| `getCurrentUser(id)` | Public profile for `/auth/me` | 401 if the user was deleted |

- **`publicUserSelect`** lists the only user fields ever returned (`id, email, fullName, role, createdAt`). `passwordHash` is never sent.
- **`PublicUser`** is a type generated from that select.

### Why
- **Service layer has no `req`/`res`:** it's reusable (seed scripts, tests, a future CLI) and easy to unit test. The controller (next) handles HTTP only.
- **JWT contents:** `sub` (standard claim for "subject" = user id) and `role`, nothing sensitive. A JWT is **signed, not encrypted**: anyone can base64-decode it and read the payload. The signature only proves *we* issued it and it wasn't changed.
- **Pin `algorithms: ['HS256']`:** a classic JWT attack sets `alg: "none"` (no signature) or switches algorithms. Pinning rejects anything else. Tested: an `alg=none` admin token → 401.
- **Zod-validate the decoded payload:** a correctly-signed token with an unexpected shape still gets rejected, which is defence in depth.
- **Short expiry (1h):** JWTs can't easily be revoked, so a stolen token is only useful briefly.
- **Same error for unknown email and wrong password:** different messages would let attackers discover which emails have accounts (**user enumeration**).
- **`DUMMY_HASH` (timing attack defence):** without it, unknown emails return instantly (no bcrypt) while real ones take ~200ms, and attackers could enumerate users by timing. Now both paths run bcrypt. Measured: 627ms vs 685ms.
- **Role forced to `CUSTOMER` on register:** admins can never be self-created through the public API.
- **Check-then-insert race:** two simultaneous sign-ups with the same email can both pass `findUnique`. The DB's unique index makes one insert fail with Prisma error **P2002**, which we convert to the same 409.
- **Explicitly picking public fields** (`select` / destructuring) instead of "everything minus passwordHash": a sensitive column added later can't leak by default (allow-list beats deny-list).
- *Trade-off:* register's 409 `EMAIL_TAKEN` does reveal that an email exists. That's accepted UX practice, mitigated by rate limiting (component 6).

### How to test
Verified with a throwaway script against Neon (test user deleted afterwards):
```
✔ register new user          → role CUSTOMER, no passwordHash, token {sub, role, iat, exp=iat+3600}
✖ register same email        → 409 EMAIL_TAKEN
✔ login correct password     → no passwordHash in user
✖ login wrong password       → 401 INVALID_CREDENTIALS (685ms)
✖ login unknown email        → 401 INVALID_CREDENTIALS (627ms, similar timing)
✔ verify token → getCurrentUser
✖ tampered / other secret / expired / alg=none token → 401 UNAUTHORIZED
```

### Interview points
- *"How does JWT auth work?"* — On login the server signs `{ sub, role, exp }` with a secret. The client sends it as `Authorization: Bearer <token>`. The server verifies the signature and expiry on each request, so there's no session lookup (stateless).
- *"Is data in a JWT secret?"* — No. It's base64-encoded, not encrypted. Never put sensitive data in it.
- *"Downsides of JWTs?"* — Hard to revoke before expiry (mitigations: short expiry + refresh tokens, or a denylist), and the role in the token can be stale until it expires.
- *"What's the `alg: none` attack?"* — A forged token claims no signature is needed. You prevent it by pinning the allowed algorithms on verify.
- *"How do you prevent user enumeration?"* — Identical error messages *and* similar response times for unknown-user vs wrong-password, plus rate limiting.
- *"How do you handle race conditions on unique fields?"* — Rely on the DB unique constraint as the final authority and translate its error (P2002) into a clean 409.

---

## 3.3 `auth.controller.ts` + `auth.routes.ts` (+ `validate`, `asyncHandler`, `req.user` type)

### What it does
- **`utils/asyncHandler.ts`** wraps an async route handler so any rejected promise is passed to `next(err)` → central `errorHandler`.
- **`middleware/validate.ts`** takes `validate({ body?, query?, params? })` and runs the Zod schemas. The **parsed output replaces** `req.body`/`req.query`/`req.params`, so controllers get cleaned data (trimmed, lowercased, unknown fields stripped). A `ZodError` → 400 `VALIDATION_ERROR`.
- **`auth.controller.ts`** has three HTTP-only handlers: `register` (→ **201**), `login` (→ 200), `me` (→ 200, route added with the auth middleware in 3.4). Each is ~2 lines: call the service, send `{ data }`.
- **`auth.routes.ts`** wires the route → validation → controller chain:
  ```
  POST /api/v1/auth/register   validate(registerSchema) → register
  POST /api/v1/auth/login      validate(loginSchema)    → login
  ```
- **`types/express.d.ts`** adds `req.user?: { id, role }` to Express's `Request` type (*declaration merging*).
- **`app.ts`** mounts it with `api.use('/auth', authRouter)`.

### Why
- **Layering: routes → controller → service → Prisma.** Each layer has one job:
  - Routes: URL + middleware chain.
  - Controller: HTTP in/out.
  - Service: business rules.
  - Prisma: data.
  This is easy to test, easy to find things, and business logic can be reused outside HTTP.
- **`asyncHandler`:** in Express 4 a thrown error inside an `async` function becomes a rejected promise that Express ignores. The request hangs, and Node logs an unhandled rejection. One wrapper fixes it everywhere, with no try/catch in every controller.
- **Validation as middleware:** declared per route, so you can see a route's rules at a glance. The controller never runs with bad input.
- **Replacing `req.body` with parsed output:** this is where mass-assignment protection actually happens (stripped `role`) and where normalisation (lowercased email) takes effect.
- **201 for register:** HTTP semantics, since a new resource was created. Login creates nothing, so 200.
- **`req.user!` in `me`:** the `!` asserts it's set, which is safe because the auth middleware guarantees it on that route.
- **Request logs never include bodies** (we trimmed pino-http in 1.5), so passwords from login/register never reach logs.

### How to test
```bash
# with `npm run dev` running:
curl -s -X POST http://localhost:4001/api/v1/auth/register -H "Content-Type: application/json" \
  -d '{"email":"jo@test.dev","password":"secret123","fullName":"Jo Bloggs"}'
curl -s -X POST http://localhost:4001/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@lendlite.dev","password":"Admin1234"}'
```
(PowerShell: use `curl.exe` and escape quotes, or Thunder Client / Postman in VS Code.)

Verified:

| Request | Result |
|---|---|
| register `"  CURL-…@TEST.DEV "` + `role:"ADMIN"` | **201**, email lowercased, role **CUSTOMER** |
| register same email | **409** `EMAIL_TAKEN` |
| register `{email:"nope", password:"short"}` | **400** with 4 field errors |
| login seeded admin | **200** token + user (role ADMIN), no passwordHash |
| login wrong password | **401** `INVALID_CREDENTIALS` |
| login empty body | **400** email/password Required |

### Interview points
- *"Walk me through what happens on POST /auth/login."* —
  1. helmet/cors/json parse.
  2. pino-http starts timing.
  3. Router matches `/api/v1/auth/login`.
  4. `validate` parses the body with Zod (400 if bad).
  5. Controller calls `authService.login`.
  6. Service finds the user, bcrypt-compares, signs the JWT (or throws 401).
  7. Controller sends `{ data: { token, user } }`, or `asyncHandler` forwards the error to `errorHandler`, which formats it.
- *"Why keep controllers thin?"* — Business logic in services can be unit-tested without HTTP and reused (seeds, jobs). Controllers just translate HTTP ↔ function calls.
- *"How do you add properties to Express's Request in TypeScript?"* — Declaration merging: `declare global { namespace Express { interface Request { user?: … } } }`.
- *"Why does Express 4 need an async wrapper?"* — Its router only catches *synchronous* throws. Promises must be caught and passed to `next(err)`. Express 5 does this natively.

---

## 3.4 `middleware/auth.ts` (`requireAuth`) + `GET /auth/me`

### What it does
`requireAuth` runs before protected controllers:
1. Reads `Authorization: Bearer <token>` (the scheme is case-insensitive). If it's missing or malformed → **401** `UNAUTHORIZED`.
2. `verifyToken()` (from the auth service) checks the signature, expiry, algorithm and payload shape. If anything is wrong → **401** `Invalid or expired token`.
3. Sets **`req.user = { id, role }`** and calls `next()`.

`GET /api/v1/auth/me` is now live: `requireAuth → authController.me`. It returns the current user, or 401 if the account no longer exists.

### Why
- **Middleware = write the check once, reuse it everywhere.** Any route becomes protected by adding `requireAuth` to its chain.
- **401 vs 403:**
  - **401 Unauthorized** really means *unauthenticated*: "we don't know who you are", so log in again.
  - **403 Forbidden** means "we know who you are, but you're not allowed". That's `requireRole`, next component.
- **Bearer token in a header (not a cookie):** simple for SPAs and mobile, and not sent automatically by browsers, so there's no CSRF risk. The trade-off is that the frontend must store it (localStorage → XSS risk; see the Phase 8 notes).
- **Role from the token, not the DB:** stateless, no DB query on every request. Trade-off: if an admin demotes someone, the old role works until the token expires (≤1h). `/auth/me` does hit the DB, so it reflects the current profile.
- **"User no longer exists" check in `getCurrentUser`:** a validly signed token for a deleted user is still refused.
- **Uniform 401 messages:** we don't say *which* check failed (expired vs bad signature), which gives attackers no feedback.

### How to test
```powershell
# get a token
$t = (Invoke-RestMethod -Method Post http://localhost:4001/api/v1/auth/login -ContentType 'application/json' `
      -Body '{"email":"customer@lendlite.dev","password":"Customer1234"}').data.token
curl.exe -H "Authorization: Bearer $t" http://localhost:4001/api/v1/auth/me    # 200 user
curl.exe http://localhost:4001/api/v1/auth/me                                  # 401
```
Verified:

| Authorization header | Result |
|---|---|
| none / `Basic abc123` / `Bearer ` | 401 Missing or malformed Authorization header |
| `Bearer not.a.jwt` / expired token | 401 Invalid or expired token |
| validly signed, user doesn't exist | 401 User no longer exists |
| valid token (`Bearer` or `bearer`) | **200** current user |

### Interview points
- *"Difference between 401 and 403?"* — 401: not authenticated (no or invalid credentials). 403: authenticated but not permitted.
- *"Authentication vs authorisation?"* — Authentication = *who are you?* (`requireAuth`, JWT). Authorisation = *what may you do?* (`requireRole`, ownership checks in services).
- *"Stateless JWT vs server sessions?"* — JWT: no session store, scales horizontally, but is hard to revoke and the role can be stale. Sessions: easy revocation and fresh data, but need shared storage (e.g. Redis).
- *"Where should the token be stored on the client?"* — Memory + httpOnly cookie is safest against XSS. localStorage is simpler but readable by any injected script. (We use localStorage for simplicity; documented as a trade-off.)

---

## 3.5 `middleware/requireRole.ts`

### What it does
`requireRole(...allowed)` is a **middleware factory**: you call it with roles, and it returns a middleware.
```ts
router.use(requireAuth, requireRole('ADMIN'));                 // whole admin router
router.get('/x', requireAuth, requireRole('CUSTOMER', 'ADMIN'), handler);
```
- `req.user` missing (someone forgot `requireAuth`) → **401**. It *fails closed*.
- Role not in `allowed` → **403** `FORBIDDEN`.
- Otherwise → `next()`.

### Why
- **Separate from `requireAuth`:** single responsibility. One checks *identity*, the other *permission*, and you compose them per route.
- **Factory pattern (`requireRole('ADMIN')`):** the same code works for any role combination; the roles are captured in a closure.
- **Rest parameter (`...allowed: Role[]`):** allows multiple roles, and is typed with Prisma's `Role` enum, so a typo like `'ADMN'` is a compile error.
- **Fail closed:** a security check that's misconfigured should *deny*, never *allow*.
- **Role checks are not ownership checks.** `requireRole('CUSTOMER')` says "customers may call this", not "this customer owns application X". Ownership is checked in the **service layer** (Phase 4), returning **404** for other people's applications.

### How to test
Tested on a throwaway mini app (real admin routes come in Phase 6):

| Request | Result |
|---|---|
| admin → admin-only | **200** |
| customer → admin-only | **403** `FORBIDDEN` |
| no token → admin-only | **401** (from `requireAuth`) |
| customer / admin → customer-or-admin | **200** / **200** |
| admin → route missing `requireAuth` | **401** Authentication required (fails closed) |

### Interview points
- *"How do you implement role-based access control (RBAC)?"* — Role stored on the user and carried in the JWT. A `requireRole` middleware is applied per route or router. Finer-grained rules (ownership) live in services.
- *"What does fail closed mean?"* — When a security check can't decide (missing data, misconfiguration), it denies access.
- *"What's a middleware factory?"* — A function that returns a middleware, so it can be configured (`requireRole('ADMIN')`, `validate({ body })`, `rateLimit({...})`).
- *"Why 403 for wrong role but 404 for someone else's application?"* — Admin routes are known to exist anyway, so 403 is honest. For specific resources, 404 hides whether an ID exists, which prevents ID probing.

---

## 3.6 `middleware/rateLimit.ts` (express-rate-limit)

### What it does
Two limiters, both counting **per IP per 1-minute window**:

| Limiter | Applied to | Limit | Over the limit |
|---|---|---|---|
| `loginLimiter` | `POST /auth/login` | **5/min** (spec) | 429 `RATE_LIMITED` "Too many login attempts…" |
| `authLimiter` | every `/auth/*` route | 30/min | 429 `RATE_LIMITED` "Too many requests…" |

- The custom `handler` sends the 429 through our `errorHandler`, keeping the usual `{ error: { code, message } }` shape.
- Response headers tell clients their quota: `RateLimit: "5-in-1min"; r=0; t=53` (r = remaining, t = seconds until reset) and `Retry-After: 53`.
- Route order: `loginLimiter → validate → controller`.

### Why
- **Brute-force defence:** without a limit, an attacker can try thousands of passwords per minute. With 5/min, guessing even a weak password becomes impractically slow.
- **It counts *all* attempts, not just failures:** our test's 6th attempt used the *correct* password and was still blocked. Otherwise an attacker could interleave a known-good login to reset the count.
- **Limiter before validation and bcrypt:** a blocked request costs microseconds instead of a ~200ms bcrypt hash. It also protects the CPU (bcrypt is deliberately expensive, so unlimited logins = cheap DoS).
- **Looser `/auth/*` limit:** stops scripted mass registration and enumeration via register's 409, without bothering real users.
- **429 + `Retry-After`:** the standard HTTP way to say "slow down", so clients can back off automatically.
- **Limitations (good to admit in an interview):**
  - **In-memory store:** counts reset on restart and aren't shared between instances. With multiple servers you'd use **Redis** (`rate-limit-redis`).
  - **Per-IP:** users behind one office NAT share a quota, and attackers can rotate IPs. Production systems add per-account limits, exponential backoff, CAPTCHA, or temporary lockout.
  - **Behind a proxy/load balancer** (Render, AWS ALB), every request appears to come from the proxy's IP. You must set `app.set('trust proxy', 1)` so Express reads the real IP from `X-Forwarded-For`. That's a Phase 11 deploy step.

### How to test
```powershell
# 6 logins within a minute — the 6th is 429 even with the right password
1..6 | % { curl.exe -s -o NUL -w "%{http_code}`n" -X POST -H "Content-Type: application/json" `
  --data-binary '@good.json' http://localhost:4001/api/v1/auth/login }
# → 200 200 200 200 200 429   (wait 60s and it resets)
```
Verified: #1 200, #2–5 401 (wrong password), **#6 429** with `Retry-After: 53` and `RateLimit` headers. `/auth/me` still 200 meanwhile.

### Interview points
- *"How do you protect login from brute force?"* — Rate limiting per IP (and ideally per account), slow hashing (bcrypt), generic error messages, and in production lockout/CAPTCHA/MFA.
- *"Why does your rate limiter run before validation?"* — Cheapest checks first: reject abusive traffic before spending CPU on parsing and bcrypt.
- *"Would this work with 3 server instances?"* — Not accurately. Each has its own memory counter, so the effective limit is 15/min. Use a shared store like Redis.
- *"What's `trust proxy`?"* — Behind a reverse proxy, the client IP is in `X-Forwarded-For`. Trust exactly the number of proxy hops you control, otherwise clients can spoof their IP and bypass limits.

---

# ✅ Phase 3 complete

Register/login/me endpoints with Zod validation, bcrypt hashing, JWT (HS256, 1h, algorithm pinned), `requireAuth` (401) and `requireRole` (403) middleware, and rate limiting (5 logins/min → 429). Defences against user enumeration (same error, timing-safe), mass assignment (stripped fields), `alg:none` forgery, and duplicate-email races.

---

# Phase 4 — Calculator + loan applications

## 4.1 `utils/money.ts`

### What it does
Small, pure helpers for the "money is integer cents, rates are basis points" rule:

| Helper | Example | Used for |
|---|---|---|
| `Cents`, `BasisPoints` types | `amount: Cents` | Readability (still `number` at runtime) |
| `isValidCents(n)` | `1500.5` → false | Guarding inputs/outputs |
| `roundToCents(x)` | `8884.878867` → `8885` | Turning calculated values back into whole cents |
| `bpsToDecimal(bps)` | `1250` → `0.125` | Feeding rates into the amortization formula |
| `dollarsToCents(d)` | `19.99` → `1999` | Tests and readable seed data |
| `formatAUD(cents)` | `123456` → `"$1,234.56"` | Logs and messages only |

### Why
- **Floats can't represent most decimals exactly.** `0.1 + 0.2 = 0.30000000000000004` and `19.99 * 100 = 1998.9999999999998`. Integer cents are exact: `10 + 20 = 30`.
- **Basis points:** whole numbers for rates (12.50% = 1250 bps), the standard unit in finance. They're stored exactly, with no `0.125` float in the DB.
- **Floats only exist *inside* a calculation** (the amortization formula needs powers and division). Results are immediately rounded to whole cents with `roundToCents`.
- **`Number.isSafeInteger`:** whole *and* within ±2⁵³ (≈ ±9 quadrillion cents), the range where JS integers are exact.
- **`Math.round` rounds .5 up:** fine for positive loan amounts. (Banks sometimes use *banker's rounding*, i.e. round half to even, to avoid upward bias over millions of transactions. Good to mention.)
- **`roundToCents` throws on `NaN`/`Infinity`:** a bad calculation should fail loudly, not silently store `NaN` as money.
- **API returns raw cents; formatting is the frontend's job** (`Intl.NumberFormat('en-AU', AUD)`). `formatAUD` here is only for human-readable logs.
- **One formatter instance** is created once and reused (building `Intl.NumberFormat` is relatively expensive).

### How to test
Verified with a throwaway script:
```
0.1 + 0.2                 → 0.30000000000000004   (why we avoid floats)
dollarsToCents(19.99)     → 1999
roundToCents(8884.878867) → 8885
bpsToDecimal(1250)        → 0.125
formatAUD(5000000)        → "$50,000.00"
isValidCents(1500.5)      → false
roundToCents(Infinity)    → throws RangeError
```
(Proper Jest unit tests come in Phase 7.)

### Interview points
- *"Why integer cents instead of floats?"* — Floats are binary approximations, so errors appear and compound through interest calculations. Integers are exact. Alternatives: `NUMERIC`/`DECIMAL` in Postgres plus a decimal library (e.g. decimal.js) in JS.
- *"What's a basis point?"* — 1/100th of a percent (0.01%). 1250 bps = 12.5%. It's the standard way finance quotes rates and rate changes ("the RBA raised rates by 25 bps").
- *"Where do you round?"* — At the edge of each calculation step, back to whole cents, and consistently (here: per installment, with the last installment absorbing the remainder).
- *"Where does formatting happen?"* — In the UI, with the user's locale. APIs exchange raw integers so no precision is lost.

---

## 4.2 `utils/amortization.ts`

### What it does
Pure functions that turn a loan into a repayment schedule:
- **`calculateMonthlyPayment(principalCents, annualRateBps, termMonths)`** uses the standard formula
  ```
  r = annualRateBps / 10000 / 12          (monthly rate)
  M = P · r(1+r)ⁿ / ((1+r)ⁿ − 1)          → rounded to whole cents
  ```
  For a **0% rate** the formula divides by zero, so it returns `P / n`.
- **`generateSchedule({ principalCents, annualRateBps, termMonths, startDate })`** loops month by month:
  1. `interest = round(balance × r)`: interest on what's still owed.
  2. `principal = M − interest`: the rest of the payment reduces the debt.
  3. `balance −= principal`.
  4. **Last installment:** principal = the *entire remaining balance*. It absorbs every rounding difference, so the final balance is exactly 0.
  5. `dueDate = startDate + n months`.

  Returns `{ monthlyPaymentCents, totalInterestCents, totalPaymentCents, installments[] }`.
- **`addMonths(date, n)`** works in UTC and clamps to month end (Jan 31 + 1 → Feb 28/29), always counted from the original date.
- Invalid inputs (non-integer, ≤0, negative rate) throw `RangeError`.

### Why
- **Pure function:** no DB, no `new Date()` inside (the start date is passed in). Same input → same output, so it's trivially unit-testable and reusable by the calculator (quote) *and* the approval (real schedule).
- **Interest front-loaded:** each month's interest is on the *current* balance. Early payments are mostly interest, later ones mostly principal (see the table: $100.00 interest in month 1 vs $8.80 in month 12).
- **Round every installment, fix up at the end:** each row is whole cents (what a customer actually pays). The tiny per-month rounding differences accumulate, so the **last payment absorbs them** and the books balance to exactly 0. The spec requires this.
- **Due dates from the original date, not chained:** chaining would drift (Jan 31 → Feb 28 → Mar 28 → …). Computing each from the start date gives Jan 31 → Feb 29 → **Mar 31**.
- **UTC:** avoids daylight-saving and server-timezone surprises (Sydney's DST would otherwise shift dates by an hour, or even a day).
- **Defensive input checks:** this function feeds money into the DB. Bad inputs should fail loudly, never produce `NaN` installments.

### How to test
Spec example, $10,000 at 12% for 12 months (verified):
```
monthly payment: $888.49 | total interest: $661.86 | total paid: $10,661.86
 1 2026-11-19  $888.49  principal $788.49  interest $100.00  balance $9,211.51
 …
12 2027-10-19  $888.47  principal $879.67  interest   $8.80  balance     $0.00   ← absorbs 2¢
```
- 0%: $1,000 / 3 → $333.33, $333.33, **$333.34**, balance $0.
- Dates from Jan 31 2028 → Feb 29, Mar 31, Apr 30.
- **Property check over 2,000 random loans** (within spec limits): 0 failures. Final balance always 0, Σprincipal = loan amount, every value a whole cent, payment = principal + interest every row. Largest last-payment adjustment: 54¢.

(Formal Jest unit tests in Phase 7.)

### Interview points
- *"Explain the amortization formula."* — It's the fixed payment M that, after n months of charging interest r on the remaining balance, brings the balance exactly to zero (the present value of an annuity, solved for the payment).
- *"How do you handle rounding?"* — Round each installment's interest and payment to whole cents; the final installment pays off the exact remaining balance, absorbing accumulated differences.
- *"Why is this a pure function?"* — Testability and reuse. The calculator and the approval flow share it, and tests need no DB or fake clock.
- *"Any date edge cases?"* — Month-end clamping (31st → 28th/29th/30th), leap years, avoiding drift by computing from the original date, and using UTC to avoid timezone/DST bugs.
- *"How did you test it beyond the example?"* — A property-style test: thousands of random valid loans, asserting invariants (balance ends at 0, principals sum to the loan) rather than specific numbers.

---

<!-- Next: 4.3 calculator module -->
