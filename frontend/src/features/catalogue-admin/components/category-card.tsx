import { useTranslation } from 'react-i18next';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { RemoveConfirmation, useCardMode } from '../../../shared/ui/remove-confirmation';
import { useDeactivateCategory } from '../hooks/use-catalogue-admin';
import type { Category } from '../model/maintenance';
import { CategoryForm } from './category-form';

/**
 * Una categoría en la administración: su nombre, de cuál cuelga, cuántos productos activos tiene y si está activa. Mientras está
 * activa se edita o se desactiva, con confirmación; el servidor no deja desactivar una que aún tiene productos activos o
 * subcategorías, y su respuesta se muestra.
 */
export function CategoryCard({
  category,
  depth,
  parentName,
  categories,
}: Readonly<{
  category: Category;
  depth: number;
  parentName: string | undefined;
  categories: readonly Category[];
}>) {
  const { t } = useTranslation();
  const deactivate = useDeactivateCategory(category.idCategory ?? 0);
  const { mode, edit, remove, close } = useCardMode();
  const active = category.isActive !== false;

  if (mode === 'edit') {
    return (
      <li>
        <CategoryForm category={category} categories={categories} onDone={close} onCancel={close} />
      </li>
    );
  }

  return (
    <li
      className="space-y-3 rounded-card border border-stone-200 bg-white p-4"
      style={{ marginLeft: `${String(depth * 1.5)}rem` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg text-stone-900">{category.name}</h3>
        <Badge tone={active ? 'success' : 'neutral'}>
          {active ? t('catalogueAdmin.active') : t('catalogueAdmin.inactive')}
        </Badge>
      </div>
      {category.description ? (
        <p className="text-sm text-stone-700">{category.description}</p>
      ) : null}
      <p className="text-sm text-stone-600">
        {parentName === undefined
          ? t('catalogueAdmin.mainCategory')
          : t('catalogueAdmin.inCategory', { name: parentName })}
        {' · '}
        {t('catalogueAdmin.activeProducts', { count: category.activeProducts ?? 0 })}
      </p>

      {active && mode === 'view' ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={edit}>
            {t('catalogueAdmin.edit')}
          </Button>
          <Button variant="ghost" onClick={remove}>
            {t('catalogueAdmin.remove')}
          </Button>
        </div>
      ) : null}
      {mode === 'remove' ? (
        <RemoveConfirmation
          prefix="catalogueAdmin.categoryRemove"
          deactivation={deactivate}
          onClose={close}
        />
      ) : null}
    </li>
  );
}
