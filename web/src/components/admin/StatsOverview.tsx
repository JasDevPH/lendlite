'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { formatCentsCompact, formatCentsWhole } from '@/lib/format';
import { PIPELINE_COLORS } from '@/lib/status';
import type { AdminStats } from '@/lib/types';
import { useApi } from '@/lib/useApi';
import { PipelineBar } from './PipelineBar';

type Period = 'all' | '30d' | 'year';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'year', label: 'This year' },
];

// Period → the API's ?since= (YYYY-MM-DD). Computed when the user picks a
// period (an event, not during render), so it's fine to read the clock here.
function sinceFor(period: Period): string | null {
  if (period === 'all') return null;
  const d = new Date();
  if (period === '30d') d.setDate(d.getDate() - 30);
  else d.setMonth(0, 1);
  return d.toISOString().slice(0, 10);
}

// Admin dashboard header: period filter, KPI tiles and the pipeline bar,
// all from GET /admin/stats (the raw-SQL endpoint).
export function StatsOverview() {
  const [period, setPeriod] = useState<Period>('all');
  const [since, setSince] = useState<string | null>(null);
  const { data: stats, error, loading, reload } = useApi<AdminStats>(since ? `/admin/stats?since=${since}` : '/admin/stats');

  const c = stats?.countsByStatus;
  const decided = c ? c.APPROVED + c.REJECTED : 0;
  const approvalRate = c && decided > 0 ? `${Math.round((c.APPROVED / decided) * 100)}% approval rate` : 'No decisions yet';

  return (
    <section aria-labelledby="overview-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="overview-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Overview
        </h2>
        {/* Period filter: one row above the figures it controls */}
        <div role="group" aria-label="Period" className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-sm">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => {
                setPeriod(p.key);
                setSince(sinceFor(p.key));
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${period === p.key ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Alert tone="error" title="We couldn't load the stats">
          <p>{error.message}</p>
          <Button variant="secondary" className="mt-3" onClick={reload}>
            Try again
          </Button>
        </Alert>
      )}

      {!c && loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true" aria-label="Loading stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-card bg-line/40" />
          ))}
        </div>
      ) : c ? (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Awaiting review" value={String(c.SUBMITTED)} note="Submitted, not yet picked up" dot={PIPELINE_COLORS.SUBMITTED} testId="stat-awaiting" />
            <StatTile label="Under review" value={String(c.UNDER_REVIEW)} note="Being assessed now" dot={PIPELINE_COLORS.UNDER_REVIEW} testId="stat-review" />
            <StatTile label="Approved" value={String(c.APPROVED)} note={approvalRate} dot={PIPELINE_COLORS.APPROVED} testId="stat-approved" />
            <StatTile
              label="Total approved"
              value={formatCentsCompact(stats.totalApprovedAmountCents)}
              note={
                stats.totalApprovedAmountCents >= 10_000_000
                  ? `${formatCentsWhole(stats.totalApprovedAmountCents)} across ${c.APPROVED} loans`
                  : `Across ${c.APPROVED} approved ${c.APPROVED === 1 ? 'loan' : 'loans'}`
              }
              testId="stat-total"
            />
          </dl>

          <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h3 className="text-sm font-semibold text-ink">Application pipeline</h3>
              <p className="text-xs text-muted" data-testid="drafts-note">
                {c.DRAFT} {c.DRAFT === 1 ? 'draft' : 'drafts'} in progress (not yet submitted)
              </p>
            </div>
            <PipelineBar counts={c} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Stat tile: label · value · note. Big values use proportional figures
// (tabular digits are for aligned columns); colour only on the small dot.
function StatTile({ label, value, note, dot, testId }: { label: string; value: string; note: string; dot?: string; testId: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <dt className="flex items-center gap-2 text-sm text-muted">
        {dot && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight text-ink" data-testid={testId}>
        {value}
      </dd>
      <dd className="mt-1 text-xs text-subtle">{note}</dd>
    </div>
  );
}
