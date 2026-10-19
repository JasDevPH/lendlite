import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

// Phase 8.1 placeholder landing page: proves the design tokens, fonts and
// layout. The live loan calculator replaces the example card in Phase 9.

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

            {/* Example quote card (static for now; becomes the live calculator in Phase 9) */}
            <div className="rounded-card bg-surface p-6 text-ink shadow-raised sm:p-8">
              <p className="text-sm font-medium text-muted">Example repayment</p>
              <p className="money mt-2 text-4xl font-semibold tracking-tight">
                $888.49<span className="text-base font-medium text-muted"> / month</span>
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl bg-canvas p-4 text-sm">
                <div>
                  <p className="text-muted">Loan amount</p>
                  <p className="money mt-1 font-semibold">$10,000</p>
                </div>
                <div>
                  <p className="text-muted">Term</p>
                  <p className="money mt-1 font-semibold">12 months</p>
                </div>
                <div>
                  <p className="text-muted">Rate</p>
                  <p className="money mt-1 font-semibold">12.00% p.a.</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
                <span className="text-muted">Total interest</span>
                <span className="money font-semibold text-emerald-600">$661.86</span>
              </div>
              <p className="mt-6 text-xs leading-relaxed text-subtle">
                Illustrative only. Your rate is set when your application is approved.
              </p>
            </div>
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
