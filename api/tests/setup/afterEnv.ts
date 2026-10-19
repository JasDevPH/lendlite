import { prisma } from '../../src/lib/prisma';

// Close the DB pool after each test file, otherwise Jest waits on open handles
afterAll(async () => {
  await prisma.$disconnect();
});
