import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';

const trustPoints = [
  { title: 'Bank-grade security', body: 'Passwords are hashed and every request is authenticated.' },
  { title: 'Clear, upfront numbers', body: 'See your repayment and total interest before you apply.' },
  { title: 'Track every step', body: 'Know exactly where your application is, in real time.' },
];

// Split layout for login/register: brand panel (desktop only) + form card.
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-[1fr_minmax(0,1.1fr)]">
      {/* Brand panel — hidden on small screens so the form comes first */}
      <aside className="relative hidden overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <Link href="/" className="relative w-fit">
          <Logo tone="light" />
        </Link>
        <div className="relative my-auto max-w-sm">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Borrow with confidence.
            <br />
            <span className="text-brand-300">Know where you stand.</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {trustPoints.map((point) => (
              <li key={point.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                    <path d="M7.7 13.3 4.4 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">{point.title}</p>
                  <p className="mt-0.5 text-sm text-white/60">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">© LendLite. A portfolio project — not a real lender.</p>
      </aside>

      {/* Form side */}
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-sm text-muted">{footer}</div>
        </div>
      </main>
    </div>
  );
}
