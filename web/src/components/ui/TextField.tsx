'use client';

import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: ReactNode;
  // Rendered inside the input on the right (e.g. a show/hide button)
  trailing?: ReactNode;
}

// Label + input + hint/error, wired up for screen readers:
// the label is linked via htmlFor, and hint/error via aria-describedby.
export function TextField({ label, error, hint, trailing, className = '', ...inputProps }: TextFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={
            'block w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm transition ' +
            'placeholder:text-subtle focus:outline-none focus:ring-4 ' +
            (error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
              : 'border-line focus:border-brand-500 focus:ring-brand-100') +
            (trailing ? ' pr-12' : '')
          }
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-2">{trailing}</div>}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// Password input with a show/hide toggle (reduces typos on mobile)
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-muted transition hover:bg-canvas hover:text-ink"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}
