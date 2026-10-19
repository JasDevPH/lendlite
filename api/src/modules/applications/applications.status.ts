import { ApplicationStatus } from '@prisma/client';
import { AppError } from '../../utils/AppError';

const { DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED } = ApplicationStatus;

// The status machine as data: from → the statuses it may move to.
//   DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED
// APPROVED and REJECTED are final (no outgoing transitions).
const ALLOWED_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  [DRAFT]: [SUBMITTED],
  [SUBMITTED]: [UNDER_REVIEW],
  [UNDER_REVIEW]: [APPROVED, REJECTED],
  [APPROVED]: [],
  [REJECTED]: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// Spec: invalid transitions → 409 INVALID_STATUS_TRANSITION
export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot move an application from ${from} to ${to}`);
  }
}
