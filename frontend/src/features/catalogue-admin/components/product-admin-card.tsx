import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../../shared/lib/money/money';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { RemoveConfirmation, useCardMode } from '../../../shared/ui/remove-confirmation';
import { useDeactivateProduct } from '../hooks/use-catalogue-admin';
import type { ProductSummary } from '../model/maintenance';
import { ProductForm } from './product-form';
import { VariantPrices } from './variant-prices';

/**
 * Un producto en la administración: su nombre, si es por encargo, si está activo y su rango de precios. Mientras está activo se
 * edita o se desactiva, con confirmación (los pedidos ya hechos lo conservan). Con «Precios» se abren sus variantes para cambiar el
 * precio de cada una.
 */
export function ProductAdminCard({ product }: Readonly<{ product: ProductSummary }>) {
  const { t } = useTranslation();
  const deactivate = useDeactivateProduct(product.idProduct);
  const { mode, edit, remove, close } = useCardMode();
  const [showPrices, setShowPrices] = useState(false);
  const active = product.isActive !== false;

  if (mode === 'edit') {
    return (
      <li>
        <ProductForm product={product} onDone={close} onCancel={close} />
      </li>
    );
  }

  const range =
    product.minPrice === product.maxPrice
      ? formatMoney(product.minPrice)
      : `${formatMoney(product.minPrice)} – ${formatMoney(product.maxPrice)}`;

  return (
    <li className="space-y-4 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg text-stone-900">{product.name}</h3>
            {product.leadTimeDays !== undefined && product.leadTimeDays > 0 ? (
              <Badge tone="accent">
                {t('catalogueAdmin.madeToOrder', { count: product.leadTimeDays })}
              </Badge>
            ) : null}
            <Badge tone={active ? 'success' : 'neutral'}>
              {active ? t('catalogueAdmin.active') : t('catalogueAdmin.inactive')}
            </Badge>
          </div>
          <p className="text-sm text-stone-600">
            {product.categoryName ? `${product.categoryName} · ` : null}
            {range}
          </p>
        </div>
        {mode === 'remove' ? null : (
          <div className="flex flex-wrap gap-3">
            <Button
              variant={showPrices ? 'primary' : 'secondary'}
              aria-expanded={showPrices}
              onClick={() => {
                setShowPrices((open) => !open);
              }}
            >
              {t('catalogueAdmin.prices')}
            </Button>
            {active ? (
              <>
                <Button variant="secondary" onClick={edit}>
                  {t('catalogueAdmin.edit')}
                </Button>
                <Button variant="ghost" onClick={remove}>
                  {t('catalogueAdmin.remove')}
                </Button>
              </>
            ) : null}
          </div>
        )}
      </div>
      {mode === 'remove' ? (
        <RemoveConfirmation
          prefix="catalogueAdmin.productRemove"
          deactivation={deactivate}
          onClose={close}
        />
      ) : null}
      {showPrices ? <VariantPrices idProduct={product.idProduct} /> : null}
    </li>
  );
}
