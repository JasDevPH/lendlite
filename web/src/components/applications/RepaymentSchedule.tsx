'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCents, formatDate } from '@/lib/format';
import type { Installment } from '@/lib/types';

// Cents → "888.49" for CSV (spreadsheets want plain numbers, not "$888.49")
const toDecimal = (cents: number) => (cents / 100).toFixed(2);

function downloadCsv(schedule: Installment[], fileName: string) {
  const header = ['Installment', 'Due date', 'Payment', 'Principal', 'Interest', 'Balance'];
  const rows = schedule.map((i) => [
    i.installmentNo,
    i.dueDate.slice(0, 10), // ISO date: sorts and imports cleanly
    toDecimal(i.paymentCents),
    toDecimal(i.principalCents),
    toDecimal(i.interestCents),
    toDecimal(i.balanceCents),
  ]);
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The repayment schedule generated at approval: next payment + full table.
export function RepaymentSchedule({ schedule, applicationId }: { schedule: Installment[]; applicationId: string }) {
  const totals = schedule.reduce(
    (t, i) => ({ payment: t.payment + i.paymentCents, principal: t.principal + i.principalCents, interest: t.interest + i.interestCents }),
    { payment: 0, principal: 0, interest: 0 },
  );
  // "Now" captured once when the component mounts. Render must be pure
  // (same input → same output), so Date.now() can't be called on every render.
  const [now] = useState(() => Date.now());
  // The first installment due today or later
  const next = schedule.find((i) => new Date(i.dueDate).getTime() >= now);

  return (
    <div className="space-y-4">
      {next && (
        <div className="flex flex-col gap-1 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="next-payment">
          <p className="text-sm text-brand-900">
            <span className="font-semibold">Next payment</span> · Installment {next.installmentNo} of {schedule.length}
          </p>
          <p className="money text-sm font-semibold text-brand-900">
            {formatCents(next.paymentCents)} due {formatDate(next.dueDate)}
          </p>
        </div>
      )}

      {/* The table scrolls sideways on small screens instead of squashing the numbers */}
      {/* relative: keeps the absolutely-positioned sr-only caption inside the scroll box */}
      <div className="relative overflow-x-auto rounded-xl border border-line">
        <table className="money w-full min-w-160 text-sm">
          <caption className="sr-only">Repayment schedule: {schedule.length} monthly installments</caption>
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">#</th>
              <th scope="col" className="px-4 py-3 font-semibold">Due date</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Payment</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Principal</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Interest</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {schedule.map((i) => (
              <tr key={i.id} className={i.id === next?.id ? 'bg-brand-50/50' : undefined}>
                <td className="px-4 py-2.5 text-muted">{i.installmentNo}</td>
                <td className="px-4 py-2.5">{formatDate(i.dueDate)}</td>
                <td className="px-4 py-2.5 text-right font-medium">{formatCents(i.paymentCents)}</td>
                <td className="px-4 py-2.5 text-right">{formatCents(i.principalCents)}</td>
                <td className="px-4 py-2.5 text-right text-muted">{formatCents(i.interestCents)}</td>
                <td className="px-4 py-2.5 text-right">{formatCents(i.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-line bg-canvas font-semibold">
            <tr>
              <th scope="row" colSpan={2} className="px-4 py-3 text-left">Total</th>
              <td className="px-4 py-3 text-right" data-testid="total-payment">{formatCents(totals.payment)}</td>
              <td className="px-4 py-3 text-right">{formatCents(totals.principal)}</td>
              <td className="px-4 py-3 text-right" data-testid="total-interest">{formatCents(totals.interest)}</td>
              <td className="px-4 py-3 text-right">{formatCents(0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => downloadCsv(schedule, `lendlite-schedule-${applicationId.slice(0, 8)}.csv`)}>
          Download schedule (CSV)
        </Button>
      </div>
    </div>
  );
}
