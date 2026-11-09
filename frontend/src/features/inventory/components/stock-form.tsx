import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useAdjustStock, useRegisterEntry } from '../hooks/use-inventory';
import { adjustmentSchema, entrySchema } from '../model/inventory';

interface FormValues {
  amount: string;
  reason: string;
}

/**
 * Las dos formas de mover el stock de una variante, cada una con su motivo (obligatorio, queda en el libro): registrar las unidades
 * que llegaron (suma) o dejar el stock en lo que se contó (ajuste). Si el servidor no lo permite, se muestra su respuesta.
 */
export function StockForm({
  kind,
  idVariant,
}: Readonly<{ kind: 'entry' | 'adjustment'; idVariant: number }>) {
  const { t } = useTranslation();
  const isEntry = kind === 'entry';
  const entry = useRegisterEntry(idVariant);
  const adjustment = useAdjustStock(idVariant);
  const mutation = isEntry ? entry : adjustment;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(isEntry ? entrySchema : adjustmentSchema),
    defaultValues: { amount: '', reason: '' },
  });

  const submit = handleSubmit((values) => {
    const done = {
      onSuccess: () => {
        reset();
      },
    };
    const reason = values.reason.trim();
    if (isEntry) entry.mutate({ quantity: Number(values.amount), reason }, done);
    else adjustment.mutate({ newOnHand: Number(values.amount), reason }, done);
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-label={t(`inventory.${kind}.title`)}
      className="space-y-4 rounded-card border border-stone-200 bg-white p-4"
    >
      <div>
        <h3 className="font-display text-lg text-stone-900">{t(`inventory.${kind}.title`)}</h3>
        <p className="text-sm text-stone-600">{t(`inventory.${kind}.help`)}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField
          label={t(`inventory.${kind}.amount`)}
          inputMode="numeric"
          error={fieldError(t, errors.amount?.message)}
          {...register('amount')}
        />
        <TextField
          label={t('inventory.reason')}
          error={fieldError(t, errors.reason?.message)}
          {...register('reason')}
        />
      </div>
      {mutation.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {mutation.isSuccess ? (
        <output className="block text-sm text-emerald-900">
          {mutation.data.idMovement === null ? t('inventory.nothingChanged') : t('inventory.saved')}
        </output>
      ) : null}
      <Button type="submit" loading={mutation.isPending}>
        {t(`inventory.${kind}.submit`)}
      </Button>
    </form>
  );
}
