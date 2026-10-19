# LendLite — Mini Digital Lending Platform

> Build spec for Claude Code. Read this whole file before starting any phase.

## 1. Purpose & Context

LendLite is a **portfolio project** built to prepare for a Junior Software Engineer interview at an Australian fintech (digital lending platform). It must mirror their stack and show solid engineering fundamentals. The developer must be able to **explain every line of code** in an interview, so clarity beats cleverness.

**What it does:** Customers apply for a personal loan, upload documents, and track their status. An admin reviews applications, approves or rejects them, and the system generates a repayment schedule on approval.

---

## 2. How to Work With Me (IMPORTANT)

1. **Build one component at a time.** Never generate a whole phase in one go. Example order for a phase: config → model → service → controller → route → test.
2. After each component, **stop and explain briefly**:
   - What the file does and why
   - Step-by-step how to implement/run/test it (commands to run, what output to expect)
3. Wait for my confirmation (or a reported error) before moving to the next component.
4. If something errors, fix only that component — don't rewrite unrelated files.
5. Keep code simple, typed, and commented where the "why" isn't obvious.
6. Commit at the end of each component or phase with a clear conventional commit message (e.g. `feat(auth): add register endpoint`).
7. Update the README checklist (Section 11) as phases complete.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere (strict mode) |
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL 16 |
| ORM | Prisma (plus at least one raw SQL query via `prisma.$queryRaw` for the admin stats endpoint, to demonstrate SQL) |
| Validation | Zod (shared schemas where practical) |
| Auth | JWT (access token) + bcrypt password hashing |
| File uploads | Multer → local `uploads/` folder in dev (S3 optional, Phase 10) |
| Testing | Jest + Supertest (backend) |
| Logging | pino |
| Security middleware | helmet, cors, express-rate-limit |
| DevOps | Docker Compose (Postgres + api + web), GitHub Actions CI |
| Optional | MongoDB for audit logs (Phase 11 stretch only — default is Postgres) |

Node version: 20 LTS. Package manager: npm.

---

## 4. Repository Structure (monorepo, no Turborepo needed)

```
lendlite/
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .github/workflows/ci.yml
├── api/
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.ts
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── app.ts              # express app (no listen) — imported by tests
│   │   ├── server.ts           # starts the server
│   │   ├── config/env.ts       # Zod-validated env vars
│   │   ├── lib/prisma.ts
│   │   ├── lib/logger.ts
│   │   ├── middleware/         # auth, requireRole, validate, errorHandler, rateLimit
│   │   ├── modules/
│   │   │   ├── auth/           # auth.routes.ts, auth.controller.ts, auth.service.ts, auth.schema.ts
│   │   │   ├── applications/
│   │   │   ├── documents/
│   │   │   ├── admin/
│   │   │   └── calculator/
│   │   ├── utils/              # money.ts, amortization.ts, AppError.ts
│   │   └── types/
│   └── tests/
└── web/
    ├── package.json
    ├── src/app/                # Next.js App Router pages
    ├── src/components/
    ├── src/lib/api.ts          # fetch wrapper
    └── src/lib/auth.ts
```

---

## 5. Data Model (Prisma)

**Money rule:** all money is stored as **integer cents** (`Int`). Interest rate stored as **basis points** (`Int`, e.g. 12.50% = 1250). Never use floats for money in the DB.

