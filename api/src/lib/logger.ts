import { pino } from 'pino';
import { env } from '../config/env';

const isDev = env.NODE_ENV === 'development';

// One shared logger for the whole API.
// Dev: human-readable coloured output. Production: one JSON object per line,
// which log platforms (CloudWatch, Datadog…) can search and filter by field.
export const logger = pino({
  // Keep test output clean; 'debug' in dev for extra detail
  level: env.NODE_ENV === 'test' ? 'silent' : isDev ? 'debug' : 'info',
  // Never write credentials to logs, even by accident
  redact: {
    paths: ['req.headers.authorization', '*.password', '*.passwordHash', '*.token'],
    censor: '[REDACTED]',
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
});
