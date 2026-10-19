'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordField, TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/api';
import { homeFor } from '@/lib/redirects';
import { PASSWORD_RULES, registerSchema, toFieldErrors, type RegisterValues } from '@/lib/validation/auth';
import { useAuth } from './AuthProvider';

export function RegisterForm() {
  const { register, status, user } = useAuth();
  const router = useRouter();

  const [values, setValues] = useState<RegisterValues>({ fullName: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const shouldReset = useRef(false);

  // After a successful sign-up, clear the form (incl. password) when Next
  // hides this page, so it isn't kept in the DOM. See LoginForm for details.
  useLayoutEffect(() => {
    return () => {
      if (!shouldReset.current) return;
      shouldReset.current = false;
      setValues({ fullName: '', email: '', password: '' });
      setFieldErrors({});
      setFormError(null);
      setEmailTaken(false);
      setSubmitting(false);
    };
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && user) router.replace(homeFor(user.role));
  }, [status, user, router]);

  function update(field: keyof RegisterValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field]: '' }));
    if (field === 'email') setEmailTaken(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data);
      shouldReset.current = true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setEmailTaken(true);
      else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') setFieldErrors(err.fieldErrors());
      else setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="error">{formError}</Alert>}

      <TextField
        label="Full name"
        autoComplete="name"
        placeholder="Jo Bloggs"
        value={values.fullName}
        onChange={(e) => update('fullName', e.target.value)}
        error={fieldErrors.fullName}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={values.email}
        onChange={(e) => update('email', e.target.value)}
        error={emailTaken ? 'An account with this email already exists.' : fieldErrors.email}
      />
      {emailTaken && (
        <p className="-mt-3 text-sm">
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Log in instead →
          </Link>
        </p>
      )}
      <PasswordField
        label="Password"
        autoComplete="new-password"
        value={values.password}
        onChange={(e) => update('password', e.target.value)}
        error={fieldErrors.password}
        hint={
          // Live checklist: users see the rules being met as they type
          <ul className="grid gap-1 sm:grid-cols-3">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(values.password);
              return (
                <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${met ? 'text-emerald-600' : 'text-subtle'}`}>
                  <span aria-hidden="true">{met ? '✓' : '○'}</span>
                  {rule.label}
                  <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
                </li>
              );
            })}
          </ul>
        }
      />

      <Button type="submit" size="lg" fullWidth loading={submitting}>
        {submitting ? 'Creating your account…' : 'Create account'}
      </Button>
      <p className="text-center text-xs leading-relaxed text-subtle">
        By creating an account you agree to our (fictional) terms. LendLite is a portfolio project, not a real lender.
      </p>
    </form>
  );
}