```prisma
enum Role { CUSTOMER ADMIN }

enum ApplicationStatus { DRAFT SUBMITTED UNDER_REVIEW APPROVED REJECTED }

enum EmploymentType { FULL_TIME PART_TIME CASUAL SELF_EMPLOYED UNEMPLOYED }

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  fullName     String
  role         Role     @default(CUSTOMER)
  createdAt    DateTime @default(now())
  applications LoanApplication[]
}

model LoanApplication {
  id                  String            @id @default(uuid())
  userId              String
  user                User              @relation(fields: [userId], references: [id])
  status              ApplicationStatus @default(DRAFT)
  amountCents         Int               // 2,000.00 – 50,000.00 AUD
  termMonths          Int               // 6 – 60
  purpose             String
  annualRateBps       Int?              // set by admin on approval
  employmentType      EmploymentType?
  employerName        String?
  annualIncomeCents   Int?
  monthlyExpensesCents Int?
  rejectionReason     String?
  idempotencyKey      String?           @unique
  submittedAt         DateTime?
  decidedAt           DateTime?
  decidedById         String?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  documents           Document[]
  schedule            RepaymentInstallment[]
  auditLogs           AuditLog[]

  @@index([status])
  @@index([userId])
}

model Document {
  id            String   @id @default(uuid())
  applicationId String
  application   LoanApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  type          String   // "PAYSLIP" | "ID" | "BANK_STATEMENT"
  fileName      String
  storagePath   String
  mimeType      String
  sizeBytes     Int
  uploadedAt    DateTime @default(now())
}

model RepaymentInstallment {
  id              String   @id @default(uuid())
  applicationId   String
  application     LoanApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  installmentNo   Int
  dueDate         DateTime
  paymentCents    Int
  principalCents  Int
  interestCents   Int
  balanceCents    Int

  @@unique([applicationId, installmentNo])
}

model AuditLog {
  id            String   @id @default(uuid())
  applicationId String
  application   LoanApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  actorId       String
  action        String   // "CREATED" | "SUBMITTED" | "REVIEW_STARTED" | "APPROVED" | "REJECTED" | "DOCUMENT_UPLOADED"
  fromStatus    ApplicationStatus?
  toStatus      ApplicationStatus?
  metadata      Json?
  createdAt     DateTime @default(now())
}
```

---

## 6. Business Rules

### Status flow (enforce in the service layer, not the controller)

```
DRAFT ──submit──▶ SUBMITTED ──start review──▶ UNDER_REVIEW ──▶ APPROVED
                                                        └────▶ REJECTED
```

- Only the **owner** can edit a `DRAFT`. After submit, the customer can't edit.
- Submit requires: all fields filled + at least 1 document of type `ID` and 1 of type `PAYSLIP`.
- Only **ADMIN** can move to `UNDER_REVIEW`, `APPROVED`, `REJECTED`.
- `REJECTED` requires a `rejectionReason` (min 10 chars).
- `APPROVED` requires `annualRateBps` (range 500–2500 → 5%–25%).
- Invalid transitions → `409 Conflict` with code `INVALID_STATUS_TRANSITION`.
- Every transition writes an `AuditLog` row.

### Validation limits
- Amount: 200000–5000000 cents ($2,000–$50,000)
- Term: 6–60 months
- Password: min 8 chars, at least 1 letter and 1 number
- Upload: PDF/JPG/PNG only, max 5 MB

### Approval must be atomic
Use `prisma.$transaction` so these all succeed or all fail together:
1. Update application status → `APPROVED`, set `annualRateBps`, `decidedAt`, `decidedById`
2. Insert all `RepaymentInstallment` rows
3. Insert the `AuditLog` row

### Idempotent submit
`POST /applications/:id/submit` accepts an `Idempotency-Key` header. If the same key was already used for this application, return the same successful response without re-processing. Using it on a different application → `409`.

### Repayment schedule (amortization)
Monthly payment formula:

```
r = annualRateBps / 10000 / 12
M = P * r * (1 + r)^n / ((1 + r)^n - 1)
```

- Compute in cents, round each installment's payment and interest to the nearest cent.
- The **last installment absorbs any rounding remainder** so the final balance is exactly 0.
- First due date = decision date + 1 month.
- Put this in `utils/amortization.ts` as a **pure function** — it must have its own unit tests (e.g. $10,000 at 12% for 12 months → ~$888.49/month, final balance 0).

---

## 7. API Spec

Base URL: `/api/v1`. All responses JSON.

