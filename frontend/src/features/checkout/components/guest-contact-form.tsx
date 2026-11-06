import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { hasContact } from '../../../shared/auth';
import type { SessionUser } from '../../../shared/auth';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { guestContactSchema } from '../../auth/model/schemas';
import type { GuestContactValues } from '../../auth/model/schemas';
import { useSaveGuestContact } from '../hooks/use-guest-checkout';

/** Nombre, correo y teléfono del invitado. Sin el correo el pedido no se puede crear; con él se recupera y se cuentan los cupones. */
export function GuestContactForm({ user }: Readonly<{ user: SessionUser }>) {
  const { t } = useTranslation();
  const save = useSaveGuestContact();
  const known = hasContact(user);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GuestContactValues>({
    resolver: zodResolver(guestContactSchema),
    defaultValues: {
      fullName: known ? user.fullName : '',
      email: known ? user.email : '',
      phone: user.phone ?? '',
    },
  });

  return (
    <section aria-labelledby="checkout-contact" className="space-y-4">
      <div>
        <h2 id="checkout-contact" className="text-2xl text-stone-900">
          {t('checkout.contact.title')}
        </h2>
        <p className="mt-1 text-sm text-stone-600">{t('checkout.contact.intro')}</p>
      </div>
      <form
        onSubmit={(event) =>
          void handleSubmit((values) => {
            save.mutate(values);
          })(event)
        }
        noValidate
        className="space-y-4"
      >
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
        {save.isError ? (
          <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorMessage(save.error)}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" loading={save.isPending}>
            {t('checkout.contact.save')}
          </Button>
          {save.isSuccess ? (
            <output className="text-sm text-emerald-800">{t('checkout.contact.saved')}</output>
          ) : null}
        </div>
      </form>
    </section>
  );
}
