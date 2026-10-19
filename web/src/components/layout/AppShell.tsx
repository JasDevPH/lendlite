import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';

// Frame for every logged-in page: header, centred content column, footer.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-subtle sm:flex-row sm:justify-between sm:px-6">
          <p>© LendLite — a portfolio project, not a real lender.</p>
          <p>Amounts in AUD. Rates shown per annum.</p>
        </div>
      </footer>
    </div>
  );
}
