import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage } from '../../../shared/api';
import { auth, useSession } from '../../../shared/auth';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { registerSchema } from '../model/schemas';
import type { RegisterValues } from '../model/schemas';
import { redirectTarget } from '../model/sign-in-redirect';

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '' },
  });

  const arrival: unknown = location.state;
  const target = redirectTarget(arrival);
  if (session.status === 'authenticated') return <Navigate to={target} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await auth.register({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        phone: values.phone === '' ? null : values.phone,
      });
      void navigate(target, { replace: true });
    } catch (error) {
      // Un correo repetido es un error del campo, no del formulario: se marca donde se puede corregir
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        setError('email', { message: 'errors.codes.EMAIL_ALREADY_REGISTERED' });
        return;
      }
      setFormError(errorMessage(error));
    }
  });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('auth.registerTitle')}</h1>
        <p className="mt-2 text-stone-600">{t('auth.registerSubtitle')}</p>
      </header>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
        <TextField
          label={t('auth.fullName')}
          autoComplete="name"
          error={errors.fullName?.message === undefined ? undefined : t(errors.fullName.message)}
          {...register('fullName')}
        />
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message === undefined ? undefined : t(errors.email.message)}
          {...register('email')}
        />
        <TextField
          label={t('auth.phone')}
          optionalLabel={t('common.optional')}
          type="tel"
          autoComplete="tel"
          error={errors.phone?.message === undefined ? undefined : t(errors.phone.message)}
          {...register('phone')}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          error={errors.password?.message === undefined ? undefined : t(errors.password.message)}
          {...register('password')}
        />
        {formError === null ? null : (
          <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
            {formError}
          </p>
        )}
        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? t('auth.submitting') : t('auth.registerSubmit')}
        </Button>
      </form>

      <p className="text-sm text-stone-600">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" state={arrival} className="text-accent hover:underline">
          {t('auth.signInTitle')}
        </Link>
      </p>
    </div>
  );
}
