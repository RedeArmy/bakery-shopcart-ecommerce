import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { CheckboxField, SelectField, TextField } from '../../../shared/ui/fields';
import { Modal } from '../../../shared/ui/modal';
import { fieldError } from '../../auth/components/auth-layout';
import { useCategories } from '../../catalogue/hooks/use-catalogue-queries';
import { categoryChoices, choiceLabel } from '../../catalogue/model/categories';
import { useCreateProduct } from '../hooks/use-inventory';
import { EMPTY_VARIANT, emptyProduct, newProductSchema } from '../model/new-product';
import type { NewProductValues } from '../model/new-product';

/**
 * La ventana para crear un producto completo, solo para el administrador (el servidor no lo permite a nadie más): la categoría, el
 * nombre, la descripción, si es de venta inmediata o por encargo (los días de preparación) y sus variantes, cada una con su código,
 * su precio, un atributo que la distinga y las unidades con las que empieza. Sin variantes un producto no se puede vender ni tener
 * stock, por eso se pide al menos una. Si un paso falla, lo ya creado se conserva y el reintento sigue desde donde quedó.
 */
export function CreateProductDialog({
  category,
  onClose,
  onCreated,
}: Readonly<{
  category: number | null;
  onClose: () => void;
  onCreated: (idProduct: number, idCategory: number) => void;
}>) {
  const { t } = useTranslation();
  const categories = useCategories({ fresh: true });
  const create = useCreateProduct();
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<NewProductValues>({
    resolver: zodResolver(newProductSchema),
    defaultValues: emptyProduct(category),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'variants' });
  // Una vez creado el producto no se vuelve a tocar lo escrito: el reintento solo termina lo que falta
  const locked = create.createdProduct !== null;
  const leadTime = Number(watch('leadTimeDays'));
  const shared = watch('sharedStock');

  const submit = handleSubmit((values) => {
    create.mutate(
      { values, initialStockReason: t('inventory.create.initialStockReason') },
      {
        onSuccess: (idProduct) => {
          onCreated(idProduct, Number(values.category));
        },
      },
    );
  });

  const field = (name: 'category' | 'name' | 'description' | 'leadTimeDays') => ({
    label: t(`inventory.create.fields.${name}`),
    error: fieldError(t, errors[name]?.message),
    ...register(name),
  });

  return (
    <Modal title={t('inventory.create.title')} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        <fieldset disabled={locked} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField {...field('category')}>
              <option value="">{t('inventory.create.chooseCategory')}</option>
              {categoryChoices(categories.data ?? []).map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choiceLabel(choice)}
                </option>
              ))}
            </SelectField>
            <TextField {...field('name')} />
          </div>
          <TextField
            {...field('description')}
            optionalLabel={t('common.optional')}
            hint={t('inventory.create.hints.description')}
          />
          <TextField
            {...field('leadTimeDays')}
            inputMode="numeric"
            className="sm:max-w-40"
            hint={
              leadTime > 0
                ? t('inventory.create.hints.madeToOrder', { count: leadTime })
                : t('inventory.create.hints.inStock')
            }
          />

          <div className="space-y-3 rounded-card border border-stone-200 p-4">
            <CheckboxField label={t('inventory.create.sharedStock')} {...register('sharedStock')} />
            <p className="text-sm text-stone-600">{t('inventory.create.hints.sharedStock')}</p>
            {shared ? (
              <TextField
                {...register('initialUnits')}
                label={t('inventory.create.fields.initialUnits')}
                inputMode="numeric"
                className="sm:max-w-56"
                optionalLabel={t('common.optional')}
                hint={t('inventory.create.hints.initialUnits')}
                error={fieldError(t, errors.initialUnits?.message)}
              />
            ) : null}
          </div>

          <section className="space-y-3" aria-label={t('inventory.create.variants')}>
            <div>
              <h3 className="text-xl text-stone-900">{t('inventory.create.variants')}</h3>
              <p className="text-sm text-stone-600">{t('inventory.create.variantsHelp')}</p>
            </div>
            {fields.map((item, index) => {
              const issue = errors.variants?.[index];
              return (
                <fieldset
                  key={item.id}
                  className="space-y-3 rounded-card border border-stone-200 bg-stone-50 p-4"
                >
                  <legend className="px-1 font-medium text-stone-900">
                    {t('inventory.create.variantNumber', { number: index + 1 })}
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label={t('inventory.create.fields.sku')}
                      error={fieldError(t, issue?.sku?.message)}
                      {...register(`variants.${index}.sku`)}
                    />
                    <TextField
                      label={t('inventory.create.fields.price')}
                      inputMode="decimal"
                      error={fieldError(t, issue?.price?.message)}
                      {...register(`variants.${index}.price`)}
                    />
                    <TextField
                      label={t('inventory.create.fields.attributeName')}
                      optionalLabel={t('common.optional')}
                      hint={t('inventory.create.hints.attributeName')}
                      error={fieldError(t, issue?.attributeName?.message)}
                      {...register(`variants.${index}.attributeName`)}
                    />
                    <TextField
                      label={t('inventory.create.fields.attributeValue')}
                      optionalLabel={t('common.optional')}
                      hint={t('inventory.create.hints.attributeValue')}
                      error={fieldError(t, issue?.attributeValue?.message)}
                      {...register(`variants.${index}.attributeValue`)}
                    />
                    {shared ? (
                      <TextField
                        label={t('inventory.create.fields.unitsPerPack')}
                        inputMode="numeric"
                        hint={
                          index === 0
                            ? t('inventory.create.hints.holderUnits')
                            : t('inventory.create.hints.unitsPerPack')
                        }
                        error={fieldError(t, issue?.unitsPerPack?.message)}
                        {...register(`variants.${index}.unitsPerPack`)}
                      />
                    ) : (
                      <TextField
                        label={t('inventory.create.fields.stock')}
                        inputMode="numeric"
                        optionalLabel={t('common.optional')}
                        hint={t('inventory.create.hints.stock')}
                        error={fieldError(t, issue?.stock?.message)}
                        {...register(`variants.${index}.stock`)}
                      />
                    )}
                  </div>
                  {fields.length > 1 ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        remove(index);
                      }}
                    >
                      {t('inventory.create.removeVariant')}
                    </Button>
                  ) : null}
                </fieldset>
              );
            })}
            {errors.variants?.root?.message ? (
              <p role="alert" className="text-sm text-red-700">
                {fieldError(t, errors.variants.root.message)}
              </p>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                append({ ...EMPTY_VARIANT });
              }}
            >
              {t('inventory.create.addVariant')}
            </Button>
          </section>
        </fieldset>

        {locked ? (
          <p className="rounded-control bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('inventory.create.partial')}
          </p>
        ) : null}
        {create.isError ? (
          <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorMessage(create.error)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={create.isPending}>
            {locked ? t('inventory.create.finish') : t('inventory.create.submit')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
