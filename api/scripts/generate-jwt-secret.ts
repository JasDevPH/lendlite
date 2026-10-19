// Generates a cryptographically random JWT signing secret.
//   npm run secret:jwt            → print a new secret
//   npm run secret:jwt -- --write → save it as JWT_SECRET in api/.env
import { randomBytes } from 'node:crypto';
import { mask, upsertEnvVar } from './lib/env-file';

// 64 random bytes = 512 bits of entropy (HS256 needs at least 256).
// base64url keeps it URL/.env-safe: no "+", "/", "=" or spaces.
const secret = randomBytes(64).toString('base64url');

if (process.argv.includes('--write')) {
  upsertEnvVar('JWT_SECRET', secret);
  console.log(`JWT_SECRET written to api/.env (${mask(secret)}, ${secret.length} chars)`);
  console.log('Note: changing it invalidates every token signed with the old secret.');
} else {
  console.log(secret);
}
