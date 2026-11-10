import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { SelectField, TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useCreateCategory, useUpdateCategory } from '../hooks/use-catalogue-admin';
import {
  EMPTY_CATEGORY,
  categoryValuesOf,
  categorySchema,
  orderCategories,
} from '../model/maintenance';
import type { Category, CategoryValues } from '../model/maintenance';

/**
 * Alta o edición de una categoría, con los mismos campos. Sin `category` crea una nueva; con ella edita la que se muestra. El nombre
 * no se repite entre categorías y una categoría no puede colgar de sí misma ni de una suya: lo decide el servidor y su respuesta se
 * muestra. Solo se ofrecen como padre las categorías activas.
 */
export function CategoryForm({
  category,
  categories,
  onDone,
  onCancel,
}: Readonly<{
  category?: Category;
  categories: readonly Category[];
  onDone: () => void;
  onCancel: () => void;
}>) {
  const { t } = useTranslation();
  const create = useCreateCategory();
  const update = useUpdateCategory(category?.idCategory ?? 0);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: category === undefined ? EMPTY_CATEGORY : categoryValuesOf(category),
  });
  const mutation = category === undefined ? create : update;
  const parents = orderCategories(categories.filter((candidate) => candidate.isActive !== false));

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((values) => {
          mutation.mutate(values, { onSuccess: onDone });
        })(event)
      }
      noValidate
      aria-label={
        category === undefined ? t('catalogueAdmin.newCategory') : t('catalogueAdmin.editCategory')
      }
      className="space-y-4 rounded-card border border-stone-200 bg-white p-4"
    >
      <h3 className="font-display text-lg text-stone-900">
        {category === undefined
          ? t('catalogueAdmin.newCategory')
          : t('catalogueAdmin.editCategory')}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('catalogueAdmin.fields.categoryName')}
          error={fieldError(t, errors.name?.message)}
          {...register('name')}
        />
        <SelectField
          label={t('catalogueAdmin.fields.parent')}
          optionalLabel={t('common.optional')}
          hint={t('catalogueAdmin.hints.parent')}
          {...register('parent')}
        >
          <option value="">{t('catalogueAdmin.noParent')}</option>
          {parents
            .filter((item) => item.category.idCategory !== category?.idCategory)
            .map((item) => (
              <option key={item.category.idCategory} value={item.category.idCategory}>
                {`${' '.repeat(item.depth)}${item.depth > 0 ? '↳ ' : ''}${item.category.name ?? ''}`}
              </option>
            ))}
        </SelectField>
      </div>
      <TextField
        label={t('catalogueAdmin.fields.categoryDescription')}
        optionalLabel={t('common.optional')}
        error={fieldError(t, errors.description?.message)}
        {...register('description')}
      />
      {mutation.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" loading={mutation.isPending}>
          {category === undefined ? t('catalogueAdmin.createCategory') : t('catalogueAdmin.save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.close')}
        </Button>
      </div>
    </form>
  );
}
