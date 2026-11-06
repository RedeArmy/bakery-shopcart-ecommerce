import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/ui/button';

/** Marco común de iniciar sesión y crear cuenta: título, formulario y el enlace a la otra pantalla. */
export function AuthLayout({
  title,
  subtitle,
  question,
  switchLabel,
  switchTo,
  switchState,
  children,
}: Readonly<{
  title: string;
  subtitle: string;
  question: string;
  switchLabel: string;
  switchTo: string;
  switchState: unknown;
  children: ReactNode;
}>) {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{title}</h1>
        <p className="mt-2 text-stone-600">{subtitle}</p>
      </header>
      {children}
      <p className="text-sm text-stone-600">
        {question}{' '}
        <Link to={switchTo} state={switchState} className="text-accent hover:underline">
          {switchLabel}
        </Link>
      </p>
    </div>
  );
}

/** Error del formulario entero (el del servidor), anunciado a los lectores de pantalla. */
export function FormAlert({ message }: Readonly<{ message: string | null }>) {
  if (message === null) return null;
  return (
    <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
      {message}
    </p>
  );
}

/** Botón de enviar que se bloquea mientras la petición sigue en curso. */
export function SubmitButton({
  submitting,
  label,
}: Readonly<{ submitting: boolean; label: string }>) {
  const { t } = useTranslation();
  return (
    <Button type="submit" loading={submitting} className="w-full">
      {submitting ? t('auth.submitting') : label}
    </Button>
  );
}

/** Traduce el mensaje (una clave de i18n) que dejó el esquema de zod, si lo hay. */
export function fieldError(
  t: (key: string) => string,
  message: string | undefined,
): string | undefined {
  return message === undefined ? undefined : t(message);
}
