import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
  secondary: 'border border-line bg-surface text-ink shadow-sm hover:bg-canvas',
  ghost: 'text-muted hover:bg-canvas hover:text-ink',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
};

const sizes: Record<Size, string> = {
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-sm',
};

// Same classes for <Link>s that should look like buttons
export function buttonClasses({ variant = 'primary', size = 'md', fullWidth = false } = {} as {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({ variant, size, fullWidth, loading = false, disabled, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      // Disabled while loading: stops double-submits (e.g. two registrations)
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClasses({ variant, size, fullWidth })} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
