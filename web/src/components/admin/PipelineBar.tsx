'use client';

import { useState } from 'react';
import { PIPELINE_COLORS, PIPELINE_STATUSES, STATUS_META } from '@/lib/status';
import type { ApplicationStatus } from '@/lib/types';

type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

// Whole-number percentages that always add up to exactly 100 (largest-remainder
// method). Rounding each share separately can show e.g. 38+13+38+13 = 102%.
function sharesOf(counts: Record<PipelineStatus, number>, total: number): Record<PipelineStatus, number> {
  const result = { SUBMITTED: 0, UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0 };
  if (total === 0) return result;
  const exact = PIPELINE_STATUSES.map((s) => ({ s, value: (counts[s] / total) * 100 }));
  for (const { s, value } of exact) result[s] = Math.floor(value);
  let leftover = 100 - exact.reduce((sum, { s }) => sum + result[s], 0);
  // Give the remaining points to the largest fractional parts
  for (const { s } of [...exact].sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (leftover-- <= 0) break;
    result[s] += 1;
  }
  return result;
}

// Part-to-whole of the review pipeline as one horizontal stacked bar.
// Dataviz rules applied: thin bar (16px), 2px surface gaps between segments,
// rounded only at the two outer ends, a legend that always shows label +
// count + % (identity never by colour alone; doubles as the table view),
// and a hover/focus tooltip on each segment.
export function PipelineBar({ counts }: { counts: Record<ApplicationStatus, number> }) {
  const [active, setActive] = useState<PipelineStatus | null>(null);
  const total = PIPELINE_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const visible = PIPELINE_STATUSES.filter((s) => counts[s] > 0);
  const shares = sharesOf(counts, total);

  return (
    <div>
      {total === 0 ? (
        <div className="h-4 rounded bg-line/60" aria-hidden="true" />
      ) : (
        // gap-0.5 + surface background = the 2px separating gap
        <div className="relative flex h-4 gap-0.5 bg-surface" role="list" aria-label="Applications by status">
          {visible.map((status, index) => {
            const share = shares[status];
            return (
              <div
                key={status}
                role="listitem"
                tabIndex={0}
                aria-label={`${STATUS_META[status].label}: ${counts[status]} (${share}%)`}
                onPointerEnter={() => setActive(status)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(status)}
                onBlur={() => setActive(null)}
                // Hit area is the full segment height plus padding (bigger than the bar)
                className={`relative -my-2 cursor-default py-2 outline-offset-2 ${index === 0 ? 'rounded-l' : ''} ${index === visible.length - 1 ? 'rounded-r' : ''}`}
                style={{ flexGrow: counts[status], flexBasis: 0, minWidth: 6 }}
              >
                <div
                  className={`h-4 ${index === 0 ? 'rounded-l' : ''} ${index === visible.length - 1 ? 'rounded-r' : ''} ${active && active !== status ? 'opacity-40' : ''} transition-opacity`}
                  style={{ backgroundColor: PIPELINE_COLORS[status] }}
                />
                {active === status && (
                  <div role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-navy-950 px-3 py-2 text-xs text-white shadow-raised">
                    {/* Value leads, label follows */}
                    <span className="font-semibold">{counts[status]}</span> {STATUS_META[status].label.toLowerCase()} · {share}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend = identity + exact values (text in ink tokens, colour only on the swatch) */}
      <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {PIPELINE_STATUSES.map((status) => (
          <li key={status} className="flex items-start gap-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIPELINE_COLORS[status] }} aria-hidden="true" />
            <div>
              <p className="text-xs text-muted">{STATUS_META[status].label}</p>
              <p className="text-sm font-semibold text-ink" data-testid={`pipeline-${status}`}>
                {counts[status]} <span className="font-normal text-subtle">· {shares[status]}%</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
