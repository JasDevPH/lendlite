import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 doesn't catch rejected promises from async handlers — the request
// would hang and the error would be an "unhandled rejection". This wrapper
// forwards any async error to next(), so the central errorHandler formats it.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
