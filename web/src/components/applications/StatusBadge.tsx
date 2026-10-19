import { STATUS_META } from '@/lib/status';
import type { ApplicationStatus } from '@/lib/types';

// Colour + dot + TEXT label: status is never conveyed by colour alone (accessibility)
export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
