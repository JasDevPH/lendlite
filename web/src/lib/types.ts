// Shapes of the data the LendLite API returns. They mirror the backend's
// Prisma models + responses. (A shared package would remove the duplication;
// for a two-app repo, keeping them side by side is simpler to follow.)
// Money is ALWAYS integer cents; rates are basis points; dates are ISO strings.

export type Role = 'CUSTOMER' | 'ADMIN';

export type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CASUAL' | 'SELF_EMPLOYED' | 'UNEMPLOYED';

export type DocumentType = 'PAYSLIP' | 'ID' | 'BANK_STATEMENT';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface LoanDocument {
  id: string;
  applicationId: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface Installment {
  id: string;
  installmentNo: number;
  dueDate: string;
  paymentCents: number;
  principalCents: number;
  interestCents: number;
  balanceCents: number;
}

export interface LoanApplication {
  id: string;
  userId: string;
  status: ApplicationStatus;
  amountCents: number;
  termMonths: number;
  purpose: string;
  annualRateBps: number | null;
  employmentType: EmploymentType | null;
  employerName: string | null;
  annualIncomeCents: number | null;
  monthlyExpensesCents: number | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// GET /applications/:id also includes documents, schedule and the applicant
export interface LoanApplicationDetail extends LoanApplication {
  documents: LoanDocument[];
  schedule: Installment[];
  user: Pick<User, 'id' | 'fullName' | 'email'>;
  decidedById: string | null;
}

export interface Quote {
  amountCents: number;
  termMonths: number;
  annualRateBps: number;
  monthlyPaymentCents: number;
  totalInterestCents: number;
  totalPaymentCents: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminApplicationRow extends LoanApplication {
  user: Pick<User, 'id' | 'email' | 'fullName'>;
  _count: { documents: number };
}

export interface AuditEntry {
  id: string;
  applicationId: string;
  action: 'CREATED' | 'SUBMITTED' | 'REVIEW_STARTED' | 'APPROVED' | 'REJECTED' | 'DOCUMENT_UPLOADED';
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: Pick<User, 'id' | 'fullName' | 'email' | 'role'> | null;
}

export interface AdminStats {
  countsByStatus: Record<ApplicationStatus, number>;
  totalApplications: number;
  totalApprovedAmountCents: number;
  since: string | null;
}

// Error body the API sends: { error: { code, message, details? } }
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
