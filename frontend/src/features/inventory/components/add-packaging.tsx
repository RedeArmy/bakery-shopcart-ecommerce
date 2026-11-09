import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useAddPackaging } from '../hooks/use-inventory';
import { EMPTY_PACKAGING, packagingSchema } from '../model/packaging';
import type { PackagingValues } from '../model/packaging';

function PackagingForm({
  idProduct,
  stockVariantId,
  onDone,
}: Readonly<{ idProduct: number; stockVariantId: number; onDone: () => void }>) {
  const { t } = useTranslation();
  const add = useAddPackaging(idProduct, stockVariantId);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PackagingValues>({
    resolver: zodResolver(packagingSchema),
    defaultValues: EMPTY_PACKAGING,
  });
  const field = (name: keyof PackagingValues) => ({
    label: t(`inventory.packaging.fields.${name}`),
    error: fieldError(t, errors[name]?.message),
    ...register(name),
  });

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((values) => {
          add.mutate(values, { onSuccess: onDone });
        })(event)
      }
      noValidate
      aria-label={t('inventory.packaging.title')}
      className="space-y-4 rounded-card border border-stone-200 bg-stone-50 p-4"
    >
      <div>
        <h4 className="font-display text-lg text-stone-900">{t('inventory.packaging.title')}</h4>
        <p className="text-sm text-stone-600">{t('inventory.packaging.help')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField {...field('name')} hint={t('inventory.packaging.hints.name')} />
        <TextField {...field('sku')} />
        <TextField {...field('price')} inputMode="decimal" />
        <TextField
          {...field('unitsPerPack')}
          inputMode="numeric"
          hint={t('inventory.packaging.hints.unitsPerPack')}
        />
      </div>
      {add.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(add.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={add.isPending}>
          {t('inventory.packaging.submit')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Agregar un empaque a una existencia compartida (una bolsa de 6 donde ya había docena): una variante nueva con su código, su precio
 * y las unidades que trae. No trae stock propio: toma las unidades de la existencia que ya hay, así que sus paquetes aparecen solos.
 */
export function AddPackaging({
  idProduct,
  stockVariantId,
}: Readonly<{ idProduct: number; stockVariantId: number }>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <PackagingForm
        idProduct={idProduct}
        stockVariantId={stockVariantId}
        onDone={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <div>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('inventory.packaging.add')}
      </Button>
    </div>
  );
}
