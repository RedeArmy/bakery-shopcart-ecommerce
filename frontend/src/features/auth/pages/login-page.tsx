import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage } from '../../../shared/api';
import { auth, hasAccount, useSession } from '../../../shared/auth';
import { AuthLayout, FormAlert, SubmitButton, fieldError } from '../components/auth-layout';
import { TextField } from '../../../shared/ui/fields';
import { loginSchema } from '../model/schemas';
import type { LoginValues } from '../model/schemas';
import { redirectTarget } from '../model/sign-in-redirect';

/** Texto del error de inicio de sesión; si la cuenta está bloqueada dice hasta cuándo. */
function signInError(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (error instanceof ApiError && error.code === 'ACCOUNT_LOCKED') {
    const until = (error.details as { lockedUntil?: unknown } | undefined)?.lockedUntil;
    if (typeof until === 'string') {
      const time = new Intl.DateTimeFormat('es-GT', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(until),
      );
      return t('auth.lockedUntil', { time });
    }
  }
  return errorMessage(error);
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const arrival: unknown = location.state;
  const target = redirectTarget(arrival);
  // Un invitado tiene sesión pero no cuenta: puede entrar o crear una cuenta desde aquí
  if (hasAccount(session)) return <Navigate to={target} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await auth.login(values.email, values.password);
      void navigate(target, { replace: true });
    } catch (error) {
      setFormError(signInError(error, t));
    }
  });

  return (
    <AuthLayout
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      question={t('auth.noAccount')}
      switchLabel={t('auth.registerTitle')}
      switchTo="/register"
      switchState={arrival}
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          error={fieldError(t, errors.email?.message)}
          {...register('email')}
        />
        <TextField
          label={t('auth.credentialLabel')}
          type="password"
          autoComplete="current-password"
          error={fieldError(t, errors.password?.message)}
          {...register('password')}
        />
        <FormAlert message={formError} />
        <SubmitButton submitting={isSubmitting} label={t('auth.signInSubmit')} />
      </form>
    </AuthLayout>
  );
}
