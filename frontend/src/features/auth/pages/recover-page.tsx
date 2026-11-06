import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../../shared/api';
import { auth } from '../../../shared/auth';
import { TextField } from '../../../shared/ui/fields';
import { AuthLayout, FormAlert, SubmitButton, fieldError } from '../components/auth-layout';
import { recoverSchema } from '../model/schemas';
import type { RecoverValues } from '../model/schemas';

// Quien recupera su sesión de invitado vuelve a su carrito; la lista de pedidos se suma cuando exista esa pantalla
const AFTER_RECOVERY = '/cart';

/** Recupera la sesión de un invitado con el correo y el código que guardó al comprar. */
export function RecoverPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecoverValues>({
    resolver: zodResolver(recoverSchema),
    defaultValues: { email: '', code: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await auth.recoverGuest(values.email, values.code);
      void navigate(AFTER_RECOVERY, { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <AuthLayout
      title={t('auth.recover.title')}
      subtitle={t('auth.recover.subtitle')}
      question={t('auth.hasAccount')}
      switchLabel={t('auth.signInTitle')}
      switchTo="/login"
      switchState={undefined}
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
          label={t('auth.recover.code')}
          autoComplete="off"
          error={fieldError(t, errors.code?.message)}
          {...register('code')}
        />
        <FormAlert message={formError} />
        <SubmitButton submitting={isSubmitting} label={t('auth.recover.submit')} />
      </form>
    </AuthLayout>
  );
}
