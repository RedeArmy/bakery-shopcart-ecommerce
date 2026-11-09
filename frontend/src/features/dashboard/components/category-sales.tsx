import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { Price } from '../../../shared/ui/price';
import { plotValue } from '../model/dashboard';

type CategorySales = components['schemas']['CategorySales'];

/**
 * La venta neta de cada categoría, la mayor primero, con una barra proporcional a la mayor. El ancho de la barra es solo un dibujo;
 * el importe que se lee es el texto del API.
 */
export function CategorySalesList({ items }: Readonly<{ items: readonly CategorySales[] }>) {
  const { t } = useTranslation();
  const largest = Math.max(...items.map((item) => plotValue(item.net)), 0);

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const share = largest === 0 ? 0 : (plotValue(item.net) / largest) * 100;
        return (
          <li key={item.idCategory} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-stone-900">{item.categoryName}</p>
              <p className="text-sm text-stone-600">
                {t('dashboard.categories.units', { count: item.units })} ·{' '}
                <Price amount={item.net} className="text-stone-900" />
              </p>
            </div>
            <div aria-hidden="true" className="h-2 rounded-full bg-stone-100">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${String(share)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
