'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button, buttonClasses } from '@/components/ui/Button';
import { LOAN_LIMITS as L } from '@/lib/loanRules';
import type { LoanApplicationDetail } from '@/lib/types';
import { useApi } from '@/lib/useApi';
import { LoanDetailsStep } from './LoanDetailsStep';
import { Stepper, type StepDefinition } from './Stepper';

// Spec: 1) Loan details 2) Employment & income 3) Documents 4) Review & submit
export const STEPS = [
  { key: 'details', label: 'Loan details' },
  { key: 'employment', label: 'Employment & income' },
  { key: 'documents', label: 'Documents' },
  { key: 'review', label: 'Review & submit' },
] as const satisfies readonly StepDefinition[];

type StepKey = (typeof STEPS)[number]['key'];

function isStepKey(value: string | null): value is StepKey {
  return STEPS.some((s) => s.key === value);
}

// Read an integer query param only if it's within the allowed range (never trust URLs)
function intParam(value: string | null, min: number, max: number): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

// The whole flow lives at /applications/new. The URL is the source of truth:
//   ?draft=<id>&step=employment
// so refreshing, the back button, or "Continue application" from the dashboard
// all land on the right step of the right draft.
export function ApplicationWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draft');
  const stepParam = searchParams.get('step');
  // No draft yet → only step 1 makes sense
  const step: StepKey = draftId && isStepKey(stepParam) ? stepParam : 'details';
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const { data: application, error, loading, reload } = useApi<LoanApplicationDetail>(draftId ? `/applications/${draftId}` : null);

  function goTo(nextStep: StepKey, id = draftId) {
    // push (not replace): the browser Back button moves between steps
    router.push(`/applications/new?draft=${id}&step=${nextStep}`);
  }

  const prefill = {
    amountCents: intParam(searchParams.get('amount'), L.minAmountCents, L.maxAmountCents),
    termMonths: intParam(searchParams.get('term'), L.minTermMonths, L.maxTermMonths),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title={draftId ? 'Continue your application' : 'Apply for a personal loan'}
        description="Four short steps. Your progress is saved as you go."
      />

      <Stepper steps={STEPS} currentIndex={stepIndex} />

      <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
        {draftId && loading && !application ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading your application">
            <div className="h-6 w-40 animate-pulse rounded bg-line/70" />
            <div className="h-11 animate-pulse rounded-xl bg-line/50" />
            <div className="h-11 animate-pulse rounded-xl bg-line/50" />
          </div>
        ) : error ? (
          <Alert tone="error" title={error.status === 404 ? 'Application not found' : "We couldn't load your application"}>
            <p>{error.status === 404 ? "This application doesn't exist or isn't yours." : error.message}</p>
            <div className="mt-3 flex gap-2">
              {error.status !== 404 && (
                <Button variant="secondary" onClick={reload}>
                  Try again
                </Button>
              )}
              <Link href="/dashboard" className={buttonClasses({ variant: 'secondary' })}>
                Back to dashboard
              </Link>
            </div>
          </Alert>
        ) : application && application.status !== 'DRAFT' ? (
          // Only drafts can be edited (the API enforces this too: 409)
          <Alert tone="info" title="This application has already been submitted">
            <p>Submitted applications can&apos;t be changed.</p>
            <Link href={`/applications/${application.id}`} className={`${buttonClasses({ variant: 'secondary' })} mt-3`}>
              View application
            </Link>
          </Alert>
        ) : step === 'details' ? (
          <LoanDetailsStep
            // New key per draft: a fresh form when starting another application
            key={application?.id ?? 'new'}
            application={application}
            prefill={prefill}
            onSaved={(saved) => {
              if (draftId) reload(); // keep the loaded copy in sync for later steps
              goTo('employment', saved.id);
            }}
          />
        ) : (
          <ComingNextStep label={STEPS[stepIndex]!.label} onBack={() => goTo(STEPS[stepIndex - 1]!.key)} />
        )}
      </div>
    </div>
  );
}

// TEMPORARY: steps 2–4 are built one at a time next (spec: one component at a time)
function ComingNextStep({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">{label}</h2>
        <p className="mt-1 text-sm text-muted">This step is being built next. Your loan details have been saved as a draft.</p>
      </div>
      <div className="flex gap-3 border-t border-line pt-6">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Link href="/dashboard" className={buttonClasses({ variant: 'ghost' })}>
          Save &amp; exit
        </Link>
      </div>
    </div>
  );
}
