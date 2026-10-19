import { asyncHandler } from '../../utils/asyncHandler';
import type { LoginInput, RegisterInput } from './auth.schema';
import * as authService from './auth.service';

// Controllers = HTTP only: read the (already validated) request, call the
// service, send the response. No business rules, no Prisma here.

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body as RegisterInput);
  // 201 Created: a new resource (the user) now exists
  res.status(201).json({ data: result });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body as LoginInput);
  res.json({ data: result });
});

// Route is behind requireAuth, which guarantees req.user is set
export const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user!.id);
  res.json({ data: user });
});
