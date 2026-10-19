import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_DIR = resolve(__dirname, '..', '..');
export const ENV_PATH = resolve(API_DIR, '.env');
const EXAMPLE_PATH = resolve(API_DIR, '.env.example');

// Set KEY=value in api/.env, replacing an existing line or appending a new one.
// Creates .env from .env.example first if it doesn't exist yet.
export function upsertEnvVar(key: string, value: string): void {
  if (!existsSync(ENV_PATH)) copyFileSync(EXAMPLE_PATH, ENV_PATH);

  const content = readFileSync(ENV_PATH, 'utf8');
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  // Function replacer: a plain string would treat "$&", "$1"… in the value as special
  const updated = pattern.test(content)
    ? content.replace(pattern, () => line)
    : `${content.trimEnd()}\n${line}\n`;

  writeFileSync(ENV_PATH, updated);
}

// For printing secrets safely: "abcd…wxyz"
export function mask(secret: string): string {
  return secret.length <= 8 ? '****' : `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}
