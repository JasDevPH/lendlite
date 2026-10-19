import { Role } from '@prisma/client';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { applicationIdParamsSchema } from '../applications/applications.schema';
import * as adminController from './admin.controller';
import { approveBodySchema, listApplicationsQuerySchema, rejectBodySchema, statsQuerySchema } from './admin.schema';

// Mounted at /api/v1/admin. EVERY route here is admin-only, set once for the router.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(Role.ADMIN));

const idParams = validate({ params: applicationIdParamsSchema });

adminRouter.get('/applications', validate({ query: listApplicationsQuerySchema }), adminController.listApplications);
adminRouter.post('/applications/:id/start-review', idParams, adminController.startReview);
adminRouter.post('/applications/:id/approve', idParams, validate({ body: approveBodySchema }), adminController.approve);
adminRouter.post('/applications/:id/reject', idParams, validate({ body: rejectBodySchema }), adminController.reject);
adminRouter.get('/applications/:id/audit', idParams, adminController.auditTrail);
adminRouter.get('/stats', validate({ query: statsQuerySchema }), adminController.stats);
