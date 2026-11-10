import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { SelectField, TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useAddPackaging } from '../hooks/use-inventory';
import { packagingSchema, variantLabel } from '../model/packaging';
import type { PackagingValues, StockGroup } from '../model/packaging';

/** Cómo se llama una existencia en la lista: los empaques que toman de ella y las unidades que hay. */
const groupLabel = (group: StockGroup, units: string): string =>
  `${group.variants.map(variantLabel).join(' / ')} · ${units}`;

function PackagingForm({
  idProduct,
  groups,
  onDone,
}: Readonly<{ idProduct: number; groups: readonly StockGroup[]; onDone: () => void }>) {
  const { t } = useTranslation();
  const add = useAddPackaging(idProduct);
  const several = groups.length > 1;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PackagingValues>({
    resolver: zodResolver(packagingSchema),
    // Con una sola existencia no hay que elegir: el empaque nuevo toma de ella
    defaultValues: {
      name: '',
      sku: '',
      price: '',
      unitsPerPack: '',
      stock: several ? '' : String(groups[0]?.holder ?? ''),
    },
  });
  const field = (name: Exclude<keyof PackagingValues, 'stock'>) => ({
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
      {several ? (
        <SelectField
          label={t('inventory.packaging.fields.stock')}
          hint={t('inventory.packaging.hints.stock')}
          error={fieldError(t, errors.stock?.message)}
          {...register('stock')}
        >
          <option value="">{t('inventory.packaging.chooseStock')}</option>
          {groups.map((group) => (
            <option key={group.holder} value={group.holder}>
              {groupLabel(group, t('inventory.onHand', { count: group.units }))}
            </option>
          ))}
        </SelectField>
      ) : null}
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
 * Agregar un empaque al producto (una bolsa de 6 donde ya se vende la docena): una variante nueva con su código, su precio y las
 * unidades que trae. No trae stock propio: toma las unidades de la existencia que ya hay, así que sus paquetes aparecen solos. Es
 * un solo botón por producto, abajo a la izquierda; si el producto tiene varias existencias independientes, el formulario pregunta
 * de cuál toma las unidades.
 */
export function AddPackaging({
  idProduct,
  groups,
}: Readonly<{ idProduct: number; groups: readonly StockGroup[] }>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;
  if (open) {
    return (
      <PackagingForm
        idProduct={idProduct}
        groups={groups}
        onDone={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <div className="flex justify-start">
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
