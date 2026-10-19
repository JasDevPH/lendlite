// Provisions a Neon (serverless Postgres) database for LendLite and writes
// DATABASE_URL into api/.env. Safe to re-run: reuses the project if it exists.
//
//   npm run db:neon
//
// Prereqs: Neon CLI installed (npm i -g neonctl) and logged in (neonctl auth).
// Optional env vars: NEON_ORG_ID (required if you belong to several orgs).
import { execSync } from 'node:child_process';
import { mask, upsertEnvVar } from './lib/env-file';

const PROJECT_NAME = 'lendlite';
const DB_NAME = 'lendlite';
const ROLE_NAME = 'lendlite';
// Sydney: keeps data in Australia, closest to the target users
const REGION = 'aws-ap-southeast-2';
// Matches the spec (PostgreSQL 16)
const PG_VERSION = 16;

interface NeonOrg {
  id: string;
  name: string;
}

interface NeonProject {
  id: string;
  name: string;
  region_id: string;
}

// Runs a neonctl command and returns stdout. shell:true so the npm .cmd/.ps1
// shim resolves on Windows; all arguments are constants, never user input.
function neon(args: string): string {
  return execSync(`neonctl ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function neonJson<T>(args: string): T {
  return JSON.parse(neon(`${args} --output json`)) as T;
}

function resolveOrgId(): string {
  if (process.env.NEON_ORG_ID) return process.env.NEON_ORG_ID;

  const orgs = neonJson<NeonOrg[]>('orgs list');
  const [first] = orgs;
  if (orgs.length === 1 && first) return first.id;

  const list = orgs.map((o) => `  ${o.id}  (${o.name})`).join('\n');
  throw new Error(`Several Neon orgs found — set NEON_ORG_ID to one of:\n${list}`);
}

function findOrCreateProject(orgId: string): NeonProject {
  const existing = neonJson<NeonProject[]>(`projects list --org-id ${orgId}`).find(
    (p) => p.name === PROJECT_NAME,
  );
  if (existing) {
    console.log(`Using existing project "${PROJECT_NAME}" (${existing.id}, ${existing.region_id})`);
    return existing;
  }

  console.log(`Creating project "${PROJECT_NAME}" in ${REGION} (Postgres ${PG_VERSION})…`);
  const created = neonJson<{ project: NeonProject }>(
    `projects create --org-id ${orgId} --name ${PROJECT_NAME} --region-id ${REGION} ` +
      `--pg-version ${PG_VERSION} --database ${DB_NAME} --role ${ROLE_NAME} --no-secrets`,
  );
  console.log(`Created project ${created.project.id}`);
  return created.project;
}

function main(): void {
  try {
    neon('me --output json');
  } catch {
    throw new Error('Not logged in to Neon. Run `neonctl auth` first.');
  }

  const orgId = resolveOrgId();
  const project = findOrCreateProject(orgId);

  // Direct (non-pooled) connection: Prisma migrations need a direct connection
  const url = neon(
    `connection-string --project-id ${project.id} --database-name ${DB_NAME} --role-name ${ROLE_NAME}`,
  );
  upsertEnvVar('DATABASE_URL', url);

  // Never print the password part of the URL
  const safeUrl = url.replace(/\/\/([^:]+):([^@]+)@/, (_m, user: string, pass: string) => `//${user}:${mask(pass)}@`);
  console.log(`DATABASE_URL written to api/.env → ${safeUrl}`);
}

try {
  main();
} catch (err) {
  console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