**Success:** `{ "data": ... }`
**Error:** `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /health | — | Health check (also checks DB) |
| POST | /auth/register | — | Create customer account |
| POST | /auth/login | — | Returns `{ token, user }` (rate limited: 5/min/IP) |
| GET | /auth/me | User | Current user |
| POST | /calculator/quote | — | `{ amountCents, termMonths, annualRateBps }` → monthly payment + total interest |
| POST | /applications | Customer | Create a DRAFT |
| GET | /applications | Customer | List my applications |
| GET | /applications/:id | Owner/Admin | Detail (incl. documents, schedule) |
| PATCH | /applications/:id | Owner | Update DRAFT fields |
| POST | /applications/:id/submit | Owner | Submit (Idempotency-Key header) |
| POST | /applications/:id/documents | Owner | Upload (multipart, field `file`, body `type`) |
| GET | /documents/:id/download | Owner/Admin | Download file |
| GET | /admin/applications | Admin | List with filters `?status=&minAmount=&maxAmount=&page=&pageSize=` |
| POST | /admin/applications/:id/start-review | Admin | SUBMITTED → UNDER_REVIEW |
| POST | /admin/applications/:id/approve | Admin | `{ annualRateBps }` → APPROVED + schedule |
| POST | /admin/applications/:id/reject | Admin | `{ reason }` → REJECTED |
| GET | /admin/applications/:id/audit | Admin | Audit trail |
| GET | /admin/stats | Admin | Counts per status + total approved amount (**raw SQL**) |

**Status codes:** 200, 201, 400 (validation), 401 (no/invalid token), 403 (wrong role/not owner), 404, 409 (conflict/invalid transition/idempotency mismatch), 413 (file too large), 429 (rate limit), 500.

Customers must get **404 (not 403)** when accessing another user's application, so IDs can't be probed.

---

## 8. Frontend Pages (Next.js App Router)

| Route | Who | Content |
|---|---|---|
| `/` | Public | Landing + loan calculator widget |
| `/login`, `/register` | Public | Auth forms with client-side Zod validation |
| `/dashboard` | Customer | My applications with status badges, "New application" button |
| `/applications/new` | Customer | Multi-step form: 1) Loan details 2) Employment & income 3) Documents 4) Review & submit |
| `/applications/[id]` | Customer | Status timeline, documents, repayment schedule table (if approved) |
| `/admin` | Admin | Stats cards + applications table with filters & pagination |
| `/admin/applications/[id]` | Admin | Full detail, documents, audit trail, Start review / Approve / Reject actions |

- Store JWT in memory + `localStorage` for simplicity (note in README: production would use httpOnly cookies — be ready to explain why).
- Format money with `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })`.
- Show loading, empty, and error states on every data page.
- Mobile-friendly layout.

---

## 9. Security Checklist
- bcrypt (cost 10+) for passwords; never return `passwordHash`
- JWT secret from env; token expiry 1h
- helmet, CORS restricted to `WEB_ORIGIN`
- Rate limit on `/auth/*`
- Zod validation on every request body/query/params
- Ownership checks in the service layer
- File type checked by mimetype **and** extension; random storage filenames
- No secrets committed; `.env.example` only
- Prisma = parameterized queries (raw SQL must use tagged template `$queryRaw`, never string concat)

---

## 10. Environment Variables (`api/.env.example`)

```
NODE_ENV=development
PORT=4001
DATABASE_URL=postgresql://lendlite:lendlite@localhost:5433/lendlite
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=1h
WEB_ORIGIN=http://localhost:3000
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=5
```

Web: `NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1`

> Ports changed from the original spec: API **4001** (4000 is used by another local stack), local Docker Postgres **5433** (5432 likewise). Neon (cloud) is the default dev DB; Docker Postgres is the offline alternative.

Seed users: `admin@lendlite.dev / Admin1234`, `customer@lendlite.dev / Customer1234`.

---

## 11. Build Phases

Build in order. Each phase lists components to build **one at a time**, and a "Done when" check.

### Phase 1 — Backend foundation
Components: `api/package.json` + tsconfig → `config/env.ts` → `lib/logger.ts` → `utils/AppError.ts` + `middleware/errorHandler.ts` → `app.ts` + `server.ts` with `/health` → `docker-compose.yml` (Postgres only for now).
**Done when:** `docker compose up -d db` + `npm run dev` → `GET /api/v1/health` returns 200.

### Phase 2 — Database schema
Components: `prisma/schema.prisma` → first migration → `lib/prisma.ts` → `seed.ts`.
**Done when:** `npx prisma migrate dev` succeeds, `npx prisma db seed` creates both users, `/health` reports DB ok.

### Phase 3 — Authentication
Components: `auth.schema.ts` → `auth.service.ts` (register/login/hash/sign) → `auth.controller.ts` + routes → `middleware/auth.ts` → `middleware/requireRole.ts` → rate limiter.
**Done when:** register, login, and `/auth/me` work via curl/Thunder Client; wrong password → 401; 6th login in a minute → 429.

### Phase 4 — Calculator + loan applications
Components: `utils/money.ts` → `utils/amortization.ts` → calculator module → applications schema → service (create/list/get/update with ownership + status rules) → controller/routes → submit with idempotency → audit log helper.
**Done when:** a customer can create, edit, and submit a draft; editing after submit → 409; repeated submit with same key returns same result.

### Phase 5 — Documents
Components: multer config (type/size limits) → documents service → upload + download routes → submit rule requiring ID + PAYSLIP.
**Done when:** uploads saved with random names, bad type → 400, >5MB → 413, submit without docs → 400.

### Phase 6 — Admin review
Components: admin list with filters + pagination → start-review → approve (transaction + schedule) → reject → audit trail endpoint → stats endpoint with raw SQL.
**Done when:** full flow DRAFT → APPROVED works, schedule rows exist and final balance = 0, audit trail shows every step.

### Phase 7 — Backend tests
Components: Jest config + test DB setup → amortization unit tests → auth integration tests → application flow integration tests (incl. invalid transitions, ownership 404, idempotency).
**Done when:** `npm test` passes with all of the above.

### Phase 8 — Frontend setup & auth
Components: Next.js + Tailwind init → `lib/api.ts` (typed fetch wrapper, error handling) → auth context/store → login/register pages → protected route guard → layout/nav.
**Done when:** can register/login from the UI and see an empty dashboard.

### Phase 9 — Customer UI
Components: calculator widget → dashboard list → multi-step application form (one step component at a time) → document upload → application detail with status timeline + schedule table.
**Done when:** a customer can complete the whole application flow in the browser.

### Phase 10 — Admin UI
Components: stats cards → applications table + filters + pagination → detail page → approve/reject modals → audit trail view.
**Done when:** an admin can review and decide applications in the browser.

### Phase 11 — DevOps & polish
Components: Dockerfiles (api, web) → full docker-compose → GitHub Actions CI (install, lint, typecheck, test with Postgres service, build) → README (overview, architecture diagram, setup, API table, screenshots, design decisions, "What I built" section) → optional deploy (Render/Railway, or AWS) → optional S3 storage → optional MongoDB audit log.
**Done when:** `docker compose up` runs everything from a fresh clone; CI is green.

### Progress
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

---

## 12. Code Conventions
- Layering: **routes → controller (HTTP only) → service (business logic) → Prisma**. No Prisma calls in controllers.
- Throw `AppError(statusCode, code, message)`; the error handler formats it. No try/catch boilerplate in every controller (use an async wrapper).
- Named exports, `camelCase` variables, `PascalCase` types, kebab or dot-case filenames as in Section 4.
- ESLint + Prettier configured; `npm run lint` and `npm run typecheck` scripts in both apps.
- Keep functions small; add a one-line comment above anything an interviewer might ask "why?" about.

---

## 13. Interview Talking Points (keep these in mind while building)
- Why money is stored as integer cents
- Why approval uses a DB transaction
- How idempotency prevents duplicate submissions
- Why customers get 404 instead of 403 for others' applications
- Why the status machine lives in the service layer
- Why `app.ts` is separate from `server.ts` (testability)
- JWT in localStorage vs httpOnly cookies trade-off
- Where the raw SQL query is and why Prisma's `$queryRaw` tagged template is injection-safe
