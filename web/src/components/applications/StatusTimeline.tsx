import { formatDate } from '@/lib/format';
import type { LoanApplication } from '@/lib/types';

interface TimelineStep {
  label: string;
  description: string;
  date?: string | null;
  state: 'done' | 'current' | 'upcoming' | 'declined';
}

// Builds the customer-facing timeline from the application's status + dates.
// (The detailed audit trail is admin-only; customers see the milestones.)
function buildSteps(app: LoanApplication): TimelineStep[] {
  const order = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DECIDED'] as const;
  const position = app.status === 'APPROVED' || app.status === 'REJECTED' ? 3 : order.indexOf(app.status);
  const stateFor = (index: number): TimelineStep['state'] => (index < position ? 'done' : index === position ? 'current' : 'upcoming');

  const decision: TimelineStep =
    app.status === 'APPROVED'
      ? { label: 'Approved', description: 'Your loan has been approved and your repayment schedule is ready.', date: app.decidedAt, state: 'done' }
      : app.status === 'REJECTED'
        ? { label: 'Declined', description: 'Your application was not approved.', date: app.decidedAt, state: 'declined' }
        : { label: 'Decision', description: "We'll let you know the outcome here.", state: 'upcoming' };

  return [
    { label: 'Application started', description: 'Draft saved.', date: app.createdAt, state: app.status === 'DRAFT' ? 'current' : 'done' },
    { label: 'Submitted', description: 'Your application and documents were received.', date: app.submittedAt, state: stateFor(1) },
    {
      label: 'Under review',
      description: 'A lending specialist is assessing your application.',
      // Reaching a decision means review happened, even if we don't show its exact time
      state: position > 2 ? 'done' : stateFor(2),
    },
    decision,
  ];
}

const DOT: Record<TimelineStep['state'], string> = {
  done: 'bg-brand-600 text-white',
  current: 'border-2 border-brand-600 bg-surface',
  upcoming: 'border-2 border-line bg-surface',
  declined: 'bg-rose-600 text-white',
};

export function StatusTimeline({ application }: { application: LoanApplication }) {
  const steps = buildSteps(application);

  return (
    <ol className="relative space-y-6" aria-label="Application progress">
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex gap-4" aria-current={step.state === 'current' ? 'step' : undefined}>
          {/* Connector line to the next step */}
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute left-[11px] top-7 h-[calc(100%+0.5rem)] w-0.5 ${step.state === 'done' ? 'bg-brand-600' : 'bg-line'}`}
            />
          )}
          <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${DOT[step.state]}`} aria-hidden="true">
            {step.state === 'done' ? '✓' : step.state === 'declined' ? '✕' : step.state === 'current' ? <span className="h-2 w-2 rounded-full bg-brand-600" /> : null}
          </span>
          <div className="min-w-0 pb-1">
            <p className={`text-sm font-semibold ${step.state === 'upcoming' ? 'text-subtle' : step.state === 'declined' ? 'text-rose-700' : 'text-ink'}`}>
              {step.label}
              <span className="sr-only"> — {step.state === 'done' ? 'completed' : step.state === 'current' ? 'current step' : step.state === 'declined' ? 'declined' : 'not yet'}</span>
            </p>
            <p className="mt-0.5 text-sm text-muted">{step.description}</p>
            {step.date && <p className="mt-0.5 text-xs text-subtle">{formatDate(step.date)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
