import { asyncHandler } from '../../utils/asyncHandler';
import type { ApproveInput, ListApplicationsQuery, RejectInput, StatsQuery } from './admin.schema';
import * as adminService from './admin.service';

// GET /admin/applications?status=&minAmount=&maxAmount=&page=&pageSize=
export const listApplications = asyncHandler(async (req, res) => {
  // validate() already replaced req.query with the parsed, coerced values
  const result = await adminService.listApplications(req.query as unknown as ListApplicationsQuery);
  res.json({ data: result });
});

// POST /admin/applications/:id/start-review
export const startReview = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const application = await adminService.startReview(id, req.user!);
  res.json({ data: application });
});

// POST /admin/applications/:id/approve   body: { annualRateBps }
export const approve = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const { annualRateBps } = req.body as ApproveInput;
  const application = await adminService.approve(id, req.user!, annualRateBps);
  res.json({ data: application });
});

// POST /admin/applications/:id/reject   body: { reason }
export const reject = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const { reason } = req.body as RejectInput;
  const application = await adminService.reject(id, req.user!, reason);
  res.json({ data: application });
});

// GET /admin/applications/:id/audit
export const auditTrail = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const entries = await adminService.getAuditTrail(id);
  res.json({ data: entries });
});

// GET /admin/stats?since=
export const stats = asyncHandler(async (req, res) => {
  // validate() already replaced req.query with the parsed values (since is a real Date)
  const query = req.query as unknown as StatsQuery;
  const result = await adminService.getStats(query);
  res.json({ data: result });
});
