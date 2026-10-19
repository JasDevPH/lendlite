import { asyncHandler } from '../../utils/asyncHandler';
import { submitHeadersSchema, type CreateApplicationInput, type UpdateApplicationInput } from './applications.schema';
import * as applicationsService from './applications.service';

// HTTP only: req.user is guaranteed by requireAuth; body/params were already
// validated (and cleaned) by the validate middleware on each route.

export const create = asyncHandler(async (req, res) => {
  const application = await applicationsService.createApplication(req.user!, req.body as CreateApplicationInput);
  res.status(201).json({ data: application });
});

export const listMine = asyncHandler(async (req, res) => {
  const applications = await applicationsService.listMyApplications(req.user!);
  res.json({ data: applications });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const application = await applicationsService.getApplication(id, req.user!);
  res.json({ data: application });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const application = await applicationsService.updateDraft(id, req.user!, req.body as UpdateApplicationInput);
  res.json({ data: application });
});

export const submit = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  // Header is optional; if present it must be well-formed (ZodError → 400)
  const { 'idempotency-key': idempotencyKey } = submitHeadersSchema.parse({
    'idempotency-key': req.get('Idempotency-Key'),
  });
  const { application, replayed } = await applicationsService.submitApplication(id, req.user!, idempotencyKey);
  // Lets clients (and you, debugging) see that nothing was re-processed
  if (replayed) res.set('Idempotent-Replayed', 'true');
  res.json({ data: application });
});
