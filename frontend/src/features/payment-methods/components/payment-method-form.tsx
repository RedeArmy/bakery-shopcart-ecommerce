import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { CheckboxField, SelectField, TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useCreatePaymentMethod, useUpdatePaymentMethod } from '../hooks/use-payment-methods';
import type { PaymentMethod } from '../hooks/use-payment-methods';
import { EMPTY_PAYMENT_METHOD, KINDS, paymentMethodSchema } from '../model/schemas';
import type { PaymentMethodValues } from '../model/schemas';

const valuesOf = (method: PaymentMethod): PaymentMethodValues => ({
  kind: method.kind === 'Cash' ? 'Cash' : 'Deposit',
  title: method.title,
  description: method.description ?? '',
  appliesToDelivery: method.appliesToDelivery,
  appliesToPickup: method.appliesToPickup,
});

/**
 * Alta o edición de un método de pago, con los mismos campos. Sin `method` crea uno nuevo; con él edita el que se muestra
 * (la clase ya no cambia). El efectivo se cobra en la sucursal, así que solo se ofrece para recogidas: el formulario lo
 * fija y el servidor lo vuelve a asegurar.
 */
export function PaymentMethodForm({
  method,
  onDone,
  onCancel,
}: Readonly<{ method?: PaymentMethod; onDone: () => void; onCancel?: () => void }>) {
  const { t } = useTranslation();
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod(method?.idPaymentMethod ?? 0);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PaymentMethodValues>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: method === undefined ? EMPTY_PAYMENT_METHOD : valuesOf(method),
  });
  const isCash = watch('kind') === 'Cash';

  const submitting = method === undefined ? create : update;
  const submit = (values: PaymentMethodValues) => {
    // El efectivo solo se ofrece para recogidas
    const adjusted =
      values.kind === 'Cash'
        ? { ...values, appliesToDelivery: false, appliesToPickup: true }
        : values;
    if (method === undefined) create.mutate(adjusted, { onSuccess: onDone });
    else update.mutate({ values: adjusted }, { onSuccess: onDone });
  };

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-4 rounded-card border border-stone-200 bg-white p-4"
    >
      <h3 className="font-display text-lg text-stone-900">
        {method === undefined ? t('paymentMethods.newTitle') : t('paymentMethods.editTitle')}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('paymentMethods.fields.kind')}
          disabled={method !== undefined}
          {...register('kind')}
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`paymentMethods.kinds.${kind}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('paymentMethods.fields.title')}
          error={fieldError(t, errors.title?.message)}
          {...register('title')}
        />
      </div>
      <TextField
        label={t('paymentMethods.fields.description')}
        hint={t('paymentMethods.descriptionHint')}
        optionalLabel={t('common.optional')}
        error={fieldError(t, errors.description?.message)}
        {...register('description')}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-800">
          {t('paymentMethods.appliesTitle')}
        </legend>
        {isCash ? (
          <p className="text-sm text-stone-600">{t('paymentMethods.cashPickupOnly')}</p>
        ) : (
          <>
            <CheckboxField
              label={t('paymentMethods.fields.appliesToDelivery')}
              {...register('appliesToDelivery')}
            />
            <CheckboxField
              label={t('paymentMethods.fields.appliesToPickup')}
              {...register('appliesToPickup')}
            />
          </>
        )}
        {errors.appliesToPickup?.message === undefined ? null : (
          <p role="alert" className="text-sm text-red-700">
            {fieldError(t, errors.appliesToPickup.message)}
          </p>
        )}
      </fieldset>
      {submitting.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(submitting.error)}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" loading={submitting.isPending}>
          {method === undefined ? t('paymentMethods.create') : t('paymentMethods.save')}
        </Button>
        {onCancel === undefined ? null : (
          <Button variant="ghost" onClick={onCancel}>
            {t('common.close')}
          </Button>
        )}
      </div>
    </form>
  );
}
