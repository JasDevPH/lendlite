import { asyncHandler } from '../../utils/asyncHandler';
import type { ListApplicationsQuery } from './admin.schema';
import * as adminService from './admin.service';

// GET /admin/applications?status=&minAmount=&maxAmount=&page=&pageSize=
export const listApplications = asyncHandler(async (req, res) => {
  // validate() already replaced req.query with the parsed, coerced values
  const result = await adminService.listApplications(req.query as unknown as ListApplicationsQuery);
  res.json({ data: result });
});
