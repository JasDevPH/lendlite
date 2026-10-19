'use client';

import { useState } from 'react';
import { DocumentUploadRow } from '@/components/documents/DocumentUploadRow';
import { Button } from '@/components/ui/Button';
import { DOCUMENT_TYPES } from '@/lib/documents';
import type { LoanApplicationDetail, LoanDocument } from '@/lib/types';

interface Props {
  application: LoanApplicationDetail;
  onBack: () => void;
  onContinue: () => void;
  onChanged: () => void; // refresh the wizard's copy of the application
}

// Step 3: upload ID + payslip (required) and optionally a bank statement.
// Files upload immediately (each is saved on the server right away).
export function DocumentsStep({ application, onBack, onContinue, onChanged }: Props) {
  // Start from the server's list; append uploads as they succeed
  const [documents, setDocuments] = useState<LoanDocument[]>(application.documents);

  const missingRequired = DOCUMENT_TYPES.filter((t) => t.required && !documents.some((d) => d.type === t.type));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Documents</h2>
        <p className="mt-1 text-sm text-muted">We need a photo ID and a recent payslip. Your files are only visible to you and our lending team.</p>
      </div>

      <div className="space-y-4">
        {DOCUMENT_TYPES.map((info) => (
          <DocumentUploadRow
            key={info.type}
            applicationId={application.id}
            info={info}
            documents={documents.filter((d) => d.type === info.type)}
            onUploaded={(doc) => {
              setDocuments((current) => [...current, doc]);
              onChanged();
            }}
          />
        ))}
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button type="button" variant="secondary" onClick={onBack}>
            ← Back
          </Button>
          {/* aria-live: the remaining list is announced as it changes */}
          <p className="text-xs text-subtle" aria-live="polite">
            {missingRequired.length > 0 ? `Still needed: ${missingRequired.map((t) => t.title).join(' and ')}` : 'All required documents uploaded.'}
          </p>
        </div>
        <Button type="button" size="lg" onClick={onContinue} disabled={missingRequired.length > 0}>
          Continue to review
        </Button>
      </div>
    </div>
  );
}
