// Display formatting. The API always sends raw integers (cents, basis points)
// and ISO dates; turning them into human text happens only here, in the UI.

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const audWhole = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

// 123456 → "$1,234.56"
export function formatCents(cents: number): string {
  return aud.format(cents / 100);
}

// 1500000 → "$15,000" (for headline amounts where cents are noise)
export function formatCentsWhole(cents: number): string {
  return audWhole.format(cents / 100);
}

// 1250 → "12.50% p.a."
export function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2)}% p.a.`;
}

// "2026-11-19T00:00:00.000Z" → "19 Nov 2026"
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

// → "19 Nov 2026, 3:42 pm"
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

// "$15,000.50" / "15000.5" typed by a user → 1500050 cents (null if invalid).
// String-based, so no floating-point multiplication errors.
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [dollars = '0', cents = ''] = cleaned.split('.');
  return Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
}

// 1536 → "1.5 KB", 2_400_000 → "2.3 MB"
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 24 → "24 months", 1 → "1 month"
export function formatMonths(months: number): string {
  return `${months} ${months === 1 ? 'month' : 'months'}`;
}
