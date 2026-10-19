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

<!-- Next: 1.3 lib/logger.ts -->
