'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordField, TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/api';
import { homeFor, safeNextPath } from '@/lib/redirects';
import { loginSchema, toFieldErrors, type LoginValues } from '@/lib/validation/auth';
import { useAuth } from './AuthProvider';

export function LoginForm() {
  const { login, status, user } = useAuth();
  const router = useRouter();

  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One place for "where to go once logged in": covers a fresh login AND
  // someone who opens /login while already signed in.
  // ?next= is read here (browser only) rather than with useSearchParams, which
  // would force a Suspense boundary and keep the form out of the static HTML.
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));
    router.replace(next ?? homeFor(user.role));
  }, [status, user, router]);

  function update(field: keyof LoginValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field]: '' })); // clear that field's error as they type
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      // Redirect happens in the effect above once status becomes 'authenticated'
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') setFieldErrors(err.fieldErrors());
      else if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') setFormError('Incorrect email or password.');
      else setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    // noValidate: show our consistent messages instead of the browser's popups
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="error">{formError}</Alert>}

      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={values.email}
        onChange={(e) => update('email', e.target.value)}
        error={fieldErrors.email}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        value={values.password}
        onChange={(e) => update('password', e.target.value)}
        error={fieldErrors.password}
      />

      <Button type="submit" size="lg" fullWidth loading={submitting}>
        {submitting ? 'Signing in…' : 'Log in'}
      </Button>

      <Alert tone="info" title="Demo accounts">
        <p className="money">customer@lendlite.dev · Customer1234</p>
        <p className="money">admin@lendlite.dev · Admin1234</p>
      </Alert>
    </form>
  );
}
