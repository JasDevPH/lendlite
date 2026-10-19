import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { LoanCalculator } from '@/components/calculator/LoanCalculator';

// Public landing page: hero + live repayment calculator + how it works.
// A server component; only the calculator is a client component.

const facts = [
  { label: 'Borrow', value: '$2,000 – $50,000' },
  { label: 'Terms', value: '6 – 60 months' },
  { label: 'Rates from', value: '5.00% p.a.' },
];

const steps = [
  { title: 'Apply in minutes', body: 'Tell us about the loan and your income. Save and come back any time.' },
  { title: 'Upload documents', body: 'Add your ID and a recent payslip securely — PDF, JPG or PNG.' },
  { title: 'Track your decision', body: 'See your status live, and your full repayment schedule once approved.' },
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        {/* Soft brand glow behind the content */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 right-0 h-128 w-128 rounded-full bg-brand-600/30 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-6">
          <header className="flex items-center justify-between py-6">
            <Logo tone="light" />
            <nav className="flex items-center gap-3 text-sm font-medium">
              <Link href="/login" className="rounded-lg px-3 py-2 text-white/80 transition hover:text-white">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-white px-4 py-2 text-navy-950 shadow-sm transition hover:bg-brand-50"
              >
                Get started
              </Link>
            </nav>
          </header>

          <div className="grid items-center gap-12 pb-20 pt-10 lg:grid-cols-2 lg:pb-28 lg:pt-16">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Australian personal loans
              </p>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Personal loans,
                <br />
                <span className="text-brand-300">decided fast.</span>
              </h1>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">
                Apply online, upload your documents and follow every step of your application — no paperwork, no
                guesswork.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-raised transition hover:bg-brand-400"
                >
                  Start your application
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  I already have an account
                </Link>
              </div>

              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt className="text-xs uppercase tracking-wide text-white/50">{fact.label}</dt>
                    <dd className="money mt-1 text-sm font-semibold text-white">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Live calculator (client component; quotes come from POST /calculator/quote) */}
            <LoanCalculator />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-card border border-line bg-surface p-6 shadow-card">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700">
                {index + 1}
              </span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
