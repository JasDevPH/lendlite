import type { RequestHandler } from 'express';
import type { QuoteInput } from './calculator.schema';
import * as calculatorService from './calculator.service';

// Synchronous (no DB), so no asyncHandler needed: Express catches sync throws itself
export const quote: RequestHandler = (req, res) => {
  res.json({ data: calculatorService.getQuote(req.body as QuoteInput) });
};
