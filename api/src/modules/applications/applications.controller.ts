import { asyncHandler } from '../../utils/asyncHandler';
import type { CreateApplicationInput, UpdateApplicationInput } from './applications.schema';
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
