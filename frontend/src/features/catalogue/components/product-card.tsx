import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { components } from '../../../shared/api/generated/schema';
import { formatMoney } from '../../../shared/lib/money/money';
import { Badge } from '../../../shared/ui/badge';
import { Price } from '../../../shared/ui/price';
import { ProductImage } from '../../../shared/ui/product-image';
import { stockState } from '../model/catalogue-query';

type ProductSummary = components['schemas']['ProductSummary'];

export function ProductCard({ product }: { product: ProductSummary }) {
  const { t } = useTranslation();
  const state = product.available === undefined ? 'ok' : stockState(product.available);
  const sameBounds = product.minPrice === product.maxPrice;

  return (
    <article>
      <Link to={`/catalogue/${product.idProduct}`} className="group block">
        <ProductImage url={product.primaryImageUrl} name={product.name} />
        <div className="mt-3 flex items-start justify-between gap-3">
          <h3 className="font-display text-lg leading-snug text-stone-900 group-hover:text-accent">
            {product.name}
          </h3>
          {state === 'soldOut' ? <Badge tone="danger">{t('catalogue.soldOut')}</Badge> : null}
          {state === 'low' ? <Badge tone="warning">{t('catalogue.lowStock')}</Badge> : null}
        </div>
        {product.categoryName === undefined ? null : (
          <p className="text-sm text-stone-600">{product.categoryName}</p>
        )}
        <p className="mt-1 text-base text-stone-900">
          {sameBounds ? (
            <Price amount={product.minPrice} />
          ) : (
            t('catalogue.from', { price: formatMoney(product.minPrice) })
          )}
        </p>
        {product.leadTimeDays === undefined || product.leadTimeDays === 0 ? null : (
          <p className="text-xs text-stone-500">
            {t('catalogue.leadTime', { count: product.leadTimeDays })}
          </p>
        )}
      </Link>
    </article>
  );
}
