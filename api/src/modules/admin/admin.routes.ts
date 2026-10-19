import { Role } from '@prisma/client';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { applicationIdParamsSchema } from '../applications/applications.schema';
import * as adminController from './admin.controller';
import { listApplicationsQuerySchema } from './admin.schema';

// Mounted at /api/v1/admin. EVERY route here is admin-only, set once for the router.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(Role.ADMIN));

const idParams = validate({ params: applicationIdParamsSchema });

adminRouter.get('/applications', validate({ query: listApplicationsQuerySchema }), adminController.listApplications);
adminRouter.post('/applications/:id/start-review', idParams, adminController.startReview);
