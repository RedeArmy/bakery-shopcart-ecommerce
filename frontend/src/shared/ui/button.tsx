import type { ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost';

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-xs font-medium uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'border border-stone-300 bg-white text-stone-900 hover:bg-stone-100',
  ghost: 'text-stone-700 hover:bg-stone-100',
};

export const buttonClasses = (variant: Variant = 'primary', className = ''): string =>
  `${BASE} ${VARIANTS[variant]} ${className}`.trim();

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin stroke-current"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Mientras la petición está en curso el botón se deshabilita, para que un doble clic no la repita */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  className,
  ...rest
}: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClasses(variant, className)} {...rest} />;
}
