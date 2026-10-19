import { Role } from '@prisma/client';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { uploadSingleFile } from '../../middleware/upload';
import { validate } from '../../middleware/validate';
import * as documentsController from '../documents/documents.controller';
import * as applicationsController from './applications.controller';
import {
  applicationIdParamsSchema,
  createApplicationSchema,
  updateApplicationSchema,
} from './applications.schema';

// Mounted at /api/v1/applications. Every route needs a logged-in user.
export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

const customerOnly = requireRole(Role.CUSTOMER);
const idParams = validate({ params: applicationIdParamsSchema });

applicationsRouter.post('/', customerOnly, validate({ body: createApplicationSchema }), applicationsController.create);
applicationsRouter.get('/', customerOnly, applicationsController.listMine);
// Customers see their own; admins see any (enforced in the service)
applicationsRouter.get('/:id', requireRole(Role.CUSTOMER, Role.ADMIN), idParams, applicationsController.getOne);
applicationsRouter.patch(
  '/:id',
  customerOnly,
  idParams,
  validate({ body: updateApplicationSchema }),
  applicationsController.update,
);
// Header: Idempotency-Key (optional)
applicationsRouter.post('/:id/submit', customerOnly, idParams, applicationsController.submit);
// Multipart upload. Auth, role and id checks run BEFORE multer, so bad
// requests are rejected without anything being written to disk.
applicationsRouter.post('/:id/documents', customerOnly, idParams, uploadSingleFile, documentsController.upload);
