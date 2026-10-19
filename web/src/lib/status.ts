import type { ApplicationStatus } from './types';

// One source of truth for how each status looks and reads — used by the
// customer dashboard, the application detail page and the admin screens.
interface StatusMeta {
  label: string;
  // Tailwind classes for the badge (background + text + dot)
  badge: string;
  dot: string;
  // What it means for the customer, in plain language
  customerHint: string;
}

export const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  DRAFT: {
    label: 'Draft',
    badge: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
    customerHint: 'Not submitted yet — finish your details and documents.',
  },
  SUBMITTED: {
    label: 'Submitted',
    badge: 'bg-brand-50 text-brand-700',
    dot: 'bg-brand-500',
    customerHint: 'Received. A lending specialist will review it soon.',
  },
  UNDER_REVIEW: {
    label: 'Under review',
    badge: 'bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
    customerHint: 'A lending specialist is assessing your application.',
  },
  APPROVED: {
    label: 'Approved',
    badge: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    customerHint: 'Approved — your repayment schedule is ready.',
  },
  REJECTED: {
    label: 'Declined',
    badge: 'bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
    customerHint: 'Unfortunately this application was declined.',
  },
};

// The order a customer's application moves through (for timelines)
export const STATUS_FLOW: ApplicationStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];
