// Creates the demo users from the spec. Run with: npx prisma db seed
// Idempotent: safe to run repeatedly (upsert by email).
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Cost 12 = 2^12 hashing rounds: slow enough to resist brute force,
// fast enough (~200ms) for a login. Spec minimum is 10.
const BCRYPT_COST = 12;

const SEED_USERS = [
  { email: 'admin@lendlite.dev', password: 'Admin1234', fullName: 'Ada Admin', role: Role.ADMIN },
  { email: 'customer@lendlite.dev', password: 'Customer1234', fullName: 'Casey Customer', role: Role.CUSTOMER },
] as const;

async function main(): Promise<void> {
  // Known demo passwords must never end up in a real database
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo users in production');
  }

  for (const { email, password, fullName, role } of SEED_USERS) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // upsert = insert if missing, otherwise reset to the known demo values
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, fullName, role },
      update: { passwordHash, fullName, role },
    });
    console.log(`  ✔ ${user.role.padEnd(8)} ${user.email}`);
  }
}

main()
  .then(() => console.log('Seed complete'))
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  // Always close the connection, success or failure
  .finally(() => prisma.$disconnect());
