'use client';

import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { DOCUMENT_TYPES } from '@/lib/documents';
import { formatCents, formatDateTime, formatRate } from '@/lib/format';
import { STATUS_META } from '@/lib/status';
import type { AuditEntry } from '@/lib/types';
import { useApi } from '@/lib/useApi';

const ACTION_META: Record<AuditEntry['action'], { label: string; icon: string; tone: string }> = {
  CREATED: { label: 'Application started', icon: '✎', tone: 'bg-slate-100 text-slate-700' },
  DOCUMENT_UPLOADED: { label: 'Document uploaded', icon: '⇪', tone: 'bg-slate-100 text-slate-700' },
  SUBMITTED: { label: 'Submitted for review', icon: '➜', tone: 'bg-brand-50 text-brand-700' },
  REVIEW_STARTED: { label: 'Review started', icon: '◉', tone: 'bg-amber-50 text-amber-800' },
  APPROVED: { label: 'Approved', icon: '✓', tone: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Declined', icon: '✕', tone: 'bg-rose-50 text-rose-700' },
};

// Read typed values out of the free-form metadata JSON safely
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : null);

// The recorded details that matter for each kind of event
function details(entry: AuditEntry): ReactNode {
  const m = entry.metadata ?? {};
  switch (entry.action) {
    case 'APPROVED': {
      const rate = num(m.annualRateBps), monthly = num(m.monthlyPaymentCents), interest = num(m.totalInterestCents), n = num(m.installments);
      return (
        <>
          {rate !== null && <>Rate {formatRate(rate)}</>}
          {monthly !== null && <> · {formatCents(monthly)}/month</>}
          {n !== null && <> · {n} installments</>}
          {interest !== null && <> · {formatCents(interest)} total interest</>}
        </>
      );
    }
    case 'REJECTED':
      return str(m.reason) ? <>“{str(m.reason)}”</> : null;
    case 'DOCUMENT_UPLOADED': {
      const type = DOCUMENT_TYPES.find((t) => t.type === str(m.type))?.title ?? str(m.type);
      return (
        <>
          {type}
          {str(m.fileName) && <> — {str(m.fileName)}</>}
        </>
      );
    }
    default:
      return null;
  }
}

// Admin-only history from GET /admin/applications/:id/audit, oldest first.
// Each entry: what happened, status change, who (name + role), when, details.
export function AuditTrail({ applicationId }: { applicationId: string }) {
  const { data: entries, error, loading, reload } = useApi<AuditEntry[]>(`/admin/applications/${applicationId}/audit`);

  if (error) {
    return (
      <Alert tone="error" title="We couldn't load the audit trail">
        <Button variant="secondary" className="mt-2" onClick={reload}>
          Try again
        </Button>
      </Alert>
    );
  }
  if (loading && !entries) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading audit trail">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-line/40" />
        ))}
      </div>
    );
  }
  if (!entries || entries.length === 0) return <p className="text-sm text-muted">No activity recorded yet.</p>;

  return (
    <ol className="relative space-y-5" aria-label="Audit trail">
      {/* Vertical rail behind the icons */}
      <span aria-hidden="true" className="absolute bottom-2 left-4 top-2 w-px bg-line" />
      {entries.map((entry) => {
        const meta = ACTION_META[entry.action];
        const detail = details(entry);
        return (
          <li key={entry.id} className="relative flex gap-4" data-testid="audit-entry">
            <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-4 ring-surface ${meta.tone}`} aria-hidden="true">
              {meta.icon}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p className="text-sm font-semibold text-ink">
                  {meta.label}
                  {entry.fromStatus && entry.toStatus && (
                    <span className="ml-2 text-xs font-medium text-muted">
                      {STATUS_META[entry.fromStatus].label} → {STATUS_META[entry.toStatus].label}
                    </span>
                  )}
                </p>
                <time dateTime={entry.createdAt} className="shrink-0 text-xs text-subtle">
                  {formatDateTime(entry.createdAt)}
                </time>
              </div>
              <p className="text-xs text-muted">
                by{' '}
                {entry.actor ? (
                  <>
                    <span className="font-medium text-ink">{entry.actor.fullName}</span> ({entry.actor.role === 'ADMIN' ? 'Admin' : 'Customer'})
                  </>
                ) : (
                  // The audit row outlives the user; the history is kept
                  <span className="italic">Deleted user</span>
                )}
              </p>
              {detail && <p className="mt-1 break-words text-sm text-ink" data-testid="audit-detail">{detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
