// Wordmark + simple geometric mark (an upward step, suggesting progress/approval).
// Inline SVG: crisp at any size, no extra request, colour via props.
export function Logo({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const text = tone === 'light' ? 'text-white' : 'text-ink';

  return (
    <span className="inline-flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="8" className="fill-brand-600" />
        <path d="M8 19h4v-4h4v-4h4" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${text}`}>
        Lend<span className="text-brand-500">Lite</span>
      </span>
    </span>
  );
}
