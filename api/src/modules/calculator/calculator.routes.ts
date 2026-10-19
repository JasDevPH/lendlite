import { Router } from 'express';
import { validate } from '../../middleware/validate';
import * as calculatorController from './calculator.controller';
import { quoteSchema } from './calculator.schema';

// Mounted at /api/v1/calculator — public, no auth (used by the landing page)
export const calculatorRouter = Router();

// POST (not GET) because the input is a JSON body, though nothing is created
calculatorRouter.post('/quote', validate({ body: quoteSchema }), calculatorController.quote);
