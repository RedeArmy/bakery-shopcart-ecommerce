import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';

const CONTROL =
  'block min-h-11 w-full rounded-control border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 disabled:bg-stone-100 aria-[invalid=true]:border-red-700';

interface FieldChrome {
  label: string;
  /** Texto que explica el campo; deja de verse cuando hay un error */
  hint?: string;
  /** Mensaje ya en español para este campo */
  error?: string;
  /** Etiqueta "opcional" para los campos que no son obligatorios */
  optionalLabel?: string;
}

function Chrome({
  id,
  chrome,
  children,
}: Readonly<{
  id: string;
  chrome: FieldChrome;
  children: React.ReactNode;
}>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-800">
        {chrome.label}
        {chrome.optionalLabel === undefined ? null : (
          <span className="ml-1 font-normal text-stone-500">({chrome.optionalLabel})</span>
        )}
      </label>
      {children}
      {chrome.error === undefined && chrome.hint !== undefined ? (
        <p id={`${id}-hint`} className="text-sm text-stone-600">
          {chrome.hint}
        </p>
      ) : null}
      {chrome.error === undefined ? null : (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          {chrome.error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, chrome: FieldChrome): string | undefined => {
  if (chrome.error !== undefined) return `${id}-error`;
  return chrome.hint === undefined ? undefined : `${id}-hint`;
};

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> &
  FieldChrome & { id?: string };

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optionalLabel, id, className = '', ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const chrome: FieldChrome = {
    label,
    error,
    ...(hint ? { hint } : {}),
    ...(optionalLabel ? { optionalLabel } : {}),
  };
  return (
    <Chrome id={inputId} chrome={chrome}>
      <input
        ref={ref}
        id={inputId}
        className={`${CONTROL} ${className}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(inputId, chrome)}
        {...rest}
      />
    </Chrome>
  );
});

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> &
  FieldChrome & { id?: string };

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, optionalLabel, id, className = '', children, ...rest },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  const chrome: FieldChrome = {
    label,
    error,
    ...(hint ? { hint } : {}),
    ...(optionalLabel ? { optionalLabel } : {}),
  };
  return (
    <Chrome id={selectId} chrome={chrome}>
      <select
        ref={ref}
        id={selectId}
        className={`${CONTROL} ${className}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(selectId, chrome)}
        {...rest}
      >
        {children}
      </select>
    </Chrome>
  );
});

export const CheckboxField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & { label: string; id?: string }
>(function CheckboxField({ label, id, className = '', ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="flex min-h-11 items-center gap-3">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={`size-5 rounded border-stone-300 accent-accent ${className}`}
        {...rest}
      />
      <label htmlFor={inputId} className="text-sm text-stone-800">
        {label}
      </label>
    </div>
  );
});
