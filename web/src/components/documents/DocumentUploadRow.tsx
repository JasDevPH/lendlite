'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { ACCEPT_ATTRIBUTE, checkFile, type DocumentTypeInfo } from '@/lib/documents';
import type { LoanDocument } from '@/lib/types';
import { DocumentFileItem } from './DocumentFileItem';

interface Props {
  applicationId: string;
  info: DocumentTypeInfo;
  documents: LoanDocument[]; // already uploaded for this type
  onUploaded: (document: LoanDocument) => void;
}

// Friendly messages for the API's upload error codes
function uploadErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Upload failed. Please try again.';
  switch (err.code) {
    case 'FILE_TOO_LARGE':
      return 'This file is larger than 5 MB.';
    case 'INVALID_FILE_TYPE':
      return "This file isn't a valid PDF, JPG or PNG.";
    case 'APPLICATION_NOT_EDITABLE':
      return 'This application has been submitted, so documents can no longer be added.';
    default:
      return err.message;
  }
}

// One document type (e.g. "Photo ID"): description, uploaded files, and an
// upload button that also accepts drag-and-drop.
export function DocumentUploadRow({ applicationId, info, documents, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const done = documents.length > 0;

  async function upload(file: File) {
    setError(null);
    const problem = checkFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    const form = new FormData();
    form.append('type', info.type);
    form.append('file', file);

    setUploading(true);
    try {
      onUploaded(await api.upload<LoanDocument>(`/applications/${applicationId}/documents`, form));
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
      // Reset so choosing the same file again still triggers onChange
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !uploading) void upload(file);
  }

  return (
    <section
      aria-labelledby={`doc-${info.type}-title`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`rounded-xl border-2 border-dashed p-4 transition sm:p-5 ${
        dragOver ? 'border-brand-400 bg-brand-50/60' : done ? 'border-emerald-200 bg-emerald-50/30' : 'border-line'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 id={`doc-${info.type}-title`} className="text-sm font-semibold text-ink">
              {info.title}
            </h3>
            {done ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">✓ Uploaded</span>
            ) : info.required ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Required</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Optional</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{info.description}</p>
        </div>

        <div className="shrink-0">
          {/* Visually hidden input; the button below opens it (keyboard + screen reader friendly) */}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            data-testid={`file-input-${info.type}`}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-canvas disabled:opacity-60"
          >
            {uploading ? <Spinner /> : <span aria-hidden="true">↑</span>}
            {uploading ? 'Uploading…' : done ? 'Add another' : `Upload ${info.title.toLowerCase()}`}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {error}
        </p>
      )}

      {documents.length > 0 && (
        <ul className="mt-4 space-y-2">
          {documents.map((doc) => (
            <DocumentFileItem key={doc.id} document={doc} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-subtle">PDF, JPG or PNG, up to 5 MB. You can also drag a file here.</p>
    </section>
  );
}
