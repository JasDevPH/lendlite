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

## 4.3 Calculator module — `POST /api/v1/calculator/quote`

### What it does
- **`config/loanRules.ts`** holds `LOAN_LIMITS`: amount $2,000–$50,000 (in cents), term 6–60 months, rate 500–2500 bps. It's the **single source** for every limit.
- **`calculator.schema.ts`**: `quoteSchema` takes `{ amountCents, termMonths, annualRateBps }`, all **strict integers** within `LOAN_LIMITS`, with friendly messages.
- **`calculator.service.ts`**: `getQuote()` calls the **same `generateSchedule`** used for real approvals and returns the inputs + `monthlyPaymentCents`, `totalInterestCents`, `totalPaymentCents`.
- **`calculator.controller.ts`**: a sync handler that sends `{ data: quote }`.
- **`calculator.routes.ts`**: `POST /quote` is **public** (no `requireAuth`), mounted at `/api/v1/calculator`.

### Why
- **Module structure (`schema → service → controller → routes`):** the same shape as `auth`. Every feature looks alike, so it's easy to navigate and explain.
- **Shared `LOAN_LIMITS`:** if the business changes the max loan to $75k, it's one edit, and the calculator, application validation and approval can't drift apart.
- **Reusing `generateSchedule` (not a separate formula):** the quote shown on the landing page always matches what the customer would really be charged at that rate. Total interest comes from the actual rounded schedule, not an approximation.
- **Strict numbers, no coercion:** `"1000000"` (a string) is rejected. A string where a number belongs is a client bug, and guessing could hide it. Fractional cents (`1200.5`) are rejected too.
- **No `asyncHandler`:** the handler is synchronous (no DB). Express 4 *does* catch synchronous throws by itself.
- **POST for a read-only calculation:** the input is a structured JSON body; nothing is created. (GET with query params would also be valid. POST keeps typing simple and URLs clean.)
- **Public endpoint:** CPU-cheap and DB-free, so low abuse risk. A global rate limiter would be a sensible production addition.

### How to test
```powershell
# body.json: {"amountCents":1000000,"termMonths":12,"annualRateBps":1200}
curl.exe -X POST -H "Content-Type: application/json" --data-binary "@body.json" http://localhost:4001/api/v1/calculator/quote
```
Verified:

| Input | Result |
|---|---|
| $10k / 12% / 12m | **200** `monthlyPaymentCents: 88849`, `totalInterestCents: 66186` ✓ spec |
| $50k / 25% / 60m | **200** `146757` / month, `3805380` interest |
| `amountCents: 199999` | 400 "Minimum loan amount is $2,000" |
| string amount, term 61, rate 1200.5 | 400 with 3 field errors |
| `{}` | 400, all 3 fields Required |

### Interview points
- *"Why does the calculator reuse the schedule generator?"* — One source of truth: the quote and the real approved schedule can never disagree. Totals are computed from actual rounded installments.
- *"Where do business limits live?"* — In one config module, imported by validation schemas and services, never as magic numbers scattered around.
- *"Why reject `\"1000000\"` instead of converting it?"* — Be strict in what you accept for financial input. Silent coercion can hide client bugs, e.g. a dollars-vs-cents mix-up.
- *"Is it OK for this endpoint to be public?"* — Yes. It reads no data and writes nothing. In production, add a general rate limit to protect CPU.

---

## 4.4 `modules/applications/applications.schema.ts` (+ shared loan fields)

### What it does
- **`config/loanRules.ts`** now also exports reusable Zod fields built from `LOAN_LIMITS`: `amountCentsField`, `termMonthsField`, `annualRateBpsField`. The calculator schema was refactored to use them (same behaviour).
- **`createApplicationSchema`** (`POST /applications` → new DRAFT):
  - **Required:** `amountCents`, `termMonths`, `purpose` (trimmed, 3–200 chars). That's step 1 of the form.
  - **Optional:** `employmentType` (Prisma enum), `employerName`, `annualIncomeCents`, `monthlyExpensesCents` (whole cents, 0–$10M). That's step 2.
- **`updateApplicationSchema`** (`PATCH /applications/:id`): the same fields, **all optional**, plus a `.refine` rejecting an empty update.
- **`applicationIdParamsSchema`**: `:id` must be a UUID.
- Inferred types: `CreateApplicationInput`, `UpdateApplicationInput`.

### Why
- **Shared field validators:** the amount rule is written once and used by the calculator, create, update (and later approval for the rate). It can't drift.
- **Client can't set protected fields:** `status`, `userId`, `annualRateBps`, `rejectionReason`, `decidedAt` aren't in the schemas, so they're **stripped** (mass-assignment protection). Only the service and admin endpoints change those.
- **Employment fields optional on a draft:** a multi-step form saves progress as it goes. *Completeness* ("all fields filled") is a **business rule checked at submit** in the service, not a per-request shape rule.
- **`.refine` for empty PATCH:** `{}` (or a body with only forbidden fields, which become `{}` after stripping) is almost certainly a client bug, so we say so instead of silently doing nothing.
- **UUID check on `:id`:** a malformed ID like `123` gets a clean 400 instead of hitting the DB. Prisma would throw on an invalid UUID for a uuid column. Here it's a text column, so it would just be a wasted query.
- **`z.nativeEnum(EmploymentType)`:** uses the Prisma-generated enum, so the API's allowed values always match the database's.
- **Sanity cap on income ($10M):** catches typos (e.g. dollars sent as cents ×100) and keeps values well within integer limits.

### How to test
Verified with a throwaway script:

| Input | Result |
|---|---|
| create `purpose: "  Car purchase  "` | OK, trimmed |
| create + `status/userId/annualRateBps` | OK, those fields **stripped** |
| create missing purpose, amount $60k | 400 Required + Maximum $50,000 |
| create `employmentType: "ASTRONAUT"`, income −1 | 400 invalid enum + Cannot be negative |
| update employment fields only | OK |
| update `{}` / update only `{status}` | 400 Provide at least one field |
| params `id: "123"` | 400 Invalid application id |

### Interview points
- *"How do you stop a customer approving their own loan via PATCH?"* — The update schema whitelists editable fields, and `status` isn't one of them. On top of that, the service only allows edits while the status is DRAFT, and status changes go through dedicated, role-guarded endpoints.
- *"Shape validation vs business rules?"* — Zod checks *shape* (types, ranges, formats) per request. The service enforces *business rules* that need context: ownership, current status, "all fields filled + documents present before submit".
- *"Why validate route params?"* — Every input is untrusted, URLs included. Early validation gives clear errors and avoids pointless DB work.

---

## 4.5 `applications.service.ts` (+ `lib/audit.ts`, `types/auth.ts`)

