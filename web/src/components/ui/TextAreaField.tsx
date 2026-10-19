'use client';

import { useId, type TextareaHTMLAttributes } from 'react';
import { fieldClasses } from './TextField';

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextAreaField({ label, error, hint, className = '', ...props }: TextAreaFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={`${fieldClasses(Boolean(error))} min-h-28 resize-y`} {...props} />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
