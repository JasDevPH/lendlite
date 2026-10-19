export interface StepDefinition {
  key: string;
  label: string;
}

// Progress indicator for the multi-step form. An ordered list, with the
// current step marked aria-current="step" for screen readers.
export function Stepper({ steps, currentIndex }: { steps: readonly StepDefinition[]; currentIndex: number }) {
  return (
    <nav aria-label="Application progress">
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
          return (
            <li key={step.key} aria-current={state === 'current' ? 'step' : undefined}>
              {/* Progress bar segment */}
              <div className={`h-1.5 rounded-full ${state === 'upcoming' ? 'bg-line' : 'bg-brand-600'}`} />
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    state === 'done'
                      ? 'bg-brand-600 text-white'
                      : state === 'current'
                        ? 'border-2 border-brand-600 text-brand-700'
                        : 'border border-line text-subtle'
                  }`}
                >
                  {state === 'done' ? '✓' : index + 1}
                </span>
                {/* Labels hidden on very small screens; the bar still shows progress */}
                <span className={`hidden text-xs font-medium sm:inline ${state === 'upcoming' ? 'text-subtle' : 'text-ink'}`}>{step.label}</span>
                <span className="sr-only sm:hidden">
                  Step {index + 1}: {step.label} {state === 'done' ? '(completed)' : state === 'current' ? '(current)' : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
