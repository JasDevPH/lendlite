import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as authController from './auth.controller';
import { loginSchema, registerSchema } from './auth.schema';

// Mounted at /api/v1/auth
export const authRouter = Router();

authRouter.post('/register', validate({ body: registerSchema }), authController.register);
authRouter.post('/login', validate({ body: loginSchema }), authController.login);
authRouter.get('/me', requireAuth, authController.me);
