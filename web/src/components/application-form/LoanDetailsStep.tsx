'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api';
import type { LoanApplication } from '@/lib/types';
import { toFieldErrors } from '@/lib/validation/auth';
import {
  centsToInput,
  LOAN_DETAILS_API_FIELDS,
  loanDetailsSchema,
  PURPOSE_OPTIONS,
  termOptions,
  type LoanDetailsValues,
} from '@/lib/validation/application';
import { StepActions } from './StepActions';

interface Props {
  // Existing draft (editing) — or undefined for a brand-new application
  application?: LoanApplication;
  // Pre-fill from the calculator link (?amount=&term=)
  prefill?: { amountCents?: number; termMonths?: number };
  onSaved: (application: LoanApplication) => void;
}

function initialValues(application?: LoanApplication, prefill?: Props['prefill']): LoanDetailsValues {
  const amountCents = application?.amountCents ?? prefill?.amountCents;
  const purpose = application?.purpose ?? '';
  const isPreset = (PURPOSE_OPTIONS as readonly string[]).includes(purpose);
  return {
    amount: centsToInput(amountCents),
    termMonths: String(application?.termMonths ?? prefill?.termMonths ?? ''),
    purposeChoice: purpose ? (isPreset ? purpose : 'Other') : '',
    purposeOther: purpose && !isPreset ? purpose : '',
  };
}

// Step 1: how much, how long, what for. Saving creates the DRAFT (POST) the
// first time, then updates it (PATCH) — so progress is never lost.
export function LoanDetailsStep({ application, prefill, onSaved }: Props) {
  const [values, setValues] = useState<LoanDetailsValues>(() => initialValues(application, prefill));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(field: keyof LoanDetailsValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field]: '' }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = loanDetailsSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }

    setSaving(true);
    try {
      const saved = application
        ? await api.patch<LoanApplication>(`/applications/${application.id}`, parsed.data)
        : await api.post<LoanApplication>('/applications', parsed.data);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        // Map API field names (amountCents) onto form fields (amount)
        const mapped: Record<string, string> = {};
        for (const [field, message] of Object.entries(err.fieldErrors())) {
          mapped[LOAN_DETAILS_API_FIELDS[field] ?? field] = message;
        }
        setFieldErrors(mapped);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Loan details</h2>
        <p className="mt-1 text-sm text-muted">Tell us how much you&apos;d like to borrow and what it&apos;s for.</p>
      </div>

      {formError && <Alert tone="error">{formError}</Alert>}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Loan amount"
          leading="$"
          inputMode="decimal"
          placeholder="15,000"
          value={values.amount}
          // The "$" prefix is already shown, so drop any typed/pasted "$"
          onChange={(e) => update('amount', e.target.value.replace(/\$/g, ''))}
          error={fieldErrors.amount}
          hint="Between $2,000 and $50,000"
        />
        <SelectField
          label="Loan term"
          placeholder="Choose a term"
          options={termOptions(Number(values.termMonths) || undefined)}
          value={values.termMonths}
          onChange={(e) => update('termMonths', e.target.value)}
          error={fieldErrors.termMonths}
        />
      </div>

      <SelectField
        label="What is the loan for?"
        placeholder="Choose a purpose"
        options={PURPOSE_OPTIONS.map((p) => ({ value: p, label: p }))}
        value={values.purposeChoice}
        onChange={(e) => update('purposeChoice', e.target.value)}
        error={fieldErrors.purposeChoice}
      />
      {values.purposeChoice === 'Other' && (
        <TextField
          label="Describe the purpose"
          placeholder="e.g. Solar panels"
          maxLength={200}
          value={values.purposeOther}
          onChange={(e) => update('purposeOther', e.target.value)}
          error={fieldErrors.purposeOther}
        />
      )}

      <StepActions saving={saving} note={application ? 'Changes are saved to your draft.' : "We'll save this as a draft you can come back to."} />
    </form>
  );
}
