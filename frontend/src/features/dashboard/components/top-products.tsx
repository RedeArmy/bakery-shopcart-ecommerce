import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { Price } from '../../../shared/ui/price';

type TopProduct = components['schemas']['TopProduct'];

/** Los productos más vendidos del período en orden de posición, con las unidades netas de devoluciones y su venta. */
export function TopProductsList({ items }: Readonly<{ items: readonly TopProduct[] }>) {
  const { t } = useTranslation();
  return (
    <ol className="divide-y divide-stone-100">
      {items.map((item) => (
        <li key={item.idProduct} className="flex items-center gap-4 py-3">
          <span className="w-6 font-display text-xl tabular-nums text-stone-500">
            {item.position}
          </span>
          <p className="min-w-0 flex-1 truncate text-stone-900">{item.productName}</p>
          <p className="text-sm text-stone-600">
            {t('dashboard.categories.units', { count: item.units })}
          </p>
          <Price amount={item.net} className="text-stone-900" />
        </li>
      ))}
    </ol>
  );
}
