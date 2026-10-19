// Neutral loading placeholder shown while auth is resolving or a redirect is
// in flight — never a flash of the wrong page.
export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-line/70" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-line/50" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-line/40" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-card bg-line/30" />
    </div>
  );
}
