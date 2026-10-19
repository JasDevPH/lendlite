import { Role } from '@prisma/client';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as documentsController from './documents.controller';
import { documentIdParamsSchema } from './documents.schema';

// Mounted at /api/v1/documents
// (Uploading lives under /applications/:id/documents — see applications.routes.ts)
export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.get(
  '/:id/download',
  requireRole(Role.CUSTOMER, Role.ADMIN),
  validate({ params: documentIdParamsSchema }),
  documentsController.download,
);
