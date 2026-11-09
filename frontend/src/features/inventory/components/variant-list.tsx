import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';

type Variant = components['schemas']['Variant'];

/** Cómo se distingue una variante: sus atributos (tamaño, sabor…) y, si no tiene, su código. */
export const variantLabel = (variant: Variant): string => {
  const attributes = (variant.attributes ?? [])
    .map((attribute) => attribute.value)
    .filter((value): value is string => value !== undefined && value !== '');
  return attributes.length > 0 ? attributes.join(' · ') : variant.sku;
};

/**
 * Las variantes del producto elegido con lo que hay de cada una: las unidades físicas y las que se pueden comprar ahora (las demás
 * están reservadas en carritos). Se elige una para ver su libro y mover su stock.
 */
export function VariantList({
  variants,
  selected,
  onSelect,
}: Readonly<{
  variants: readonly Variant[];
  selected: number | null;
  onSelect: (id: number) => void;
}>) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-3">
      {variants.map((variant) => (
        <li
          key={variant.idVariant}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-stone-200 bg-white p-4"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg text-stone-900">{variantLabel(variant)}</p>
              {variant.isActive === false ? (
                <Badge tone="danger">{t('inventory.inactiveVariant')}</Badge>
              ) : null}
            </div>
            <p className="text-sm text-stone-600">
              {variant.sku}
              {' · '}
              {t('inventory.onHand', { count: variant.onHandStock ?? 0 })}
              {' · '}
              {t('inventory.available', { count: variant.available ?? 0 })}
            </p>
          </div>
          <Button
            variant={selected === variant.idVariant ? 'primary' : 'secondary'}
            aria-pressed={selected === variant.idVariant}
            onClick={() => {
              onSelect(variant.idVariant);
            }}
          >
            {t('inventory.openLedger')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
