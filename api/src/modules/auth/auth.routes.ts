import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { authLimiter, loginLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import * as authController from './auth.controller';
import { loginSchema, registerSchema } from './auth.schema';

// Mounted at /api/v1/auth
export const authRouter = Router();

// Every /auth route: 30 req/min/IP
authRouter.use(authLimiter);

authRouter.post('/register', validate({ body: registerSchema }), authController.register);
// Limiter runs BEFORE validation and bcrypt, so blocked requests cost almost nothing
authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
authRouter.get('/me', requireAuth, authController.me);
