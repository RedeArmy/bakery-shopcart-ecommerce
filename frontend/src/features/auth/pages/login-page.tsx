import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage } from '../../../shared/api';
import { auth, useSession } from '../../../shared/auth';
import { Button } from '../../../shared/ui/button';
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
  if (session.status === 'authenticated') return <Navigate to={target} replace />;

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
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('auth.signInTitle')}</h1>
        <p className="mt-2 text-stone-600">{t('auth.signInSubtitle')}</p>
      </header>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message === undefined ? undefined : t(errors.email.message)}
          {...register('email')}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message === undefined ? undefined : t(errors.password.message)}
          {...register('password')}
        />
        {formError === null ? null : (
          <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
            {formError}
          </p>
        )}
        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? t('auth.submitting') : t('auth.signInSubmit')}
        </Button>
      </form>

      <p className="text-sm text-stone-600">
        {t('auth.noAccount')}{' '}
        <Link to="/register" state={arrival} className="text-accent hover:underline">
          {t('auth.registerTitle')}
        </Link>
      </p>
    </div>
  );
}
