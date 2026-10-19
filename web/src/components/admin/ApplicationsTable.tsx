'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { StatusBadge } from '@/components/applications/StatusBadge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatCentsWhole, formatDate, formatMonths, parseDollarsToCents } from '@/lib/format';
import { STATUS_META } from '@/lib/status';
import type { AdminApplicationRow, ApplicationStatus, Pagination } from '@/lib/types';
import { useApi } from '@/lib/useApi';

const PAGE_SIZE = 10;
const STATUSES: ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DRAFT'];
const STATUS_OPTIONS = [
  { value: '', label: 'All (excluding drafts)' },
  ...STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })),
];

interface Filters {
  status: string; // '' = all non-draft (the API's default)
  min: string; // dollars, as typed
  max: string;
}

// Read filters from the URL (validated — never trust URLs)
function filtersFromUrl(params: URLSearchParams): Filters & { page: number } {
  const status = params.get('status') ?? '';
  const page = Number(params.get('page'));
  return {
    status: (STATUSES as string[]).includes(status) ? status : '',
    min: params.get('min') ?? '',
    max: params.get('max') ?? '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

// Admin review queue: filters + table + pagination, all driven by the URL so a
// filtered view can be shared, bookmarked and survives a refresh.
export function ApplicationsTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = filtersFromUrl(params);

  // Form state (what's typed) is separate from the applied filters (the URL)
  const [form, setForm] = useState<Filters>({ status: current.status, min: current.min, max: current.max });
  const [formError, setFormError] = useState<string | null>(null);

  // URL dollars → API cents
  const query = new URLSearchParams({ page: String(current.page), pageSize: String(PAGE_SIZE) });
  if (current.status) query.set('status', current.status);
  const minCents = current.min ? parseDollarsToCents(current.min) : null;
  const maxCents = current.max ? parseDollarsToCents(current.max) : null;
  if (minCents !== null) query.set('minAmount', String(minCents));
  if (maxCents !== null) query.set('maxAmount', String(maxCents));

  const { data, error, loading, reload } = useApi<{ items: AdminApplicationRow[]; pagination: Pagination }>(`/admin/applications?${query}`);

  function navigate(next: Filters & { page: number }) {
    const qs = new URLSearchParams();
    if (next.status) qs.set('status', next.status);
    if (next.min) qs.set('min', next.min);
    if (next.max) qs.set('max', next.max);
    if (next.page > 1) qs.set('page', String(next.page));
    const s = qs.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function onApply(event: FormEvent) {
    event.preventDefault();
    const min = form.min.replace(/[$,\s]/g, '');
    const max = form.max.replace(/[$,\s]/g, '');
    const minC = min ? parseDollarsToCents(min) : null;
    const maxC = max ? parseDollarsToCents(max) : null;
    if ((min && minC === null) || (max && maxC === null)) return setFormError('Enter amounts in dollars, e.g. 5000');
    if (minC !== null && maxC !== null && minC > maxC) return setFormError('Minimum amount must be less than the maximum');
    setFormError(null);
    // New filters → back to page 1
    navigate({ status: form.status, min, max, page: 1 });
  }

  function onReset() {
    setForm({ status: '', min: '', max: '' });
    setFormError(null);
    navigate({ status: '', min: '', max: '', page: 1 });
  }

  const items = data?.items;
  const pagination = data?.pagination;
  const filtered = Boolean(current.status || current.min || current.max);
  const from = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const to = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  return (
    <section aria-labelledby="queue-heading" className="space-y-4">
      <h2 id="queue-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Applications
      </h2>

      {/* Filters — one row above the results they control */}
      <form onSubmit={onApply} noValidate className="grid grid-cols-1 gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
        <SelectField label="Status" options={STATUS_OPTIONS} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} />
        <TextField label="Min amount" leading="$" inputMode="decimal" placeholder="2,000" value={form.min} onChange={(e) => setForm((f) => ({ ...f, min: e.target.value.replace(/\$/g, '') }))} />
        <TextField label="Max amount" leading="$" inputMode="decimal" placeholder="50,000" value={form.max} onChange={(e) => setForm((f) => ({ ...f, max: e.target.value.replace(/\$/g, '') }))} />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" className="flex-1 lg:flex-none">
            Apply
          </Button>
          <Button type="button" variant="ghost" onClick={onReset} disabled={!filtered && !form.status && !form.min && !form.max}>
            Reset
          </Button>
        </div>
        {formError && (
          <p role="alert" className="text-sm text-rose-600 sm:col-span-2 lg:col-span-4">
            {formError}
          </p>
        )}
      </form>

      {error && (
        <Alert tone="error" title="We couldn't load applications">
          <p>{error.message}</p>
          <Button variant="secondary" className="mt-3" onClick={reload}>
            Try again
          </Button>
        </Alert>
      )}

      {!items && loading && (
        <div className="space-y-2 rounded-card border border-line bg-surface p-4" aria-busy="true" aria-label="Loading applications">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-line/40" />
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState
          title={filtered ? 'No applications match these filters' : 'No applications yet'}
          description={filtered ? 'Try a different status or amount range.' : 'Submitted applications will appear here for review.'}
          action={
            filtered ? (
              <Button variant="secondary" onClick={onReset}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {items && items.length > 0 && pagination && (
        // Keep showing the previous page (dimmed) while the next one loads — no flash
        <div className={`min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {/* `relative` matters: the sr-only caption/labels inside are position:absolute.
              Without a positioned ancestor they escape this scroll box and widen the
              whole PAGE on phones (found by an automated overflow check). */}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-180 text-sm">
              <caption className="sr-only">
                Loan applications, page {pagination.page} of {pagination.totalPages}
              </caption>
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Applicant</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Term</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Docs</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((app) => (
                  <tr key={app.id} className="transition hover:bg-canvas/70">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{app.user.fullName}</p>
                      <p className="text-xs text-muted">{app.user.email}</p>
                    </td>
                    <td className="money px-4 py-3 text-right font-medium text-ink">{formatCentsWhole(app.amountCents)}</td>
                    <td className="px-4 py-3 text-muted">{formatMonths(app.termMonths)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="money px-4 py-3 text-right text-muted">{app._count.documents}</td>
                    <td className="px-4 py-3 text-muted">{app.submittedAt ? formatDate(app.submittedAt) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/applications/${app.id}`}
                        className="font-semibold text-brand-600 hover:text-brand-700"
                        aria-label={`Review ${app.user.fullName}'s ${formatCentsWhole(app.amountCents)} application`}
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <nav aria-label="Pagination" className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm sm:flex-row">
            <p className="text-muted" data-testid="pagination-summary">
              Showing <span className="font-medium text-ink">{from}</span>–<span className="font-medium text-ink">{to}</span> of{' '}
              <span className="font-medium text-ink">{pagination.total}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={pagination.page <= 1 || loading} onClick={() => navigate({ ...current, page: pagination.page - 1 })}>
                ← Previous
              </Button>
              <span className="px-2 text-muted">
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
              </span>
              <Button variant="secondary" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => navigate({ ...current, page: pagination.page + 1 })}>
                Next →
              </Button>
            </div>
          </nav>
        </div>
      )}
    </section>
  );
}
