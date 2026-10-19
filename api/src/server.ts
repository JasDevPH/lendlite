import { app } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

// The only file that opens a port. Everything else is importable/testable.
const server = app.listen(env.PORT, () => {
  logger.info(`LendLite API listening on http://localhost:${env.PORT}/api/v1`);
});

// Clear message for the most common startup failure
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(`Port ${env.PORT} is already in use — change PORT in api/.env`);
  } else {
    logger.fatal({ err }, 'Server failed to start');
  }
  process.exit(1);
});

// Graceful shutdown: stop accepting new requests, let in-flight ones finish.
// (Docker/hosting platforms send SIGTERM; Ctrl+C sends SIGINT.)
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  server.close(() => process.exit(0));
  // Safety net: force exit if connections don't close in time
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
