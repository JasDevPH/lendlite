'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { api, ApiError } from '@/lib/api';
import type { LoanApplication } from '@/lib/types';

const MIN = 10; // spec: rejection reason ≥ 10 characters (after trimming)
const MAX = 1000;

interface Props {
  application: LoanApplication;
  open: boolean;
  onClose: () => void;
  onDecided: () => void;
}

export function RejectDialog({ application, open, onClose, onDecided }: Props) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = reason.trim().length;
  const reasonError = length < MIN ? `Give a reason of at least ${MIN} characters` : length > MAX ? `Keep it under ${MAX} characters` : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (reasonError) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post<LoanApplication>(`/admin/applications/${application.id}/reject`, { reason: reason.trim() });
      onDecided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 409) onDecided();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Decline application" description="The customer will see this reason on their application, so keep it clear and respectful.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <TextAreaField
          label="Reason for declining"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={MAX}
          placeholder="e.g. Monthly commitments would be too high relative to income."
          error={touched ? (reasonError ?? undefined) : undefined}
          hint={`${length}/${MAX} characters (minimum ${MIN})`}
          autoFocus
        />

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={submitting}>
            {submitting ? 'Declining…' : 'Decline application'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
