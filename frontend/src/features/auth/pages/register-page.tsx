import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage } from '../../../shared/api';
import { auth, hasAccount, useSession } from '../../../shared/auth';
import { AuthLayout, FormAlert, SubmitButton, fieldError } from '../components/auth-layout';
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
  // Un invitado tiene sesión pero no cuenta: puede entrar o crear una cuenta desde aquí
  if (hasAccount(session)) return <Navigate to={target} replace />;

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
    <AuthLayout
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      question={t('auth.hasAccount')}
      switchLabel={t('auth.signInTitle')}
      switchTo="/login"
      switchState={arrival}
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
        <TextField
          label={t('auth.fullName')}
          autoComplete="name"
          error={fieldError(t, errors.fullName?.message)}
          {...register('fullName')}
        />
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          error={fieldError(t, errors.email?.message)}
          {...register('email')}
        />
        <TextField
          label={t('auth.phone')}
          optionalLabel={t('common.optional')}
          type="tel"
          autoComplete="tel"
          error={fieldError(t, errors.phone?.message)}
          {...register('phone')}
        />
        <TextField
          label={t('auth.credentialLabel')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          error={fieldError(t, errors.password?.message)}
          {...register('password')}
        />
        <FormAlert message={formError} />
        <SubmitButton submitting={isSubmitting} label={t('auth.registerSubmit')} />
      </form>
    </AuthLayout>
  );
}