### What it does
- **`types/auth.ts`**: `AuthUser = { id, role }`, the type for "who is calling". `req.user` uses it, and services take it as a parameter (never the Express `req`).
- **`lib/audit.ts`** (the spec's "audit log helper", built early because `create` needs it): `recordAudit(tx, { applicationId, actorId, action, fromStatus?, toStatus?, metadata? })`. It takes a **transaction client**, so audit rows are saved atomically with the change.
- **`applications.service.ts`**:

| Function | Who | Rules |
|---|---|---|
| `createApplication(user, input)` | customer | `userId` from the token; DRAFT + `CREATED` audit row in **one transaction** |
| `listMyApplications(user)` | customer | Only `userId = me`, newest first |
| `getApplication(id, user)` | owner or admin | Includes `documents` + `schedule` (ordered); others → **404** |
| `updateDraft(id, user, input)` | **owner only** | Not mine → **404**; not DRAFT → **409** `APPLICATION_NOT_EDITABLE`; atomic DRAFT-only update |

### Why
- **Business rules live in the service, not the controller.** Ownership and status rules are enforced in one place no matter who calls it (HTTP, tests, a future job). The spec demands this ("enforce in the service layer").
- **404 instead of 403 for someone else's application:** if you returned 403, an attacker could tell "this ID exists but isn't yours" apart from "no such ID", and probe for valid IDs. With the same 404 for both, nothing leaks. (UUIDs make guessing hard; this closes the gap entirely.)
- **Ownership inside the `WHERE` clause** (`{ id, userId }`), not "fetch then compare": there's no code path where someone else's data is even loaded into memory, and it's one query.
- **`userId` from the token, never the body:** a customer can't create an application in someone else's name.
- **Transactions for create + audit:** if the audit insert fails, the application isn't created either. An audit trail with gaps is worthless for compliance.
- **Atomic conditional update (`where: { id, status: 'DRAFT' }`):** "check then update" has a race. A submit could land between the read and the write. Putting `status: DRAFT` in the update's WHERE means the DB only updates if it's *still* a draft. Otherwise Prisma throws **P2025** and we return 409. This is **optimistic concurrency** in miniature.
- **409 Conflict for editing a non-draft:** the request is valid, but it conflicts with the resource's current state.
- **Admins can view but not edit customer data:** separation of duties. Admins act via dedicated review endpoints (Phase 6), each audited.
- **No audit row for draft edits:** the spec's actions are status changes and uploads. Editing a draft isn't a decision point.

### How to test
Verified with a throwaway script against Neon (test data deleted afterwards):
```
✔ customer creates draft                → status DRAFT, audit: CREATED →DRAFT by customer
✔ customer lists own                    → contains it; OTHER customer's list does not
✔ owner gets detail                     → includes documents[] and schedule[]
✔ admin gets detail
✖ OTHER customer gets detail            → 404 NOT_FOUND
✖ non-existent id                       → 404 NOT_FOUND (identical response)
✔ owner updates draft                   → employer set, other fields unchanged
✖ OTHER customer / admin updates        → 404 NOT_FOUND
✖ owner edits after SUBMITTED           → 409 APPLICATION_NOT_EDITABLE
```

### Interview points
- *"Why 404 and not 403 for another user's application?"* — To avoid an enumeration oracle: "not yours" and "doesn't exist" must look identical.
- *"Where do you enforce ownership?"* — In the service, as part of the DB query's WHERE clause, so it's impossible to forget in a controller and impossible to load others' data by accident.
- *"What's a race condition here and how did you handle it?"* — Read DRAFT → (submit happens) → write. Fixed with a conditional update (`WHERE status = 'DRAFT'`), letting the database be the arbiter.
- *"Why write the audit log inside the same transaction?"* — Atomicity: the change and its record must succeed or fail together.
- *"Why pass `AuthUser` into services instead of `req`?"* — It keeps services framework-independent and testable; they don't know HTTP exists.

---

## 4.6 `applications.controller.ts` + `applications.routes.ts`

### What it does
Mounted at `/api/v1/applications`, with **`requireAuth` on the whole router**:

| Method | Path | Roles | Chain | Success |
|---|---|---|---|---|
| POST | `/` | CUSTOMER | validate body → `create` | **201** |
| GET | `/` | CUSTOMER | `listMine` | 200 |
| GET | `/:id` | CUSTOMER, ADMIN | validate params → `getOne` | 200 (others' → 404) |
| PATCH | `/:id` | CUSTOMER | validate params + body → `update` | 200 (non-draft → 409) |

The controllers are ~2 lines each: pull `req.user`, `req.params.id`, `req.body` → call the service → `{ data }`.

### Why
- **`router.use(requireAuth)` once:** every route in the module is protected by default, so you can't forget it on a new route.
- **Layered checks, each with its own status code:**
  1. `requireAuth` → **401** (who are you?)
  2. `requireRole` → **403** (is your *role* allowed on this route?)
  3. `validate` → **400** (is the input well-formed?)
  4. service → **404** (is it *yours*?) / **409** (is it in the right *state*?)
- **Order inside the chain:** cheap checks first. Auth and role are rejected before parsing bodies or touching the DB.
- **Admin can GET any application but not POST/PATCH/list:** admins review via `/admin/*` (Phase 6). The customer list is "*my* applications", which is meaningless for an admin.
- **`req.params as { id: string }`:** with `noUncheckedIndexedAccess`, `req.params.id` is typed `string | undefined`. The `validate({ params })` middleware already guarantees it's a UUID, so the cast is safe.

### How to test
Verified end-to-end over HTTP (logged in as customer, a 2nd customer, and admin):

| Request | Result |
|---|---|
| customer POST (+ `status:"APPROVED"`) | **201** DRAFT (status ignored) |
| admin POST / no token POST / bad body | **403** / **401** / **400** |
| customer GET list / other customer GET list | 200 with 1 app / 200 with 0 apps |
| admin GET list | **403** |
| owner GET :id / admin GET :id | 200 (documents [], schedule []) / 200 |
| other customer GET :id | **404** |
| GET `/applications/not-a-uuid` | **400** |
| owner PATCH / other PATCH / PATCH `{}` | 200 / **404** / **400** |
| owner PATCH after SUBMITTED | **409** `APPLICATION_NOT_EDITABLE` |

### Interview points
- *"Walk me through the checks on PATCH /applications/:id."* — Token (401) → role (403) → param + body shape (400) → ownership (404) → status is DRAFT (409) → atomic update → 200.
- *"Why put requireAuth on the router rather than each route?"* — Secure by default: a newly added route can't accidentally be public.
- *"Which status code when?"* — 400 malformed input, 401 not logged in, 403 wrong role, 404 not found / not yours, 409 conflicts with the current state.

---

## 4.7 Submit with idempotency — `POST /applications/:id/submit`

### What it does
- **`applications.status.ts`**: the status machine **as data**:
  ```
  DRAFT → [SUBMITTED]   SUBMITTED → [UNDER_REVIEW]   UNDER_REVIEW → [APPROVED, REJECTED]
  APPROVED → []         REJECTED → []   (final)
  ```
  `assertTransition(from, to)` throws **409 `INVALID_STATUS_TRANSITION`**. It's reused by the admin actions in Phase 6.
- **`submitApplication(id, user, key?)`**, in order:
  1. Owner check → 404.
  2. **If a key is given:**
     - Same key already on *this* app → **replay**: return the stored application, process nothing.
     - Key on a *different* app → **409 `IDEMPOTENCY_KEY_REUSED`**.
  3. `assertTransition(status, SUBMITTED)` → 409 if not a DRAFT.
  4. Completeness check → **400 `APPLICATION_INCOMPLETE`** with `details.missingFields`. (`employerName` isn't required when UNEMPLOYED; income/expenses of **0 are valid**, so it checks `== null`, not falsiness.)
  5. **Transaction:** conditional update `WHERE status = DRAFT` → SUBMITTED, `submittedAt`, store the key; plus a `SUBMITTED` audit row.
  6. **Race handling:**
     - **P2025** (no longer a draft): if the winner used the *same key*, replay. Otherwise 409.
     - **P2002** (key grabbed concurrently by another app): 409.
- **Controller:** validates the optional `Idempotency-Key` header (8–255 chars, 400 if malformed) and sets **`Idempotent-Replayed: true`** on replays. Returns 200 + the application either way.
- **CORS `exposedHeaders`:** `Idempotent-Replayed` and `Retry-After`, so browser JS can read them.
- *Phase 5 will add:* "at least one ID and one PAYSLIP document" to the completeness check.

### Why
- **The problem idempotency solves:** the customer clicks Submit, the network drops before the response arrives, and the app retries. Without protection, the retry would fail with a confusing 409 or (in other systems, e.g. payments) **process twice**. With a key, the server recognises the retry and returns the original result.
- **How the client should use it:** generate one random key (UUID) per *intent* ("submit this application"), and reuse it for every retry of that intent.
- **Key stored on the application row with a UNIQUE index:** the DB guarantees one key ↔ one application, even under concurrency.
- **Same key on another application → 409:** that's a client bug (reusing keys across different operations), so refuse loudly rather than guess.
- **Status machine as a lookup table:** all allowed transitions are visible in 5 lines, there's one function to check them, and it's easy to test and to extend (e.g. adding WITHDRAWN).
- **Conditional update `WHERE status = DRAFT`:** two simultaneous submits can both pass the "is it a draft?" check. Only one UPDATE can match, and the loser gets P2025. If it carried the same key it's a duplicate of the same intent, so we replay instead of erroring.
- **400 for incomplete vs 409 for wrong state:** incomplete data is fixable *by the client's input*; wrong state is a *conflict with the resource*.
- **200, not 201:** submit changes an existing resource; nothing new is created.

### How to test
Verified over HTTP (test data deleted afterwards):
```
201  create draft
400  submit incomplete            APPLICATION_INCOMPLETE {"missingFields":["employmentType","employerName",...]}
200  edit: fill employment (expenses = 0)
200  submit with key A            status=SUBMITTED submittedAt=…5.544Z
200  RETRY with key A             same submittedAt, identical body   [Idempotent-Replayed]
409  edit after submit            APPLICATION_NOT_EDITABLE
409  submit again without key     INVALID_STATUS_TRANSITION
409  submit again with NEW key    INVALID_STATUS_TRANSITION
     audit trail: CREATED → SUBMITTED (exactly one SUBMITTED)
409  key A on a different app     IDEMPOTENCY_KEY_REUSED
400  key "abc"                    path "idempotency-key": at least 8 characters
RACE: 2 simultaneous submits, same key → both 200 (2nd [Idempotent-Replayed]), 1 audit row
```

### Interview points
- *"What is idempotency and why does a lending API need it?"* — Doing an operation once or many times has the same effect. Networks fail and clients retry; idempotency keys make retries safe (no duplicate submissions, payments or loans).
- *"How did you implement it?"* — Client sends `Idempotency-Key`. The server stores it on the application (unique index) in the same transaction as the status change. A repeat with the same key returns the stored result; reuse on a different resource → 409.
- *"What about two identical requests at the exact same time?"* — The conditional update lets only one win. The loser sees the key already stored and replays. I tested this with `Promise.all`: both 200, exactly one audit row.
- *"Why is the status machine in the service layer?"* — It's a business rule: it must hold for every caller (HTTP, admin tools, jobs), and it belongs next to the transaction that changes the status.
- *"How would this differ for payments?"* — Same idea, but you'd usually store keys in their own table (key, request hash, response, expiry), so any endpoint can be idempotent and you can detect "same key, different body".

---

# ✅ Phase 4 complete

Money helpers (cents/bps), pure amortization (spec example ✓, 2,000-loan property check), public calculator quote, application schemas with shared loan rules, service with ownership (404) and draft rules (409), REST endpoints, status machine, transactional audit log, and idempotent, race-safe submit.

---

# Phase 5 — Documents

## 5.1 `middleware/upload.ts` (multer config) + multer errors in `errorHandler`

### What it does
- **`UPLOAD_ROOT`** = `resolve(env.UPLOAD_DIR)`, an absolute path, created at startup if missing.
- **Allow-list** of MIME type → extensions: `application/pdf → .pdf`, `image/jpeg → .jpg/.jpeg`, `image/png → .png`.
- **`fileFilter`** accepts only if the MIME type is allowed **and** the file's extension belongs to *that* type. Otherwise → **400 `INVALID_FILE_TYPE`**.
- **`diskStorage`** saves as **`<random UUID><ext>`** (e.g. `f56191cb-….pdf`) in `UPLOAD_ROOT`.
- **Limits:** `fileSize` = `MAX_UPLOAD_MB` (5 MB), `files: 1`, `fields: 5`.
- **`uploadSingleFile`** = `multer(...).single('file')`: one file from the multipart field `file`. Text fields like `type` land in `req.body`.
- **`errorHandler`** now maps `MulterError`:
  - `LIMIT_FILE_SIZE` → **413 `FILE_TOO_LARGE`** (spec).
  - Anything else (wrong field name, too many files) → **400 `INVALID_UPLOAD`**.
- **Multer 2.x:** the maintained line; 1.x had known DoS vulnerabilities.

### Why
- **Never trust the client's filename on disk:** it could be `../../src/app.ts` (path traversal), collide with another user's file, or contain odd characters. A random UUID name has none of those problems and can't be guessed. The original name is kept only in the DB, for display.
- **Check mimetype *and* extension:** each alone is easy to fake. Requiring them to agree blocks lazy tricks like `virus.exe` renamed to `virus.pdf` (sent as `application/x-msdownload`), or a PNG named `.pdf`.
- **Honest limitation:** both values are still **client-supplied**. A determined attacker can send real malware labelled `application/pdf` named `x.pdf`. Stronger options:
  - **Magic-byte check:** read the file's first bytes (`%PDF`, `\x89PNG`, `FF D8 FF`). Added in the documents service next.
  - Antivirus scanning, and serving files with `Content-Disposition: attachment`.
- **Size limit enforced while streaming:** multer stops reading at 5 MB. It doesn't buffer a 2 GB upload first, and partial files are deleted (verified: nothing left on disk).
- **413 Payload Too Large:** the correct HTTP status, so clients can show "file too big" specifically.
- **`files: 1`, `fields: 5`:** caps on multipart abuse (thousands of fields/files in one request).
- **Absolute upload path:** `./uploads` relative to *wherever the process started* is a classic deploy bug.
- **Local disk is dev-only:** in production (multiple instances, ephemeral containers) files go to object storage like **S3**. That's optional Phase 11.

### How to test
Verified on a throwaway app (temp folder, cleaned up):

| Upload | Result |
|---|---|
| `Payslip March.PDF` (application/pdf) | **200**, saved as `<uuid>.pdf`, original name kept |
| `id.jpeg` (image/jpeg) | **200** |
| `../../src/app.png` | **200**, original reduced to `app.png`, saved as `<uuid>.png` |
| `notes.txt` / `virus.pdf` as exe type / `scan.pdf` as image/png | **400** `INVALID_FILE_TYPE` |
| 6 MB PDF | **413** `FILE_TOO_LARGE` |
| field named `document` / two files | **400** `INVALID_UPLOAD` |

Only the 3 valid files remained on disk.

### Interview points
- *"How do you secure file uploads?"* — Allow-list types (MIME + extension + ideally magic bytes), size limits enforced while streaming, random storage names, store outside the web root, check ownership on download, and in production use object storage + virus scanning.
- *"Why rename uploaded files?"* — Path traversal, overwrites, unguessable names, and no reliance on user-controlled strings in filesystem paths.
- *"Can you trust the Content-Type of an upload?"* — No, it's set by the client. Check the actual bytes (magic numbers) for stronger assurance.
- *"Why 413?"* — It's the standard "Payload Too Large" status: specific, and lets clients react appropriately.

---

## 5.2 `documents.service.ts` + `documents.schema.ts`

### What it does
- **Schema:**
  - `uploadDocumentBodySchema`: `type` must be `PAYSLIP | ID | BANK_STATEMENT`.
  - `documentIdParamsSchema`: UUID.
- **`uploadDocument(applicationId, user, file, type)`**, called *after* multer saved the file:
  1. Owner check → 404 (same as applications).
  2. Application must be **DRAFT** → else 409 `APPLICATION_NOT_EDITABLE`.
  3. **Magic-byte check:** reads the file's first bytes and compares them to the real signature for the declared type (`%PDF-`, `\x89PNG…`, `FF D8 FF`). Mismatch → 400 `INVALID_FILE_TYPE`.
  4. **Transaction:** `Document` row (original `fileName` for display, **relative** `storagePath`, mime, size) + `DOCUMENT_UPLOADED` audit row (metadata: documentId, type, fileName).
- **`discardUpload(file)`** deletes a file we're not keeping. It never throws (a cleanup failure mustn't hide the real error). The controller calls it whenever upload processing fails.
- **`getDocumentForDownload(id, user)`**:
  - Owner (via the parent application, inside the query) or admin; others → 404.
  - Resolves `storagePath` inside `UPLOAD_ROOT` and refuses anything that escapes it.

### Why
- **Magic bytes > MIME type + extension:** the filename and `Content-Type` are typed by the client. The first bytes *are the file*. Tested: an `.exe` (`MZ` header) named `virus.pdf` with type `application/pdf` passed multer's checks but was **rejected here**.
- **Documents frozen after submit:** what the reviewer assesses must be exactly what was submitted. Changing documents mid-review would undermine the decision and the audit trail.
- **Relative `storagePath`:** store `4a6e…pdf`, not `C:\Users\…\uploads\4a6e…pdf`. Moving the upload folder (new server, Docker volume, later S3 key) doesn't break existing rows.
- **Path containment check (`startsWith(UPLOAD_ROOT + sep)`):** even if a DB row were tampered with (`../../.env`), download can't read files outside the upload folder. Defence in depth. Tested → 404.
- **Ownership through the relation (`application: { userId }`):** documents don't have their own owner column. Ownership is inherited from the application and checked in the same query.
- **Audit log for uploads:** "who added which document, when" matters in lending (e.g. a payslip swapped before review).
- **Cleanup is the caller's job, done in one place:** multer writes the file *before* we know if it's allowed (ownership, status, bytes). Every failure path must delete it, or the disk fills with orphans.
- *Known gaps (fine for this project, worth mentioning):*
  - Files are written *before* the ownership check (an attacker could make the server write-then-delete files). A pre-multer ownership middleware would avoid that.
  - Deleting an application removes document *rows* (cascade) but not *files*. There's no delete endpoint in the API, but a real system would clean up storage too.

### How to test
Verified directly against the service with real file headers (temp folder):
```
✔ real PDF / PNG / JPEG                  → saved; storagePath = "<uuid>.pdf" (relative)
✖ .exe disguised as PDF                  → 400 INVALID_FILE_TYPE (magic bytes)
✖ PNG bytes declared as PDF              → 400 INVALID_FILE_TYPE
✖ other customer uploads                 → 404
   3 DOCUMENT_UPLOADED audit rows (one per accepted file)
✔ owner / admin download lookup          → path inside UPLOAD_ROOT
✖ other customer download lookup         → 404
✖ tampered storagePath "../../.env"      → 404
✖ upload after SUBMITTED                 → 409 APPLICATION_NOT_EDITABLE
```

### Interview points
- *"What are magic bytes?"* — Fixed signatures at the start of a file format (PDF starts with `%PDF-`, PNG with `89 50 4E 47…`). Checking them verifies the content, not just the label.
- *"How do you prevent path traversal on download?"* — Never build paths from user input. Store generated names, resolve against a fixed root, and verify the result is still inside that root.
- *"Why store relative paths?"* — Portability: storage location is config, not data. The same idea as storing an S3 *key* rather than a full URL.
- *"Why can't documents change after submit?"* — Integrity of the review: the decision and audit trail refer to a fixed set of evidence.

---

## 5.3 Upload + download routes (`documents.controller.ts`, `documents.routes.ts`)

### What it does
| Method | Path | Roles | Chain |
|---|---|---|---|
| POST | `/api/v1/applications/:id/documents` | CUSTOMER | requireAuth → role → validate `:id` → **multer** → `upload` |
| GET | `/api/v1/documents/:id/download` | CUSTOMER, ADMIN | requireAuth → role → validate `:id` → `download` |

- **`upload` controller:**
  - No file → 400 `FILE_REQUIRED`.
  - Then, inside `try`: parse `type` with Zod → `uploadDocument` → **201**.
  - **Any error → `discardUpload(file)`, then rethrow** to the error handler.
- **`download` controller:**
  - Ownership lookup.
  - `Cache-Control: private, no-store`.
  - `res.download(path, originalName)` streams the file with `Content-Disposition: attachment; filename="March Payslip.pdf"`.
  - A missing file on disk → 404 instead of a crash.
- The upload route lives in `applications.routes.ts` (URL is under `/applications`); the download route is in its own `/documents` router.

### Why
- **Cheap checks before multer:** auth, role and the UUID check run *before* the file is streamed to disk, so unauthenticated or malformed requests never write anything.
- **Why `type` isn't validated by `validate()` middleware:** multipart bodies are only parsed *by multer*, so `req.body.type` doesn't exist before it. A failure there must also delete the saved file. Doing it inside the controller's `try` gives one cleanup path for every failure.
- **Every failure path cleans up:** bad type, bad `type` field, not owner, not draft, magic bytes, DB error. Verified: 9 rejected uploads, 0 orphan files.
- **`Content-Disposition: attachment`:** the browser downloads instead of rendering inline, so a malicious file can't execute in our origin (e.g. HTML/SVG XSS). helmet's `nosniff` stops browsers guessing a different type.
- **`Cache-Control: private, no-store`:** payslips and IDs must not be cached by shared proxies or left in browser cache.
- **Original filename only in the download header:** on disk it's still the random name.
- **Streaming (`res.download`):** the file is piped to the response, never loaded fully into memory.

### How to test
```powershell
# PowerShell 7+ / curl.exe:
curl.exe -H "Authorization: Bearer $t" -F "type=PAYSLIP" -F "file=@C:\path\payslip.pdf" `
  http://localhost:4001/api/v1/applications/<appId>/documents
curl.exe -H "Authorization: Bearer $t" -OJ http://localhost:4001/api/v1/documents/<docId>/download
```
(Thunder Client / Postman: Body → Form, field `file` as File, `type` as Text.)

Verified end-to-end:

| Request | Result |
|---|---|
| valid PDF (PAYSLIP / ID) | **201**, random `storagePath` |
| `.txt` / exe-as-PDF / bad or missing `type` / no file | **400** |
| 6 MB | **413** |
| admin upload / unknown app | **403** / **404** |
| upload after SUBMITTED | **409** |
| owner & admin download | **200**, exact bytes, `attachment; filename="March Payslip.pdf"`, `private, no-store` |
| other customer / no token download | **404** / **401** |
| files left on disk | **2** (only the accepted ones) |

### Interview points
- *"What happens to the file if validation fails after upload?"* — Multer has already written it, so the controller wraps processing in try/catch and deletes the file on any error. Verified: no orphans.
- *"How do you serve user-uploaded files safely?"* — Check ownership; stream from a fixed root; `Content-Disposition: attachment`; `nosniff`; no caching for sensitive data; never serve the upload folder as static files.
- *"Why not `express.static('uploads')`?"* — Anyone with the URL could fetch any file, with no auth, no ownership check and no audit.

---

## 5.4 Submit rule: requires an ID + PAYSLIP document

### What it does
`submitApplication` now also checks documents, after the status check:
- `REQUIRED_DOCUMENT_TYPES = ['ID', 'PAYSLIP']`.
- A query fetches the **distinct document types** uploaded for the application.
- Missing types are reported **together with** missing fields in one 400:
  ```json
  { "error": { "code": "APPLICATION_INCOMPLETE",
      "details": { "missingFields": ["employmentType", …], "missingDocuments": ["ID", "PAYSLIP"] } } }
  ```
- `BANK_STATEMENT` is allowed but optional.

### Why
- **Business rule in the service:** "can't submit without ID + payslip" is lending policy (identity verification + income evidence), so it lives with the other submit rules.
- **Report everything at once:** the UI can show a full checklist ("upload your ID, fill in employer") instead of making the customer fix one thing, resubmit, and discover the next.
- **Separate documents query (not `include` on the application):** the idempotent *replay* returns the application exactly as originally returned. Including documents in that query would change the replay's response shape. Verified: replay body still identical.
- **`distinct: ['type']`:** we only need *which* types exist, not every row.
- **Checked *after* the status check:** a SUBMITTED application gets 409 (wrong state), not a misleading "missing documents" 400.

### How to test
Verified end-to-end:
```
400  bare draft            missingFields [employmentType, employerName, …], missingDocuments [ID, PAYSLIP]
400  fields done, no docs  missingDocuments [ID, PAYSLIP]
201  upload PAYSLIP     →  400 missingDocuments [ID]
201  upload BANK_STATEMENT → 400 missingDocuments [ID]   (optional type doesn't count)
201  upload ID          →  200 SUBMITTED
200  retry same key        [replayed], body identical
     audit: CREATED → DOCUMENT_UPLOADED ×3 → SUBMITTED
```

### Interview points
- *"Why require an ID and a payslip?"* — Responsible lending: verify identity (KYC) and income before assessing affordability. In Australia, responsible-lending obligations require lenders to verify a borrower's financial situation.
- *"How does your API tell the UI what's missing?"* — A stable error code plus structured `details` (`missingFields`, `missingDocuments`), not just a human message, so the frontend can render a checklist.

---

# ✅ Phase 5 complete

Secure document uploads: multer with MIME + extension allow-list, 5 MB limit (413), random filenames, **magic-byte content check**, owner + DRAFT-only rules, transactional audit, guaranteed cleanup of rejected files, safe streaming download (attachment, no-store, path containment), and the ID + PAYSLIP submit requirement.

---

# Phase 6 — Admin review

## 6.1 Admin list with filters + pagination — `GET /admin/applications`

### What it does
- **`admin.routes.ts`**: `adminRouter.use(requireAuth, requireRole('ADMIN'))`, so **every** admin route is admin-only by default. Mounted at `/api/v1/admin`.
- **`listApplicationsQuerySchema`** (query string):
  - `status`: enum, optional.
  - `minAmount` / `maxAmount`: whole cents ≥ 0; refine: min ≤ max.
  - `page`: ≥ 1, default 1.
  - `pageSize`: 1–100, default 20.
  - Uses **`z.coerce`**, because query values arrive as strings.
- **`listApplications(query)`**:
  - **Filters:** `status`, or by default *everything except DRAFT*; `amountCents` between `gte`/`lte` (inclusive).
  - **Count + page in one `$transaction([...])`.**
  - **Order:** `createdAt desc, id asc` (stable).
  - **Pages:** `skip = (page − 1) × pageSize`, `take = pageSize`.
  - **Includes:** applicant `{ id, email, fullName }` and `_count.documents`.
- **Response:**
  ```json
  { "data": { "items": [...], "pagination": { "page": 1, "pageSize": 20, "total": 6, "totalPages": 1 } } }
  ```

### Why
- **Router-level admin guard:** secure by default. A new `/admin/*` route can't accidentally be public or customer-accessible.
- **`z.coerce` for query, strict numbers for JSON bodies:** query strings are *always* text (`?page=2` → `"2"`), so coercion is correct here. In JSON, a string where a number belongs is a client bug.
- **Drafts hidden by default:** admins review *submitted* work. A customer's half-finished draft isn't their business unless they specifically look.
- **`pageSize` capped at 100:** protects the DB and API from `?pageSize=1000000`.
- **Count and rows in one transaction:** without it, a row inserted between the two queries could make `total` disagree with the items.
- **Stable sort with a tie-breaker:** with `ORDER BY createdAt` alone, rows with identical timestamps can come back in a different order on each query, so an item could appear on page 1 *and* page 2, or on neither. Adding `id` makes the order deterministic.
- **Offset pagination trade-off:** simple, and it supports "jump to page 5". For huge tables or infinite scroll, **cursor pagination** (`WHERE (createdAt, id) < (lastCreatedAt, lastId)`) is faster and stable under inserts. Good to mention.
- **The indexes pay off here:** `@@index([status])` from Phase 2 serves this exact filter.
- **`select` on `user`:** joins in the applicant's name/email for the table, never the password hash.

### How to test
```
GET /api/v1/admin/applications?status=SUBMITTED&minAmount=500000&maxAmount=4000000&page=1&pageSize=20
```
Verified with 7 test applications (1 DRAFT + 6 others):

| Query | Result |
|---|---|
| (none) | 6 items, **DRAFT hidden**, applicant info, no passwordHash |
| `status=SUBMITTED` / `status=DRAFT` | 3 / 1 |
| `minAmount=1000000` / `maxAmount=1000000` | 4 / 3 (inclusive bounds) |
| `status=SUBMITTED&minAmount=500000&maxAmount=4000000` | 2 |
| `pageSize=4` page 1 / 2 / 3 | 4 / 2 / 0 items, `totalPages: 2` |
| `status=PENDING`, `min>max`, `pageSize=1000&page=0`, `minAmount=abc` | **400** with field errors |
| customer token | **403** |

### Interview points
- *"How did you implement pagination?"* — Offset/limit (`skip`/`take`) with a capped page size, a stable sort (createdAt + id tie-breaker), and total + rows fetched in one transaction. I'd switch to cursor pagination for very large datasets.
- *"Offset vs cursor pagination?"* — Offset is simple and allows random page access, but gets slow at high offsets (the DB still scans the skipped rows) and can shift when rows are inserted. Cursor is fast and stable, but has no "jump to page N".
- *"Why coerce query params but not body fields?"* — Query params are always strings by definition. JSON has real number types, so a string there signals a bug.
- *"How do you protect admin routes?"* — Auth + role middleware applied to the whole admin router, so it's impossible to forget on one route.

---

## 6.2 Start review — `POST /admin/applications/:id/start-review`

### What it does
- **Shared helpers** in `admin.service.ts` (approve and reject reuse them):
  - `loadForTransition(id, to)`: load the application → 404 if missing → `assertTransition(current, to)` → 409 if not allowed.
  - `rethrowIfConcurrentChange(err, id, to)`: if the conditional update hit **P2025** (someone changed the status meanwhile), re-read the status and throw the proper 409.
- **`startReview(id, admin)`**:
  1. `loadForTransition(id, UNDER_REVIEW)`: only SUBMITTED may move here.
  2. Transaction: `update where { id, status: <checked status> }` → UNDER_REVIEW, plus a `REVIEW_STARTED` audit row (`fromStatus` SUBMITTED, `toStatus` UNDER_REVIEW, actor = admin).
  3. On P2025 → 409.
- **Route:** `POST /admin/applications/:id/start-review` (admin-only via the router guard; UUID-validated `:id`). Returns 200 + the updated application.

### Why
- **The status machine decides, not the endpoint:** `assertTransition` is the same function customer submit uses. All allowed moves are in one table, so admin endpoints can't invent new transitions.
- **Why an explicit "start review" step at all?** It signals to the customer (and other admins) that someone owns the application now, and the audit trail records *who* picked it up and *when*. That's important for accountability and SLAs.
- **Admins get 404 (not 403) for a missing ID:** they're allowed to see every application, so 404 here genuinely means "doesn't exist".
- **Race between two admins:** both may load SUBMITTED. Only one conditional update matches; the other gets P2025 → 409 "Cannot move from UNDER_REVIEW…". Verified: 200 + 409, exactly 1 audit row.
- **Helpers extracted now:** approve/reject have the same load → check → conditional update → audit → race-handling shape. Writing it once avoids three subtly different copies.

### How to test
```powershell
curl.exe -X POST -H "Authorization: Bearer $adminToken" http://localhost:4001/api/v1/admin/applications/<id>/start-review
```
Verified:

| Case | Result |
|---|---|
| SUBMITTED | **200** UNDER_REVIEW, audit REVIEW_STARTED SUBMITTED→UNDER_REVIEW by admin |
| already UNDER_REVIEW / DRAFT / APPROVED | **409** `INVALID_STATUS_TRANSITION` |
| unknown id / malformed id | **404** / **400** |
| customer token | **403** |
| 2 admins at once | **200 + 409**, 1 audit row |

### Interview points
- *"What stops two admins from processing the same application?"* — A conditional update (`WHERE status = 'SUBMITTED'`): the DB lets exactly one succeed, and the other gets a 409 showing the real current status.
- *"How do you keep status rules consistent between customer and admin endpoints?"* — Both call the same `assertTransition` backed by one transitions table.
- *"Why record who started the review?"* — Accountability and compliance: lenders must be able to show who handled each application and when.

---

## 6.3 Approve — `POST /admin/applications/:id/approve` (transaction + schedule)

### What it does
- **Body:** `approveBodySchema` → `{ annualRateBps }` using the shared `annualRateBpsField` (integer, 500–2500).
- **`approve(id, admin, annualRateBps)`**:
  1. `loadForTransition(id, APPROVED)`: only UNDER_REVIEW may be approved (SUBMITTED → 409; review can't be skipped).
  2. `decidedAt = new Date()`, then **`generateSchedule(...)` before the transaction** (pure calculation).
  3. **`prisma.$transaction`**:
     1. Conditional update `WHERE status = UNDER_REVIEW` → APPROVED + `annualRateBps`, `decidedAt`, `decidedById`.
     2. `createMany` all installment rows in **one INSERT**.
     3. `APPROVED` audit row with metadata `{ annualRateBps, monthlyPaymentCents, totalInterestCents, installments }`.
     4. Return the application **with its schedule** (ordered).
  4. P2025 → 409 (concurrent change).
- The customer's `GET /applications/:id` now shows the schedule too.

### Why
- **Atomicity is the whole point:** "APPROVED with no schedule", "schedule with no approval", or "approved with no audit record" would all be corrupt states in a lending system. A transaction makes the three writes **all-or-nothing**.
- **Proved, not assumed:** I planted a conflicting installment #1 so step 2 failed *after* step 1 had already run inside the transaction. Result: status still `UNDER_REVIEW`, `annualRateBps`/`decidedAt` still null, no APPROVED audit. The DB rolled back step 1.
- **Calculate before the transaction:** transactions hold locks. Keep them short by doing pure CPU work (the schedule) outside, and only DB writes inside.
- **One `decidedAt` value:** the decision timestamp and the schedule's start date are guaranteed to match.
- **`createMany` (one INSERT) instead of 12–60 separate inserts:** far fewer round-trips to Neon, so the transaction stays short.
- **Race between two approvals:** the second admin's conditional update waits for the first's row lock, then finds status APPROVED → P2025 → rollback → 409. Verified: 24 installments (not 48) and the first admin's rate wins.
- **The rate is validated by the same rule as the calculator,** so quotes and approvals can't disagree about allowed rates.
- **Audit metadata stores the key numbers:** months later you can see exactly what was approved, even without recomputing.
- **The forced failure returned a generic 500** (details only in the server log), as designed in 1.4.

### How to test
```powershell
# body.json: {"annualRateBps":1200}
curl.exe -X POST -H "Authorization: Bearer $adminToken" -H "Content-Type: application/json" `
  --data-binary "@body.json" http://localhost:4001/api/v1/admin/applications/<id>/approve
```
Verified over HTTP:
```
201 create $10k/12m → 200 submit (ID + PAYSLIP uploaded)
409 approve while SUBMITTED              (can't skip review)
200 start review
400 rate 400 / 3000 / "1200" / missing
200 approve at 12%  → 12 installments, #1 due +1 month, $888.49 … last $888.47, final balance 0, Σprincipal = 1,000,000
409 approve again
     customer detail shows the schedule
     audit: CREATED → DOCUMENT_UPLOADED ×2 → SUBMITTED → REVIEW_STARTED → APPROVED
ATOMICITY: forced failure in step 2 → 500, status still UNDER_REVIEW, nothing from step 1 saved
RACE: 2 approvals at once → 200 + 409, 24 rows (not 48)
```

### Interview points
- *"Why does approval use a DB transaction?"* — Three writes must succeed or fail together: status, schedule, audit. Without a transaction, a crash between them leaves an approved loan with no repayment schedule. I proved the rollback by forcing step 2 to fail.
- *"What does a transaction guarantee?"* — ACID: **A**tomic (all or nothing), **C**onsistent (constraints hold), **I**solated (others don't see half-done work), **D**urable (committed = saved).
- *"How do you keep transactions fast?"* — Compute before opening it, batch inserts (`createMany`), no external calls (emails, HTTP) inside. Those go after commit.
- *"What if two admins approve with different rates?"* — Row-level locking + the conditional `WHERE status = 'UNDER_REVIEW'`: the first commits, the second finds the status changed and gets 409, so its rate is never applied.
- *"Where would you send the 'approved' email?"* — After the transaction commits (or via an outbox table written *inside* the transaction), never inside it. An email can't be rolled back.

---

## 6.4 Reject — `POST /admin/applications/:id/reject`

### What it does
- **Body:** `rejectBodySchema` → `{ reason }`, **trimmed**, then 10–1000 chars.
- **`reject(id, admin, reason)`**:
  1. `loadForTransition(id, REJECTED)`: only UNDER_REVIEW may be rejected.
  2. Transaction: conditional update → REJECTED + `rejectionReason`, `decidedAt`, `decidedById`; plus a `REJECTED` audit row with `metadata: { reason }`.
  3. P2025 → 409.
- The customer sees `status: REJECTED` and the `rejectionReason` on their application detail.

### Why
- **Mandatory, meaningful reason (spec: ≥10 chars):** customers deserve to know why. In lending it also supports fairness/complaints processes (Australian lenders must handle disputes, and "why was I declined" is the first question). Trimming first means 12 spaces doesn't count as a reason.
- **Max length:** prevents someone pasting megabytes into a text column.
- **Final states:** APPROVED and REJECTED have **no outgoing transitions** in the status table, so a decision can't be silently flipped. Changing a decision would need a new, audited process.
- **Reason stored twice (column + audit metadata):** the column is the *current* state shown to the customer; the audit row is the immutable *history*.
- **Approve-vs-reject race:** both conditional updates require `status = UNDER_REVIEW`, so exactly one can win. Verified: the result is a consistent APPROVED (schedule present, no rejection reason) with a single decision audit, never a mix of both.
- **Reuse of the shared helpers:** the whole action is ~25 lines because load/check/race-handling were written once in 6.2.

### How to test
```
POST /api/v1/admin/applications/<id>/reject   {"reason":"Income does not cover monthly repayments"}
```
Verified:

| Case | Result |
|---|---|
| `"Too short"` / 12 spaces / missing | **400** |
| valid (padded) reason | **200** REJECTED, reason trimmed, `decidedAt`/`decidedById` set, audit UNDER_REVIEW→REJECTED with reason |
| customer GET detail | sees REJECTED + reason |
| reject again / approve a REJECTED / reject an APPROVED / reject a SUBMITTED | **409** `INVALID_STATUS_TRANSITION` |
| customer token | **403** |
| approve + reject at the same instant | **200 + 409**, consistent final state, 1 decision audit |

### Interview points
- *"Can an admin change a decision?"* — Not through the API. APPROVED/REJECTED are final in the status machine. A real system would add an explicit, audited "reopen" or "withdraw" transition rather than allowing edits.
- *"What happens if one admin approves while another rejects?"* — Both updates are conditional on `UNDER_REVIEW`; the database serialises them, one wins, and the other gets a 409 showing the real status. The data is never half-approved, half-rejected.
- *"Why require a rejection reason?"* — Transparency for the customer, consistency for reviewers, and evidence for complaints or regulators.

---

## 6.5 Audit trail — `GET /admin/applications/:id/audit`

### What it does
`getAuditTrail(applicationId)`:
1. Checks the application exists → 404 if not (so "no such application" ≠ "empty history").
2. Loads its audit rows, **oldest first** (`createdAt asc, id asc`).
3. Collects the distinct `actorId`s and loads those users in **one** `findMany({ where: { id: { in: [...] } } })`, selecting only `id, fullName, email, role`.
4. Joins in memory with a `Map`: each entry gets `actor: { … }`, or **`null`** if that user no longer exists. The raw `actorId` is replaced by the `actor` object.

Response entry:
```json
{ "id": "…", "action": "APPROVED", "fromStatus": "UNDER_REVIEW", "toStatus": "APPROVED",
  "metadata": { "annualRateBps": 1450, "monthlyPaymentCents": 74580, … },
  "createdAt": "…", "actor": { "id": "…", "fullName": "Ada Admin", "email": "…", "role": "ADMIN" } }
```

### Why
- **No FK on `actorId` (Phase 2 decision) → manual join:** an audit log is a historical record. It must survive users being changed or deleted, which a foreign key with RESTRICT/CASCADE would interfere with. The cost is that Prisma can't `include` the actor, so we join ourselves.
- **Avoiding the N+1 query problem:** the naïve version does 1 query for the logs + **1 query per log row** for its actor (6 entries = 7 queries; 600 entries = 601). We do exactly **2 queries** regardless of size: logs, then all actors with `IN (…)`.
- **`Map` lookup:** O(1) per entry instead of searching an array each time.
- **`actor: null` for deleted users:** the history is never lost or broken; the UI can show "Deleted user". Verified by deleting the customer: all 6 entries remained.
- **Explicit `select` on users:** never leak `passwordHash`.
- **Tie-breaker in sort:** two events in the same millisecond still appear in a deterministic order.
- **Admin-only:** inherited from the router guard. Customers see their status/timeline via their own application endpoint, not the internal audit log.

### How to test
```
GET /api/v1/admin/applications/<id>/audit   (admin token)
```
Verified after a full lifecycle:
```
CREATED            ∅ → DRAFT                  by Audrey Applicant (CUSTOMER)
DOCUMENT_UPLOADED  (no status change)         by Audrey Applicant  {"type":"ID",…}
DOCUMENT_UPLOADED  (no status change)         by Audrey Applicant  {"type":"PAYSLIP",…}
SUBMITTED          DRAFT → SUBMITTED          by Audrey Applicant
REVIEW_STARTED     SUBMITTED → UNDER_REVIEW   by Ada Admin (ADMIN)
APPROVED           UNDER_REVIEW → APPROVED    by Ada Admin  {"installments":18,"annualRateBps":1450,…}
```
- No `passwordHash` anywhere.
- After deleting the customer: 6 entries remain, their `actor` = `null`.
- Unknown id → **404**; customer token → **403**.

### Interview points
- *"What's the N+1 problem and how did you avoid it?"* — Fetching a list, then running one extra query per item. I batch-load all related users with a single `IN` query and join in memory: 2 queries total, constant regardless of list size.
- *"Why doesn't your audit log use a foreign key to users?"* — Audit records are immutable history and must outlive the users they mention. Integrity of *new* entries is guaranteed by the code that writes them (always the authenticated user's id).
- *"Why is an audit trail important in lending?"* — Regulators, dispute resolution and internal fraud checks all need to answer "who did what, when, and with what values". Ours records every status change and document upload, written atomically with the change itself.

---

## 6.6 Stats with raw SQL — `GET /admin/stats?since=`

### What it does
- **`statsQuerySchema`**: optional `since` (coerced to a `Date`; invalid → 400).
- **`getStats({ since })`** runs **one raw SQL query** via `prisma.$queryRaw` (tagged template):
  ```sql
  SELECT "status",
         COUNT(*)::int                           AS "count",
         COALESCE(SUM("amountCents"), 0)::bigint AS "amountCents"
  FROM "LoanApplication"
  ${sinceFilter}          -- Prisma.sql`WHERE "createdAt" >= ${since}`  or  Prisma.empty
  GROUP BY "status"
  ```
- Post-processing:
  - Every status starts at **0** (statuses with no rows don't appear in `GROUP BY` output).
  - `totalApplications` is the sum of the counts.
  - `totalApprovedAmountCents` is the APPROVED row's sum, converted from **BigInt** to `Number`.
- **Response:**
  ```json
  { "data": { "countsByStatus": { "DRAFT": 1, "SUBMITTED": 2, "UNDER_REVIEW": 1, "APPROVED": 3, "REJECTED": 1 },
              "totalApplications": 8, "totalApprovedAmountCents": 8000000, "since": null } }
  ```

### Why
- **Raw SQL here (spec requirement), and why it fits:** one `GROUP BY` returns every status's count and sum in a single round-trip. It's also the cleanest way to show I can write SQL, not just use an ORM.
- **Why it's injection-safe:** `$queryRaw` is a **tagged template**. Prisma receives the SQL text and the `${values}` *separately*, sends the text with **placeholders** (`$1`), and sends the values as **bound parameters**. The database parses the SQL *before* it sees the values, so a value can never become SQL code. Demonstrated: `x'; DROP TABLE "User"; --` came back as a plain string and the table was untouched.
- **What would be unsafe:** `$queryRawUnsafe(\`… WHERE "createdAt" >= '${since}'\`)` or any string concatenation. Then the attacker's quote ends the string literal and their text runs as SQL.
- **`Prisma.sql` / `Prisma.empty` for optional clauses:** fragments are composed safely (still parameterised) instead of building SQL strings with `if`s.
- **Defence in depth:** Zod rejects non-dates *before* the query runs, *and* the query is parameterised anyway.
- **Quoted identifiers (`"amountCents"`, `"LoanApplication"`):** Postgres folds unquoted names to lowercase. Prisma created camelCase names, so they must be quoted (noted back in 2.2).
- **Casts:**
  - `COUNT(*)` returns BIGINT, which Prisma maps to JS `BigInt`. `::int` gives a normal number (counts won't exceed 2 billion).
  - `SUM` of money stays `::bigint`, because a portfolio can exceed the 32-bit limit ($21.4M in cents).
  - **`JSON.stringify` throws on BigInt**, so we convert with `Number(...)`, which is exact up to 2⁵³ cents (~$90 trillion).
- **`COALESCE(SUM(...), 0)`:** `SUM` over zero rows is `NULL`, not 0.
- **Cross-checked:** the raw SQL result matches Prisma's `groupBy` + `aggregate` exactly.

### How to test
```
GET /api/v1/admin/stats                    (admin token)
GET /api/v1/admin/stats?since=2026-01-01
```
Verified:

| Case | Result |
|---|---|
| all | 8 apps, per-status counts, **$80,000** approved, matches Prisma's own aggregation |
| `?since=2026-01-01` | 6 apps, $35,000 approved (2025 rows excluded) |
| `?since=not-a-date` / injection string | **400** (validation) |
| customer token | **403** |
| injection demo | SQL text `SELECT ? AS "value"`, value sent separately, returned as plain data |

### Interview points
- *"Where's your raw SQL and why is it safe?"* — `admin.service.ts → getStats`. It uses `prisma.$queryRaw` as a tagged template, so interpolated values become bound parameters, never part of the SQL text. Unsafe would be `$queryRawUnsafe` or string concatenation.
- *"What is SQL injection?"* — When user input is concatenated into a query, a crafted value (e.g. `'; DROP TABLE users; --`) changes the query's meaning. Parameterised queries prevent it by keeping code and data separate.
- *"Why use raw SQL at all if you have an ORM?"* — For aggregations/reports the ORM can't express well or efficiently. Keep it isolated, parameterised and tested against the ORM's result.
- *"Any gotchas with Postgres aggregates in JS?"* — COUNT/SUM return BIGINT → JS BigInt (not JSON-serialisable); SUM of no rows is NULL; identifiers need quoting if mixed-case.

---

# ✅ Phase 6 complete

Admin review API: paginated, filterable review queue; start-review / approve / reject through the shared status machine with race-safe conditional updates; **atomic approval** (status + schedule + audit in one transaction, rollback proven); mandatory rejection reasons; full audit trail with batched actor lookup (no N+1); and dashboard stats in **parameterised raw SQL**.

---

# Phase 7 — Backend tests

## 7.1 Jest config + test DB setup

### What it does
- **Packages (dev only):** Jest 30, ts-jest, Supertest, `@types/*`, ts-node (lets Jest read `jest.config.ts`).
- **`jest.config.ts`:** Node environment, tests in `tests/**/*.test.ts`, compiled by ts-jest, `maxWorkers: 1`, 30 s timeout. It wires up three setup hooks:

| Hook | File | Runs | Does |
|---|---|---|---|
| `globalSetup` | `tests/setup/globalSetup.ts` | once, before everything | safety check + `prisma migrate deploy` on the **test DB** (creates it if missing) |
| `setupFiles` | `tests/setup/env.ts` | before each test file loads app code | sets `NODE_ENV=test`, `DATABASE_URL`, `JWT_SECRET`, `UPLOAD_DIR` (temp folder) |
| `setupFilesAfterEnv` | `tests/setup/afterEnv.ts` | inside each test file | `afterAll(() => prisma.$disconnect())` |

- **`tests/setup/testEnv.ts`:**
  - `TEST_DATABASE_URL` defaults to `postgresql://…@localhost:5433/lendlite_test` (Docker); CI overrides it.
  - `assertIsTestDatabase()` **refuses any DB whose name doesn't end in `_test`**.
- **`tests/helpers/db.ts`:** `resetDb()` = `TRUNCATE` all 5 tables `CASCADE`, so each test starts clean.
- **`tests/tsconfig.json`:** extends the main config, adds Jest types and `isolatedModules: true`.
- **`tests/health.test.ts`:** the smoke test, `GET /health` → 200 `database: ok`; unknown route → 404 JSON.
- **Scripts:** `npm test`, `npm run test:watch`; `npm run typecheck` now also checks `tests/`.

### Why
- **Separate test database:** tests wipe tables. Running them against Neon dev data would destroy it. The `_test` name guard makes that mistake impossible (verified: pointing at `lendlite` → Jest refuses to start).
- **Real Postgres, not mocks or SQLite:** our features rely on Postgres behaviour (transactions, unique constraints, conditional updates, raw SQL, enums). Testing against the real engine catches real bugs.
- **Same migrations as production (`migrate deploy`):** the test schema is guaranteed identical, with no separate "test schema" to drift.
- **Env vars set *before* app code loads:** `config/env.ts` validates on import, and dotenv never overrides existing variables, so the test values win over `api/.env`.
- **`maxWorkers: 1`:** all files share one database. Parallel files would truncate each other's data mid-test.
- **`app.ts` separate from `server.ts` pays off here:** Supertest calls `request(app)` in-memory, with no port and no running server.
- **`isolatedModules` + separate typecheck:** ts-jest transpiles each file quickly without type-checking (4.6 s vs 18.5 s). Type safety is still enforced by `npm run typecheck`.
- **Disconnect after each file:** otherwise open DB connections keep Jest from exiting ("open handles").
- **Dev-only audit findings:** Jest's coverage tooling depends on `sprintf-js`, which has an advisory with **no patched version**. Upgrading Jest 29 → 30 cut findings from 34 (29 high) to 20 moderate; the rest are dev-only and never process user input. `npm audit --omit=dev` = **0**. CI will audit production deps.

### How to test
```powershell
docker compose up -d db        # test DB lives in the local Docker Postgres
cd api
npm test                       # → Tests: 2 passed
npm run typecheck              # src + prisma + tests
```

### Interview points
- *"How do you test code that uses a database?"* — Integration tests against a real, disposable Postgres (Docker locally, a service container in CI), migrated with the same migrations as production, reset between tests, with a guard so they can never touch a real database.
- *"Unit vs integration tests?"* — Unit tests check pure logic in isolation (amortization, fast). Integration tests run real HTTP → service → DB (auth, application flow). Both are needed.
- *"Why is `app.ts` separate from `server.ts`?"* — So tests import the configured app and call it in-memory with Supertest, without opening a port.
- *"Why run test files serially?"* — They share one database; parallel runs would interfere. (Scaling option: one database or schema per worker.)

---

## 7.2 Amortization + money unit tests (`tests/unit/`)

### What it does
**`amortization.test.ts`** (20 tests):
- **`calculateMonthlyPayment`:**
  - Spec example **88849** ($888.49).
  - $50k / 25% / 60m → 146757.
  - 0% → even split.
  - 5 invalid inputs throw `RangeError` (via `it.each`).
- **Spec schedule ($10k, 12%, 12m):**
  - Numbered 1–12.
  - Month 1 = $888.49 with $100.00 interest.
  - **Final balance 0.**
  - Last payment $888.47 (absorbs 2¢).
  - Σprincipal = $10,000, total interest $661.86.
  - First due date = start + 1 month.
- **0% loan:** 33,333 / 33,333 / 33,334.
- **Property test:** 1,000 loans from a **seeded** random generator. For each: length = term, final balance 0, Σprincipal = loan, every amount a whole cent ≥ 0, payment = principal + interest.
- **`addMonths`:** month-end clamping (Feb 29 in a leap year, Apr 30, Feb 28), **no drift** (Mar 31), year rollover, time of day preserved.

**`money.test.ts`** (6 tests): float pitfalls, rounding, NaN/∞ rejected, bps conversion, `isValidCents` limits, AUD formatting.

### Why
- **Pure functions are the easiest and most valuable things to unit test:** no DB, no mocks, milliseconds to run. This is the money maths, so it's the code where a bug costs the most.
- **Example tests + property tests:**
  - Examples pin exact known values (the spec's $888.49).
  - Properties check rules that must *always* hold, across inputs nobody thought to write by hand.
- **Seeded randomness:** `Math.random()` would give different loans on every run, so a failure might never reproduce. A seeded generator gives the same 1,000 loans every time.
- **Context in property assertions** (`{ principalCents, annualRateBps, termMonths, … }`): when one fails, the message shows exactly which loan broke it.
- **`it.each`:** one readable table for many similar cases instead of copy-pasted tests.
- **Mutation check (testing the tests):** I temporarily disabled the "last installment absorbs the remainder" rule. **5 tests failed**, proving they actually guard that rule. Then I restored the code and all 26 passed. A test that can't fail is worthless.

### How to test
```powershell
cd api
npx jest tests/unit            # → 26 passed (no database needed)
npx jest tests/unit --verbose  # list every test name
```

### Interview points
- *"How did you test the repayment calculation?"* — Unit tests for the spec example and edge cases (0%, rounding remainder, month-end dates), plus a seeded property test over 1,000 random loans asserting invariants like "final balance is exactly 0".
- *"What's property-based testing?"* — Instead of specific input/output pairs, generate many inputs and assert properties that must always be true. It finds edge cases you didn't think of. (Libraries like fast-check also *shrink* failures to the smallest example.)
- *"How do you know your tests are good?"* — Break the code on purpose and check they fail (mutation testing; tools like Stryker automate it).

---

## 7.3 Auth integration tests (`tests/auth.test.ts`)

### What it does
16 tests that send **real HTTP requests** through Supertest → Express → services → the `lendlite_test` Postgres:

| Area | Tests |
|---|---|
| **register** | 201 CUSTOMER + token, email normalised, no `passwordHash` · DB stores a `$2b$12$` hash, never the plain password · `role: "ADMIN"` ignored · duplicate (case-insensitive) → 409 `EMAIL_TAKEN` · invalid → 400 with `email`/`password`/`fullName` details |
| **login** | token works for `/auth/me` (email case-insensitive) · wrong password and unknown email → **identical** 401 bodies · missing fields → 400 |
| **/auth/me** | valid → 200 · no header / `Basic` / garbage → 401 (`it.each`) · expired → 401 · forged with another secret → 401 · user deleted → 401 |
| **rate limit** | 5 failed logins, then the 6th **with the correct password** → 429 `RATE_LIMITED` + `Retry-After` |

Supporting changes:
- **`tests/helpers/factories.ts`:**
  - `createUser()` / `createAdmin()` insert users directly (unique emails).
  - `authHeader(user)` signs a real JWT without calling `/login`.
- **`rateLimit.ts`:** each limiter now has an explicit `MemoryStore`, plus an exported `resetRateLimits()`.
- `beforeEach`: `resetDb()` + `resetRateLimits()`.

### Why
- **Integration > unit for auth:** the risk is in the wiring (middleware order, validation, hashing, JWT checks, error format). Only a real request through the full stack proves it.
- **Each test sets up its own data (Arrange → Act → Assert)** after a full reset, so tests don't depend on order. Verified by running the whole suite twice: 44/44 both times.
- **Factories vs HTTP for setup:** creating users directly is faster and keeps each test focused on the one endpoint it tests. `authHeader()` avoids burning login attempts on the rate limiter.
- **Why `resetRateLimits()`:** limiter counters live in memory for the whole test file. Without a reset, logins from earlier tests would cause random 429s later (a classic *flaky test*). Explicit stores make the state resettable. In production the same seam is where a Redis store plugs in.
- **Asserting identical bodies** for wrong password vs unknown email *encodes the security requirement* (no user enumeration) as a test, so a future refactor can't silently break it.
- **Testing the DB, not just the response:** the hash check (`$2b$12$…`) proves passwords are stored correctly, which the HTTP response alone can't show.

### How to test
```powershell
docker compose up -d db
cd api
npx jest tests/auth.test.ts      # 16 passed
npm test                         # whole suite: 44 passed
```

### Interview points
- *"How do you test authentication?"* — End-to-end with Supertest against a real test DB: happy paths plus every rejection (expired, forged, malformed, deleted-user tokens), and security properties like no user enumeration and rate limiting.
- *"How do you avoid flaky tests?"* — Reset all shared state before each test (DB *and* in-memory state like rate-limit counters), no reliance on test order or timing, deterministic data.
- *"Why test that the DB stores a hash?"* — Some requirements aren't visible in the API response. Asserting on persisted state catches "it works but it's insecure" bugs.

---

## 7.4 Application flow integration tests (`tests/applications.test.ts`, `tests/admin.test.ts`)

### What it does
**`applications.test.ts`** (customer side, 25 tests):
- **Create/list/edit:**
  - Create DRAFT (`status`/`annualRateBps`/`userId` ignored, CREATED audit).
  - List only mine; edit a draft.
  - Edit after submit → **409** `APPLICATION_NOT_EDITABLE`; admin on customer route → 403.
- **Ownership:**
  - Another customer's view/edit/submit → **404**, with a body **identical** to a non-existent id.
  - Upload to / download from someone else's → 404.
- **Submit:**
  - Missing fields + documents → 400 with both lists; BANK_STATEMENT doesn't count.
  - Income/expenses of 0 is valid; second submit without a key → **409** `INVALID_STATUS_TRANSITION`.
- **Idempotency:**
  - Same key → identical body + `Idempotent-Replayed` + one SUBMITTED audit.
  - Key reused on another app → 409; **two simultaneous submits** → both 200, one audit; bad key → 400 naming `idempotency-key`.
- **Documents:**
  - Random storage name + exact bytes downloaded (`attachment`, `no-store`).
  - `.txt` → 400, disguised `.exe` → 400, >5 MB → **413**, upload after submit → 409.
  - **No file left on disk** after any rejection.

**`admin.test.ts`** (admin side, 21 tests):
- **Full lifecycle over HTTP:** create → patch → upload ID + PAYSLIP → submit → start review → approve at 12%.
  - Spec numbers: 12 installments, $888.49, **final balance 0**, Σprincipal = $10,000.
  - The customer sees the schedule.
  - The audit trail is `CREATED → DOCUMENT_UPLOADED ×2 → SUBMITTED → REVIEW_STARTED → APPROVED` with the correct actors.
- **6 invalid transitions → 409** (`it.each`).
- **Approve:**
  - Rate validation.
  - **Atomicity:** a planted conflicting installment makes step 2 fail → status/rate/decidedAt rolled back, no audit.
  - **Race:** 2 simultaneous approvals → `[200, 409]`, 24 rows (not 48).
- **Reject:** reason ≥10 chars after trimming; customer sees the reason.
- **List/stats:**
  - Drafts hidden, status+amount filters, pagination metadata.
  - Stats match exactly (counts incl. zeros, $35,000 approved), `?since` filter, 403 for customers.

New helpers:
- `createApplication(user, { status, amountCents, termMonths, createdAt })` inserts a complete application in any status.
- `PDF_BYTES` / `EXE_BYTES` provide real magic bytes.
- `tests/helpers/uploads.ts` has `clearUploads()` / `countUploadedFiles()`.

### Why
- **Covers every Phase 7 requirement:** invalid transitions, ownership 404, idempotency, plus the money-critical behaviour (atomic approval, final balance 0).
- **Start tests mid-flow with factories:** "approve an UNDER_REVIEW application" doesn't need 6 HTTP calls of setup. Only the lifecycle test walks the whole path; every other test is focused and fast.
- **Concurrency tested with `Promise.all`:** race conditions are the bugs that slip past manual testing. These tests prove the conditional-update design.
- **Atomicity tested by forcing a failure:** the only way to *prove* a transaction rolls back is to make it fail halfway.
- **Disk state asserted (`countUploadedFiles() === 0`):** "rejected uploads are cleaned up" is invisible in the HTTP response, so the test checks the filesystem.
- **A bug in the *test* was caught:** `approve(id, undefined)` silently used the helper's default parameter (`= 1200`), so the "missing rate" case sent a valid rate. A failing test isn't always an app bug. Read *why* it failed. Fixed by sending `{}` explicitly.
- **Run time (~80 s):** mostly bcrypt (cost 12, deliberately slow) creating 2 users before every test, plus DB round-trips. An option if it grows: make the bcrypt cost configurable and use 4 in tests.

### How to test
```powershell
docker compose up -d db
cd api
npm test        # → Test Suites: 6 passed | Tests: 84 passed
```

| Suite | Tests |
|---|---|
| `health.test.ts` | 2 |
| `unit/amortization.test.ts` | 20 |
| `unit/money.test.ts` | 6 |
| `auth.test.ts` | 16 |
| `applications.test.ts` | 25 |
| `admin.test.ts` | 15 (+ 6 parameterised transitions) |

### Interview points
- *"What do your tests cover?"* — Unit tests for the money maths; integration tests for every endpoint's happy path and failure modes; security properties (ownership 404s, no enumeration, mass assignment, file validation); and concurrency/atomicity (simultaneous submits/approvals, forced transaction failure).
- *"How do you test race conditions?"* — Fire identical requests concurrently with `Promise.all` and assert on the *final state* (one audit row, no duplicate schedule), not just the status codes.
- *"How would you speed up the suite?"* — Lower bcrypt cost in tests, parallelise with one database or schema per Jest worker, and keep most tests at the service/unit level.

---

# ✅ Phase 7 complete

84 automated tests (6 suites) against a real, isolated Postgres: amortization + money unit tests (incl. a seeded property test), and integration tests for auth, the application flow, documents, idempotency, ownership, admin review, atomic approval, races, audit trail and raw-SQL stats. Stable across repeated runs.

---

# Phase 8 — Frontend setup & auth

## 8.1 Next.js + Tailwind init (+ fintech design foundation)

### What it does
- **Scaffold:** `create-next-app@16.4.2` in `web/` with TypeScript, **Tailwind v4**, ESLint (flat config), **App Router**, `src/` folder, `@/*` import alias, npm.
- **Next 16 defaults kept:**
  - `cacheComponents: true` (dynamic by default, with a prerendered static shell).
  - `partialPrefetching: true`.
  - Added `poweredByHeader: false`.
- **Design tokens in `src/app/globals.css` (`@theme`).** Tailwind v4 keeps config in CSS, not `tailwind.config.js`:
  - **Brand blue** `brand-50…950` (actions, links, focus) and **navy** `navy-800…950` (hero backgrounds).
  - **Semantic colours:** `canvas` (page bg), `surface` (cards), `line` (borders), `ink` / `muted` / `subtle` (text levels).
  - **Shape:** `rounded-card`, `shadow-card`, `shadow-raised`.
  - **`money` utility:** tabular numerals so amounts line up.
  - **A global `:focus-visible` outline** for keyboard users.
- **`layout.tsx`:** **Inter** via `next/font/google` (self-hosted at build time); `lang="en-AU"`; a title template `%s · LendLite`.
- **`components/brand/Logo.tsx`:** an inline-SVG mark + wordmark, light/dark tone.
- **`page.tsx`:** a placeholder landing page. Navy hero, CTAs, key facts, an example repayment card (the spec numbers: $888.49/mo, $661.86 interest), and a "How it works" section. The live calculator replaces the card in Phase 9.
- **`.env.example`** (`NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1`) is committed; `.env.local` is gitignored.
- Scripts: `dev`, `build`, `start`, `lint`, **`typecheck`**. Demo SVGs removed.

### Why
- **Read the bundled docs first:** Next 16 ships `AGENTS.md` warning that APIs changed. Relevant breaking changes:
  - Route `params` are **async (Promises)**.
  - `middleware` → **`proxy`**.
  - `next lint` was removed (use `eslint`).
  - Cache Components is on by default.
- **Client-side auth fits the SPA guidance:** client components are still prerendered as a static shell. So anything reading `localStorage` (our JWT) must run in the browser only (`useEffect` or React 19.3's `use(browser())`). This shapes 8.3.
- **Design tokens, not ad-hoc colours:** every screen pulls from one palette, so the UI looks like one product and a rebrand is a one-file change.
- **Fintech visual language:**
  - **Navy/blue** reads as trustworthy and calm.
  - **Emerald only for money/success**, so colour carries meaning.
  - **Generous whitespace and soft shadows** feel premium and less "form-heavy".
  - **Tabular numbers** keep amounts in columns from jumping around.
- **Semantic names (`muted`, `line`, `surface`)** describe *purpose*, so components don't hard-code `gray-500` everywhere.
- **`next/font`:** no layout shift (font metrics known at build) and no request to Google from users' browsers (privacy).
- **Accessibility from day one:** `lang`, visible focus rings, sufficient contrast on navy.
- **Audit:** production deps **0**. Dev-only: 5 high in ESLint's `braces` dependency, which has **no patched release**; lint tooling only, on our own globs.

### Gotchas hit (good debugging stories)
- **PowerShell 5 wrote `package.json` with a UTF-8 BOM.** Node's `JSON.parse` rejects the invisible `﻿`, so the Tailwind build failed with "Unexpected token". I stripped the BOM with Node.
- **The build still failed afterwards,** because **Turbopack's file-system cache** in `.next/` held the old file. Deleting `.next` fixed it. Lesson: when a fix "doesn't work", suspect a cache.
- **Headless-Edge screenshots at 390px looked cropped** (a minimum window-width quirk). At 500px the layout fit perfectly, so it wasn't a real bug.

### How to test
```powershell
cd web
copy .env.example .env.local
npm run dev            # http://localhost:3000
npm run typecheck; npm run lint
npm run build          # ○ / prerendered as static
```
Verified: typecheck + lint + production build pass; screenshots at 1440px and 500px look correct (no horizontal overflow).

### Interview points
- *"Why Next.js App Router?"* — File-based routing, layouts, automatic code-splitting, server and client components, and a static shell for fast first paint, while still supporting SPA-style client data fetching.
- *"How do you keep a UI consistent?"* — Design tokens (colours, radii, shadows, fonts) defined once and consumed via utilities, plus shared components (built next).
- *"Server vs client components?"* — Server components render on the server with no JS shipped. Client components (`'use client'`) are needed for state, effects and browser APIs like `localStorage`.
- *"What did you do about accessibility?"* — Semantic HTML, `lang`, visible focus styles, sufficient contrast, labelled forms (coming in 8.4).

---

## 8.2 `lib/api.ts` (typed fetch wrapper) + `lib/types.ts` + `lib/format.ts`

### What it does
- **`lib/types.ts`:** TypeScript shapes of everything the API returns (`User`, `LoanApplication(Detail)`, `LoanDocument`, `Installment`, `Quote`, `AdminApplicationRow`, `AuditEntry`, `AdminStats`, `Pagination`, `ApiErrorBody`), mirroring the backend. Money = cents, rates = bps, dates = ISO strings.
- **`lib/api.ts`:**
  - `API_URL` comes from `NEXT_PUBLIC_API_URL`.
  - **`ApiError`** (`status`, `code`, `message`, `details`) is the *only* error type UI code handles. `fieldErrors()` turns a 400 `VALIDATION_ERROR` into `{ email: 'Invalid email address', … }` for forms.
  - **`request<T>()`**:
    - Sets JSON headers (or lets the browser set multipart for `FormData`).
    - Adds `Authorization: Bearer <token>`.
    - **Unwraps `{ data }`**, and turns `{ error }` into `ApiError`.
    - Network failure → `ApiError(0, 'NETWORK_ERROR', friendly message)`.
  - **Token lives in memory** (`setAuthToken`). The auth layer decides persistence.
  - **`setUnauthorizedHandler`:** any 401 on an authenticated request triggers one central logout.
  - `api.get / post / patch / upload(FormData) / download(→ Blob)`.
- **`lib/format.ts`:** `formatCents` ($888.49), `formatCentsWhole` ($15,000), `formatRate` (12.50% p.a.), `formatDate` (19 Nov 2026), `formatDateTime`, `formatMonths`, and `parseDollarsToCents` (string-based, no float maths).

### Why
- **One place for HTTP concerns:** base URL, auth header, JSON, error shape. Components just call `api.get<LoanApplication[]>('/applications')`, with no `fetch` boilerplate scattered around.
- **Typed responses (`api.get<T>`):** autocomplete and compile errors when the UI reads a field that doesn't exist.
- **One error type with a stable `code`:** the UI can react precisely (`EMAIL_TAKEN` → message under the email field; `NETWORK_ERROR` → "check your connection"), mirroring the backend's error design.
- **`NEXT_PUBLIC_` prefix:** only env vars with this prefix reach the browser bundle. They're inlined at build time, so they must be referenced literally. Never put secrets in them.
- **Don't set `Content-Type` for FormData:** the browser must add the multipart *boundary* itself; setting it manually breaks uploads.
- **Downloads via `fetch` → Blob:** a plain `<a href>` can't send the `Authorization` header, so authenticated files must be fetched with JS.
- **Central 401 handler:** an expired token (1h) anywhere logs the user out once, consistently, instead of every page handling it.
- **Separation of concerns:** `api.ts` attaches a token but doesn't know about `localStorage`, so storage strategy can change (e.g. to httpOnly cookies) without touching the HTTP client.
- **Formatting only in the UI:** the API sends exact integers; humans see `en-AU` currency/dates. `parseDollarsToCents` splits on `.` instead of `× 100` to avoid `19.99 * 100 = 1998.9999…`.

### How to test
Verified from Node against the running API:
```
formatCents(88849) → $888.49 · formatRate(1250) → 12.50% p.a. · formatDate → 19 Nov 2026
parseDollarsToCents("$15,000.5") → 1500050 · "abc" / "1.234" → null
POST /calculator/quote          → unwrapped data, 88849
wrong password                  → ApiError 401 INVALID_CREDENTIALS
invalid register                → ApiError 400, fieldErrors() = {email, password, fullName}
GET /auth/me with token         → Casey Customer
GET /auth/me with bad token     → ApiError 401, unauthorized handler called once
API stopped                     → ApiError 0 NETWORK_ERROR, friendly message
```

### Interview points
- *"How does your frontend talk to the API?"* — Through one typed wrapper that handles the base URL, auth header, JSON, response unwrapping and error normalisation into a single `ApiError` type.
- *"How do you handle an expired token on the client?"* — The wrapper detects any 401 on an authenticated call and invokes a single logout handler registered by the auth layer.
- *"Why not put the API secret / JWT secret in `NEXT_PUBLIC_*`?"* — Those values ship to every browser. Only public config (like the API URL) belongs there.

---

## 8.3 Auth context/store (`lib/auth.ts` + `components/auth/AuthProvider.tsx`)

### What it does
- **`lib/auth.ts`**: `readStoredToken` / `storeToken` / `clearStoredToken` under the key `lendlite.token`. Every `localStorage` call is wrapped in try/catch.
- **`AuthProvider`** (`'use client'`), mounted once in the root layout around all pages:
  - **State:** `status` (`'loading' | 'authenticated' | 'anonymous'`) + `user`.
  - **`login(email, password)` / `register({ email, password, fullName })`** call the API → `startSession`: store the token (localStorage + in-memory via `setAuthToken`), set the user, status `authenticated`. They return the `User` (so pages can redirect by role).
  - **`logout()`** clears storage + memory, user `null`, status `anonymous`.
  - **Restore on load (`useEffect`):**
    - No stored token → `anonymous`.
    - Otherwise call **`/auth/me`** to confirm the token is still valid → `authenticated`.
    - On a **401** the stale token is cleared; on a network error it's **kept** (don't log people out for being briefly offline).
  - **Registers `logout` as the API's 401 handler,** so an expired token mid-session logs out once, centrally.
  - **Cross-tab logout:** listens for the `storage` event, so logging out in one tab logs out the others.
  - The context value is **memoised**; callbacks use `useCallback`.
- **`useAuth()`** hook throws if used outside the provider (fails fast on wiring mistakes).

### Why
- **React Context for auth:** many components need "who is logged in?" (nav, guards, pages). Context provides it without passing props through every level.
- **Why a `'loading'` state:** the server prerenders pages without access to `localStorage`. Until the browser checks, we genuinely don't know. Without `loading`, a logged-in user would see a flash of the login page (or a redirect) on every refresh.
- **Validate the stored token with `/auth/me`:** a token in storage may be expired or belong to a deleted user. Trusting it blindly would show a "logged in" UI whose API calls all fail.
- **`useEffect` for storage access:** effects only run in the browser, after hydration, so there's no server/client HTML mismatch.
- **`cancelled` flag:** if the component unmounts before `/auth/me` returns, we don't set state on an unmounted component.
- **Persistence separated from HTTP:** `api.ts` only knows the in-memory token. Swapping localStorage for cookies later only touches `lib/auth.ts` + the provider.
- **localStorage trade-off (spec, and a likely interview question):**
  - **localStorage:** simple, and works across API domains. But **any script on the page can read it**, so an XSS bug = stolen token.
  - **httpOnly cookie:** JS can't read it at all, so XSS can't steal it. The browser sends it automatically, which brings **CSRF** risk (mitigate with `SameSite=Lax/Strict` + CSRF tokens). It needs the API on the same site or careful CORS/credentials setup.
  - Either way: short token expiry (1h), strict CSP, and avoiding `dangerouslySetInnerHTML` reduce XSS risk.

### How to test
Typecheck, lint and production build pass with the provider in the root layout. Runtime behaviour (restore, login, logout, expired token) is exercised in the browser with the login/register pages in **8.4**.

### Interview points
- *"Where do you store the JWT and why?"* — Memory + localStorage, as the spec asks. I can explain the XSS risk and why production would prefer an httpOnly SameSite cookie (plus CSRF protection).
- *"How do you avoid the 'flash of logged-out content'?"* — A tri-state auth status. Guards and nav wait while it's `loading` and render a skeleton instead of guessing.
- *"How does the frontend react to an expired token?"* — On load, `/auth/me` validates it; mid-session, the API client's 401 hook calls the provider's `logout`.

---

## 8.4 Login + register pages (with shared UI primitives)

### What it does
- **UI primitives (`components/ui/`)**, reused by every future form:
  - `Button`: primary/secondary/ghost/danger, `loading` spinner, disabled while loading; plus `buttonClasses()` for links.
  - `TextField` / `PasswordField`: label linked via `htmlFor`; hint/error via `aria-describedby`; `aria-invalid`; red error state; Show/Hide toggle.
  - `Alert`: error/success/info, `role="alert"` for errors.
  - `Spinner`.
- **`lib/validation/auth.ts`:** Zod `loginSchema` / `registerSchema` mirroring the API's rules, `PASSWORD_RULES` for the live checklist, and `toFieldErrors()`.
- **`lib/redirects.ts`:**
  - `homeFor(role)`: ADMIN → `/admin`, CUSTOMER → `/dashboard`.
  - `safeNextPath()`: only same-site paths, so it's **not an open redirect**.
- **`AuthShell`:** split layout. A navy brand panel with trust points (desktop only); the form column (mobile-first).
- **`/login`** (`app/(auth)/login`):
  - Client-side Zod check → `login()`.
  - Errors: `INVALID_CREDENTIALS` → "Incorrect email or password."; `RATE_LIMITED` / network → the API's friendly message.
  - Redirect in **one effect** (to `?next=` if safe, else by role), which also covers "already logged in".
  - Demo-accounts box.
- **`/register`:** full name/email/password, a **live password checklist** (✓ turns green as rules are met), `EMAIL_TAKEN` → inline error + "Log in instead →".
- **Temporary `/dashboard` and `/admin`** (`SessionPlaceholder`): show "Welcome, name" + Log out, to prove the flow. Replaced in 8.5/8.6 and Phases 9–10.
- `(auth)` is a **route group**: it organises files without adding `/auth` to the URL.

### Why
- **Client-side validation is UX, server validation is security:** instant feedback in the browser, but the API still validates everything, because browser code can be bypassed.
- **`noValidate` on forms:** consistent, styled, accessible messages instead of the browser's inconsistent popups.
- **Map error *codes* to UI:** the same `ApiError.code` design from the backend lets each error land in the right place (field vs banner).
- **Disable the button while submitting:** prevents double registrations / double logins.
- **Open-redirect protection:** without `safeNextPath`, `/login?next=https://evil.com` would send users to a phishing site *after a real login on our domain*.
- **Accessibility:** labels tied to inputs, errors announced (`role="alert"`, `aria-describedby`), `autocomplete` hints (`email`, `current-password`, `new-password`) so password managers work, visible focus rings.
- **Form in the static HTML:** reading `?next=` via `useSearchParams` forced a Suspense boundary, so the first paint was a grey skeleton (spotted in a screenshot). Reading it from `window.location` only when redirecting keeps the form in the prerendered HTML: it **appears instantly**, even before JavaScript loads.
- **Hide Edge's built-in password reveal (`::-ms-reveal`):** otherwise users saw two "show" controls.

### How to test
Automated in a real browser (Microsoft Edge via `playwright-core`, API on the local Docker DB): **19/19 checks**.
- **Errors:** empty submit → field errors; wrong password → alert.
- **Login:** customer → `/dashboard`; token stored; **survives refresh**; `/login` while logged in → redirect.
- **Logout and tokens:** logout clears the token; a garbage stored token → logged out + cleared.
- **Redirects:** `?next=https://evil…` ignored; admin → `/admin`.
- **Register:** field errors, malformed email; register → dashboard; duplicate email (any case) → inline error + link.
- **Rendering:** no console/JS errors; **no horizontal overflow at a true 390 px mobile viewport** on `/`, `/login`, `/register`.
- Screenshots reviewed at 1440 px and 390 px.

*Debugging story:* the e2e test once timed out on login. It was **our own rate limiter** (5 logins/min) blocking the second run. Restarting the API reset the in-memory counters, which is exactly the "in-memory store" limitation noted in 3.6.

### Interview points
- *"Why validate on both client and server?"* — Client: fast feedback. Server: the only validation you can trust.
- *"What's an open redirect and how did you prevent it?"* — Using an attacker-controlled URL parameter as a redirect target. I only allow relative paths starting with a single `/`.
- *"How did you make the forms accessible?"* — Real `<label>`s, `aria-invalid`/`aria-describedby`, `role="alert"` errors, autocomplete hints, keyboard-visible focus, and no reliance on colour alone (✓/○ plus screen-reader text).
- *"How did you test the UI?"* — Scripted browser tests (Playwright driving Edge) for the full auth flow and mobile overflow, plus reviewing screenshots.

---

## 8.5 Protected route guard (`RequireAuth` + route-group layouts)

### What it does
- **`components/auth/RequireAuth.tsx`** (`<RequireAuth role="CUSTOMER" | "ADMIN">`):
  - `loading` → render a **`PageSkeleton`** (never the protected content).
  - `anonymous` → `router.replace('/login?next=<current path + query>')`.
  - Logged in with the **wrong role** → `router.replace(homeFor(user.role))` (customer → `/dashboard`, admin → `/admin`).
  - Right role → render the page.
- **Applied once per area via layouts:**
  - `app/(customer)/layout.tsx` wraps every customer page. `/dashboard` moved into the `(customer)` route group (URL unchanged); `/applications/...` will live there too.
  - `app/admin/layout.tsx` wraps every `/admin/...` page.
- **`PageSkeleton`:** a neutral pulsing placeholder (`aria-busy`).
- `SessionPlaceholder` simplified (the guard now guarantees a user).
- **`typecheck` script** is now `next typegen && tsc --noEmit`.

### Why
- **Why client-side (not Next's `proxy`/middleware)?** The JWT is in `localStorage`, which the server never sees, so server-side code can't know who's logged in. With an httpOnly cookie, `proxy` could redirect *before* any HTML is sent. That's another point in favour of cookies.
- **The guard is UX, not security.** Anyone can edit browser JS or call the API directly. Real protection = the API: 401 without a valid token, 403 for the wrong role, 404 for others' data. The guard just avoids showing pages a user can't use.
- **Layouts as the enforcement point:** "secure by default" again. Any new page added under `(customer)` or `admin` is automatically guarded (like `router.use(requireAuth)` on the API).
- **Route groups `( )`:** organise pages by audience without changing URLs.
- **Skeleton while deciding:** prevents both the "flash of protected content" and a jarring blank page. Verified with a `MutationObserver` that the welcome text never appeared for a logged-out visitor.
- **`?next=` round trip (including query strings):** a user who opens a deep link, logs in, and lands back on that exact page has a smooth experience. `safeNextPath` (8.4) keeps it from becoming an open redirect.
- **Wrong role → own home, not an error page:** friendlier, and doesn't confirm what exists in the other area.
- **`next typegen`:** Next 16 generates typed route helpers (`LayoutProps<'/admin'>`) into `.next/types`. Plain `tsc` used **stale** types after moving `/dashboard` and adding `/admin/layout.tsx`, giving false errors. Generating them first (as the Next docs recommend) makes `typecheck` reliable, including in CI.

### How to test
Real-browser checks (Edge + playwright-core), **guard: 8/8**:
- **Logged out:** `/dashboard` → `/login?next=%2Fdashboard`, with **no flash** of protected content.
- **Login** → sent back to `/dashboard`.
- **Customer → `/admin`** → bounced to `/dashboard`.
- **Logged out:** `/admin?tab=stats` → login as admin → back to `/admin?tab=stats`.
- **Admin → `/dashboard`** → bounced to `/admin`.
- **Tampered token** on a protected page → login.
- No uncaught JS errors.

Regression: auth flow still **19/19**.

*Test gotchas (both test issues, not app bugs):*
1. An "already on `/login`" wait returned immediately, so the test now waits for the token to actually be cleared.
2. Running both suites back-to-back exceeded the **5 logins/min rate limit**: the app behaving correctly. Restarting the API resets the in-memory counters.

### Interview points
- *"How do you protect routes in the frontend?"* — A role-aware guard component in each area's layout, with a loading skeleton and `?next=` redirect. And I'd stress that it's UX: authorisation is enforced by the API.
- *"Why not use Next.js middleware/proxy?"* — The token is in localStorage, invisible to the server. With httpOnly cookies, `proxy` could do the redirect server-side before rendering.
- *"What's a flash of unauthenticated content and how do you prevent it?"* — Briefly rendering protected UI before auth is known. Use a tri-state status and render a skeleton until it resolves.

---

## 8.6 App layout + navigation (and Activity-safe logout)

### What it does
- **`components/layout/`:**
  - `navigation.ts`: `NAV_ITEMS` per role (customer: *My applications*, *New application*; admin: *Review queue*), `isActive()`, `initials()`.
  - `AppHeader`: sticky translucent header, logo → role home, desktop nav with **active pill + `aria-current="page"`**, mobile hamburger → slide-down panel (links, user, log out; Escape closes).
  - `UserMenu`: initials avatar → dropdown (name, email, role badge, **Log out**). Closes on **outside click** and **Escape**; `aria-expanded` / `aria-controls`.
  - `AppShell`: header + centred content column + footer. `PageHeader`: title / description / actions.
- **`components/ui/EmptyState`:** icon, title, text, CTA. (The spec requires loading, empty *and* error states.)
- **Layouts:** `(customer)/layout.tsx` and `admin/layout.tsx` = `RequireAuth` → `AppShell` → page.
- **`/dashboard`:** "Welcome back, {first name}" + *New application* + an **empty state** (real list in Phase 9). **`/admin`:** "Review queue" placeholder (Phase 10). Temporary `SessionPlaceholder` deleted.
- **Two fixes for Next 16's `<Activity>` behaviour:**
  1. **Logout now does a full page load** (`window.location.href = '/login'`), clearing all client state from preserved pages.
  2. **Login/register forms reset themselves after a successful submit** when hidden (`useLayoutEffect` cleanup + `shouldReset` ref), so the password isn't kept in a hidden DOM.
- **Bug fix:** the startup `/auth/me` check uses `skipUnauthorizedHandler`, so a stale token on a public page is dropped quietly instead of forcing a redirect to `/login`.

### Why
- **One shell for every logged-in page:** consistent navigation, spacing and footer; pages only render their content.
- **Nav driven by data (`NAV_ITEMS[role]`):** one list feeds desktop and mobile, so they can't drift. Role-specific menus come for free.
- **Accessible menus:** `aria-expanded`, `aria-controls`, `aria-current`, Escape and outside-click closing are what keyboard and screen-reader users expect, and what tests can rely on.
- **Next 16 Cache Components keep visited pages mounted-but-hidden (React `<Activity>`):** great for UX (drafts survive navigation), but **state survives logout too**. In e2e testing, a hidden register form still held the previous user's email (and would hold a password). Next's "Preserving UI state" guide recommends a full reload on logout. That's what we do, plus resetting auth forms after success.
- **The lint rule `no-location-assign-relative-destination`** normally steers you to client navigation; here a full reload is intentional, so it's suppressed **with a written justification**, never silently.
- **`skipUnauthorizedHandler`:** "token expired *during* a session" (log out) is different from "an old token found at startup" (forget it silently). Treating them the same bounced visitors off the public home page. Caught by a regression test.

### How to test
Real-browser suites (Edge + playwright-core), all passing:
- **layout 15/15:**
  - **Phase 8 done-when:** register in the UI → "Welcome back, Sam" + empty state.
  - Nav links + `aria-current`; account menu shows name/email, closes on outside click and Escape; logout via menu.
  - Admin nav shows only "Review queue".
  - Mobile: hamburger instead of nav, **no overflow at 390 px**, menu opens/closes, logout.
- **guard 9/9:** includes the new regression (stale token on `/` → cleared, stays on `/`).
- **auth 19/19.**

Screenshots reviewed: dashboard + menu (desktop), mobile menu, admin.

### Interview points
- *"What's special about navigation in Next 16?"* — With Cache Components, recently visited routes stay mounted via React `<Activity>`, which preserves state. Great for forms, but you must deliberately reset sensitive state, e.g. a full reload on logout and clearing auth forms.
- *"How did you make the nav accessible?"* — Semantic `<nav aria-label>`, `aria-current` for the active page, `aria-expanded`/`aria-controls` on toggles, Escape/outside-click to close, visible focus.
- *"Tell me about a bug you found through testing."* — A stale token on the public home page triggered the global 401 handler and kicked visitors to /login. I separated "validate stored token at startup" (fail silently) from "token expired mid-session" (log out), and added a regression test.

---

# ✅ Phase 8 complete

Next.js 16 frontend foundation: fintech design tokens, typed API client with a single error type, auth provider (session restore, central 401 logout, cross-tab logout), validated login/register with a reusable UI kit, role-aware route guard, and an accessible app shell. Verified with 43 automated real-browser checks across desktop and mobile.

---

# Phase 9 — Customer UI

## 9.1 Loan calculator widget (landing page)

### What it does
- **`components/calculator/LoanCalculator.tsx`** (client component), placed in the landing-page hero in place of the static example card:
  - **Three sliders:** amount $2,000–$50,000 ($500 steps), term 6–60 months, example rate 5–25% (0.25% steps).
  - **Result panel:** estimated monthly repayment, total interest, total repayable, all from **`POST /calculator/quote`**.
  - **Debounced (250 ms) requests + `AbortController`:** stale requests are cancelled.
  - While a new quote loads, the old numbers fade (`aria-busy`). On failure, a friendly `role="alert"` message, and the inputs keep working.
  - **CTA "Apply for $X":** logged-out → `/register`; logged-in customer → `/applications/new?amount=…&term=…` (pre-fills the form in 9.3).
  - Default inputs = the spec example, with its quote **pre-filled**, so the prerendered HTML already shows real numbers.
- **`components/ui/RangeField.tsx`:** accessible labelled slider (native `<input type="range">`, `<output>`, `aria-valuetext` "$10,000", min/max labels) + `.range-slider` CSS with a brand-filled track (`--fill`).
- **`lib/loanRules.ts`:** front-end copy of the limits.
- **`api.post(path, body, { headers, signal })`:** now supports abort signals.

### Why
- **Quotes come from the API, not duplicated maths:** the same `generateSchedule` that approvals use, so a quote can never disagree with a real approval (single source of truth, as in 4.3).
- **Debounce:** dragging a slider fires dozens of change events. Without debouncing, that's dozens of API calls per second. Verified: 12 rapid key presses → **1 request**.
- **AbortController fixes a race condition:** if request A (slow) and then B (fast) are in flight, A's late response could overwrite B's. Aborting the previous request on every change guarantees the latest input wins.
- **Pre-filled default quote:** the server-rendered HTML shows `$888.49` immediately (fast first paint, works before JS loads, and for crawlers). The API then confirms it.
- **"Example interest rate":** the real rate is decided at approval. Labelling it as an example and adding a disclaimer keeps the UI honest, which is important in lending (I also removed a "No credit check" badge that would have been a misleading claim).
- **Native range input:** keyboard support (arrows, Home/End, PageUp/Down) and screen-reader semantics for free. `aria-valuetext` makes it announce "$10,000" instead of "1000000". `aria-live` on the result announces new repayments.
- **Only the calculator is a client component:** the rest of the landing page stays a server component (less JS shipped).

### How to test
Real browser (Edge + playwright-core), **14/14**:
- **Display:** default `$888.49` is in the static HTML; it shows `$888.49` / `$661.86` after the API confirms; sliders announce formatted values.
- **Accuracy:** End key → $50,000, and the repayment **equals a direct API quote**; the CTA follows the amount. Term 24 months and rate 5% also match the API exactly.
- **Debounce:** 12 rapid changes → 1 request.
- **CTA:** logged-out → `/register`; logged-in customer → `/applications/new?amount=1000000&term=12`.
- **Failure:** simulated outage (aborted requests) → friendly error; recovers when the API is back.
- **Layout:** no mobile overflow at 390 px; no JS errors.

*Test gotcha:* one check failed with "$4,442.44 vs $4,442.44". During the debounce window the request hasn't started, so `aria-busy` is already false and the test read the **old** value. Fixed by computing the expected value first and waiting until the UI shows it. A timing bug in the test, not the app.

### Interview points
- *"How do you avoid hammering the API from a slider?"* — Debounce the input (send after the user pauses) and cancel in-flight requests with `AbortController`.
- *"What race condition can happen with search-as-you-type / live calculators, and how did you fix it?"* — Out-of-order responses: an older, slower response overwrites a newer one. Aborting the previous request (or tracking a request ID) ensures only the latest result is applied.
- *"Why call the API instead of calculating in the browser?"* — One source of truth for money maths. The quote uses exactly the code that generates real repayment schedules.
- *"How did you make the sliders accessible?"* — Native range inputs with labels, `aria-valuetext` for human-readable values, and an `aria-live` region for results.

---

<!-- Next: 9.2 dashboard list -->
