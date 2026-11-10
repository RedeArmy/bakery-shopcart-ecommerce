import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { formatMoney } from '../../../shared/lib/money/money';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { LoadingSkeleton } from '../../../shared/ui/states';
import { fieldError } from '../../auth/components/auth-layout';
import { useInventoryProduct } from '../../inventory/hooks/use-inventory';
import { unitsPerPack, variantLabel } from '../../inventory/model/packaging';
import type { Variant } from '../../inventory/model/packaging';
import { useChangePrice } from '../hooks/use-catalogue-admin';
import { priceSchema } from '../model/maintenance';
import type { PriceValues } from '../model/maintenance';

function PriceForm({ variant, onDone }: Readonly<{ variant: Variant; onDone: () => void }>) {
  const { t } = useTranslation();
  const change = useChangePrice(variant.idVariant);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PriceValues>({ resolver: zodResolver(priceSchema), defaultValues: { price: '' } });

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((values) => {
          change.mutate(values, { onSuccess: onDone });
        })(event)
      }
      noValidate
      aria-label={t('catalogueAdmin.changePriceOf', { name: variantLabel(variant) })}
      className="space-y-3 rounded-card border border-stone-200 bg-stone-50 p-4"
    >
      <p className="text-sm text-stone-700">{t('catalogueAdmin.priceHelp')}</p>
      <TextField
        label={t('catalogueAdmin.fields.newPrice')}
        inputMode="decimal"
        className="sm:max-w-48"
        error={fieldError(t, errors.price?.message)}
        {...register('price')}
      />
      {change.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(change.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={change.isPending}>
          {t('catalogueAdmin.savePrice')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function VariantRow({ variant }: Readonly<{ variant: Variant }>) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const perPack = unitsPerPack(variant);
  return (
    <li className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg text-stone-900">{variantLabel(variant)}</p>
            {variant.isActive === false ? (
              <Badge tone="danger">{t('catalogueAdmin.variantInactive')}</Badge>
            ) : null}
          </div>
          <p className="text-sm text-stone-600">
            {variant.sku}
            {perPack > 1 ? ` · ${t('inventory.perPack', { count: perPack })}` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-lg text-stone-900">{formatMoney(variant.price)}</p>
          {editing ? null : (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(true);
              }}
            >
              {t('catalogueAdmin.changePrice')}
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <PriceForm
          variant={variant}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </li>
  );
}

/**
 * Los precios de las variantes de un producto, también las que ya no se venden. Cambiar un precio no toca los pedidos hechos: cada
 * uno conserva el precio al que se hizo. Cada variante tiene su propio precio, así que cada empaque se cambia por separado.
 */
export function VariantPrices({ idProduct }: Readonly<{ idProduct: number }>) {
  const product = useInventoryProduct(idProduct);
  if (product.isPending) return <LoadingSkeleton count={2} />;
  if (product.isError) {
    return (
      <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
        {errorMessage(product.error)}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {product.data.variants.map((variant) => (
        <VariantRow key={variant.idVariant} variant={variant} />
      ))}
    </ul>
  );
}
