import 'dotenv/config';
import { z } from 'zod';

// Every env var the API needs, validated once at startup.
// process.env values are always strings, so numbers use z.coerce.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // 4001, not 4000: another local stack already uses 4000
  PORT: z.coerce.number().int().positive().default(4001),
  DATABASE_URL: z.string().url(),
  // Short secrets make JWTs brute-forceable, so enforce a minimum length
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  // Where document files live: local folder (dev/tests) or Cloudinary (production)
  STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  // From the Cloudinary dashboard; the SDK reads it straight from process.env
  CLOUDINARY_URL: z
    .string()
    .regex(/^cloudinary:\/\/[^:]+:[^@]+@.+$/, 'must look like cloudinary://<api_key>:<api_secret>@<cloud_name>')
    .optional(),
  CLOUDINARY_FOLDER: z.string().default('lendlite/documents'),
  // Number of reverse proxies in front of the API (Railway = 1). 0 locally: trusting
  // X-Forwarded-For without a proxy would let clients fake their IP and dodge the rate limiter.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
}).refine((e) => e.STORAGE_DRIVER !== 'cloudinary' || e.CLOUDINARY_URL, {
  // Fail at boot, not on the first upload
  message: 'CLOUDINARY_URL is required when STORAGE_DRIVER=cloudinary',
  path: ['CLOUDINARY_URL'],
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

// Fail fast: crash on boot with a clear message rather than failing later at runtime.
// (console, not the logger — the logger itself depends on env.)
if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env: Env = parsed.data;
