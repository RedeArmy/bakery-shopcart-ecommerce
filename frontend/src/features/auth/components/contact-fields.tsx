import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../../shared/ui/fields';
import { fieldError } from './auth-layout';

interface ContactValues {
  fullName: string;
  email: string;
  phone: string;
}

/**
 * Nombre, correo y teléfono: los tres campos que comparten el registro y los datos de contacto del invitado. Cada
 * formulario aporta su `register` y sus errores; los nombres de campo son los mismos en los dos.
 */
export function ContactFields<T extends FieldValues & ContactValues>({
  register,
  errors,
}: Readonly<{ register: UseFormRegister<T>; errors: FieldErrors<T> }>) {
  const { t } = useTranslation();
  // Los campos son las tres claves de ContactValues: el formulario concreto puede tener más, aquí solo se leen estas
  const fields = register as unknown as UseFormRegister<ContactValues>;
  const problems = errors as FieldErrors<ContactValues>;
  return (
    <>
      <TextField
        label={t('auth.fullName')}
        autoComplete="name"
        error={fieldError(t, problems.fullName?.message)}
        {...fields('fullName')}
      />
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        error={fieldError(t, problems.email?.message)}
        {...fields('email')}
      />
      <TextField
        label={t('auth.phone')}
        optionalLabel={t('common.optional')}
        type="tel"
        autoComplete="tel"
        error={fieldError(t, problems.phone?.message)}
        {...fields('phone')}
      />
    </>
  );
}
