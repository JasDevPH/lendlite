'use client';

import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import { downloadDocument } from '@/lib/documents';
import { formatBytes, formatDate } from '@/lib/format';
import type { LoanDocument } from '@/lib/types';

// One uploaded file: icon, name, size/date and a "View" (download) button.
// Reused by the application form and the application detail page.
export function DocumentFileItem({ document }: { document: LoanDocument }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onView() {
    setDownloading(true);
    setError(null);
    try {
      await downloadDocument(document.id, document.fileName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[10px] font-bold uppercase text-brand-700" aria-hidden="true">
        {document.mimeType === 'application/pdf' ? 'PDF' : document.mimeType === 'image/png' ? 'PNG' : 'JPG'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{document.fileName}</p>
        <p className="text-xs text-muted">
          {formatBytes(document.sizeBytes)} · Uploaded {formatDate(document.uploadedAt)}
        </p>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
      <button
        type="button"
        onClick={onView}
        disabled={downloading}
        aria-label={`View ${document.fileName}`}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-60"
      >
        {downloading && <Spinner className="h-3 w-3" />}
        View
      </button>
    </li>
  );
}
