import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { SelectField, TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useCategories } from '../../catalogue/hooks/use-catalogue-queries';
import { categoryChoices, choiceLabel } from '../../catalogue/model/categories';
import { useUpdateProduct } from '../hooks/use-catalogue-admin';
import { productSchema, productValuesOf } from '../model/maintenance';
import type { ProductSummary, ProductValues } from '../model/maintenance';

/**
 * Edición de un producto: su categoría, su nombre, su descripción y los días de preparación (0 se vende de inmediato, más es por
 * encargo). Sus variantes, con su código y su precio, se cambian aparte; un producto nuevo se crea desde el inventario.
 */
export function ProductForm({
  product,
  onDone,
  onCancel,
}: Readonly<{ product: ProductSummary; onDone: () => void; onCancel: () => void }>) {
  const { t } = useTranslation();
  const update = useUpdateProduct(product.idProduct);
  const categories = useCategories({ fresh: true });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: productValuesOf(product),
  });
  const leadTime = Number(watch('leadTimeDays'));

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((values) => {
          update.mutate(values, { onSuccess: onDone });
        })(event)
      }
      noValidate
      aria-label={t('catalogueAdmin.editProduct')}
      className="space-y-4 rounded-card border border-stone-200 bg-white p-4"
    >
      <h3 className="font-display text-lg text-stone-900">{t('catalogueAdmin.editProduct')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('catalogueAdmin.fields.productName')}
          error={fieldError(t, errors.name?.message)}
          {...register('name')}
        />
        <SelectField
          label={t('catalogueAdmin.fields.productCategory')}
          error={fieldError(t, errors.category?.message)}
          {...register('category')}
        >
          <option value="">{t('catalogueAdmin.chooseCategory')}</option>
          {categoryChoices(categories.data ?? []).map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choiceLabel(choice)}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField
        label={t('catalogueAdmin.fields.productDescription')}
        optionalLabel={t('common.optional')}
        error={fieldError(t, errors.description?.message)}
        {...register('description')}
      />
      <TextField
        label={t('catalogueAdmin.fields.leadTimeDays')}
        inputMode="numeric"
        className="sm:max-w-40"
        error={fieldError(t, errors.leadTimeDays?.message)}
        hint={
          leadTime > 0
            ? t('catalogueAdmin.hints.madeToOrder', { count: leadTime })
            : t('catalogueAdmin.hints.inStock')
        }
        {...register('leadTimeDays')}
      />
      {update.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(update.error)}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" loading={update.isPending}>
          {t('catalogueAdmin.save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.close')}
        </Button>
      </div>
    </form>
  );
}
