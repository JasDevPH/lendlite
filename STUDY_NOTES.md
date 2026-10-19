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

<!-- Next: 1.5 app.ts + server.ts with /health -->
