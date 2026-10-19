// An "expected" error we throw on purpose (not found, conflict, forbidden…).
// The error handler turns it into: { error: { code, message, details? } }
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    // Machine-readable code the frontend can switch on, e.g. 'INVALID_STATUS_TRANSITION'
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
