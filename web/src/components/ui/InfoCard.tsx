import type { ReactNode } from 'react';

// Titled panel used on the detail pages (customer + admin)
export function InfoCard({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

// Label/value row inside a <dl>
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="money text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
