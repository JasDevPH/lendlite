# LendLite — Build Progress

Tracks what has been built, phase by phase. Updated at the end of each component/phase.

## Phase 1 — Backend foundation (in progress)

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | `api/package.json` + `tsconfig.json` | Done | Express 4, helmet, cors, pino, Zod 3, dotenv; dev: TypeScript 5 (strict), tsx, pino-pretty. Scripts: `dev`, `build`, `start`, `typecheck`. Root `.gitignore` added. |
| 2 | `config/env.ts` | Todo | |
| 3 | `lib/logger.ts` | Todo | |
| 4 | `utils/AppError.ts` + `middleware/errorHandler.ts` | Todo | |
| 5 | `app.ts` + `server.ts` with `/health` | Todo | |
| 6 | `docker-compose.yml` (Postgres only) | Todo | |

**Done when:** `docker compose up -d db` + `npm run dev` → `GET /api/v1/health` returns 200.

### Decisions
- **TypeScript pinned to 5.x** — npm defaulted to TS 7 (Go port); ts-jest and most tooling still target TS 5.
- **Express 4** (not 5) — the spec uses an async wrapper for error handling, which is the Express 4 pattern.
- **CommonJS output** — simplest setup for Jest/ts-jest in Phase 7.
- ESLint + Prettier are deferred to a later component; `typecheck` script exists now.

## Phases overview
- [ ] Phase 1 — Backend foundation
- [ ] Phase 2 — Database schema
- [ ] Phase 3 — Authentication
- [ ] Phase 4 — Calculator + applications
- [ ] Phase 5 — Documents
- [ ] Phase 6 — Admin review
- [ ] Phase 7 — Backend tests
- [ ] Phase 8 — Frontend setup & auth
- [ ] Phase 9 — Customer UI
- [ ] Phase 10 — Admin UI
- [ ] Phase 11 — DevOps & polish
