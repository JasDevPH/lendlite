'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api';
import { formatCentsWhole, parseDollarsToCents } from '@/lib/format';
import type { LoanApplication } from '@/lib/types';
import { toFieldErrors } from '@/lib/validation/auth';
import {
  centsToInput,
  EMPLOYMENT_API_FIELDS,
  EMPLOYMENT_OPTIONS,
  employmentSchema,
  type EmploymentValues,
} from '@/lib/validation/application';
import { StepActions } from './StepActions';

interface Props {
  application: LoanApplication;
  onBack: () => void;
  onSaved: (application: LoanApplication) => void;
}

// Step 2: employment status, employer, income and expenses → PATCH the draft
export function EmploymentStep({ application, onBack, onSaved }: Props) {
  const [values, setValues] = useState<EmploymentValues>(() => ({
    employmentType: application.employmentType ?? '',
    employerName: application.employerName ?? '',
    annualIncome: centsToInput(application.annualIncomeCents),
    monthlyExpenses: centsToInput(application.monthlyExpensesCents),
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(field: keyof EmploymentValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field]: '' }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = employmentSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }

    setSaving(true);
    try {
      onSaved(await api.patch<LoanApplication>(`/applications/${application.id}`, parsed.data));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const mapped: Record<string, string> = {};
        for (const [field, message] of Object.entries(err.fieldErrors())) mapped[EMPLOYMENT_API_FIELDS[field] ?? field] = message;
        setFieldErrors(mapped);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
      setSaving(false);
    }
  }

  const unemployed = values.employmentType === 'UNEMPLOYED';
  const selfEmployed = values.employmentType === 'SELF_EMPLOYED';

  // Friendly context: show what the yearly figure means per month
  const incomeCents = parseDollarsToCents(values.annualIncome);
  const monthlyIncomeHint = incomeCents !== null && incomeCents > 0 ? `About ${formatCentsWhole(Math.round(incomeCents / 12))} per month before tax` : 'Before tax';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Employment &amp; income</h2>
        <p className="mt-1 text-sm text-muted">This helps us check the repayments are affordable for you.</p>
      </div>

      {formError && <Alert tone="error">{formError}</Alert>}

      <SelectField
        label="Employment status"
        placeholder="Choose your status"
        options={EMPLOYMENT_OPTIONS}
        value={values.employmentType}
        onChange={(e) => update('employmentType', e.target.value)}
        error={fieldErrors.employmentType}
      />

      {/* Only relevant when someone employs you (or you run a business) */}
      {values.employmentType && !unemployed && (
        <TextField
          label={selfEmployed ? 'Business name' : 'Employer name'}
          autoComplete="organization"
          placeholder={selfEmployed ? 'e.g. Smith Plumbing Pty Ltd' : 'e.g. Acme Pty Ltd'}
          maxLength={200}
          value={values.employerName}
          onChange={(e) => update('employerName', e.target.value)}
          error={fieldErrors.employerName}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Annual income"
          leading="$"
          inputMode="decimal"
          placeholder="85,000"
          value={values.annualIncome}
          onChange={(e) => update('annualIncome', e.target.value.replace(/\$/g, ''))}
          error={fieldErrors.annualIncome}
          hint={monthlyIncomeHint}
        />
        <TextField
          label="Monthly expenses"
          leading="$"
          inputMode="decimal"
          placeholder="2,500"
          value={values.monthlyExpenses}
          onChange={(e) => update('monthlyExpenses', e.target.value.replace(/\$/g, ''))}
          error={fieldErrors.monthlyExpenses}
          hint="Rent or mortgage, bills, other loan repayments"
        />
      </div>

      <StepActions onBack={onBack} saving={saving} note="Changes are saved to your draft." />
    </form>
  );
}
