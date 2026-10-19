import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

// Validates (and cleans) request parts before the controller runs.
// Parsed output REPLACES the raw input, so controllers get trimmed/coerced
// values with unknown fields stripped. A ZodError goes to errorHandler → 400.
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}
