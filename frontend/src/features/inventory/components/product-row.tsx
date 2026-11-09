import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { ProductInventory } from './product-inventory';

type ProductSummary = components['schemas']['ProductSummary'];

/**
 * Un producto de la categoría: su nombre, cuántas unidades se pueden comprar hoy y si es por encargo. Con «Gestionar inventario»
 * se abre debajo todo lo necesario para mover su stock; abrir otro producto cierra este.
 */
export function ProductRow({
  product,
  open,
  idVariant,
  page,
  onToggle,
  onVariant,
  onPage,
}: Readonly<{
  product: ProductSummary;
  open: boolean;
  idVariant: number | null;
  page: number;
  onToggle: () => void;
  onVariant: (id: number) => void;
  onPage: (page: number) => void;
}>) {
  const { t } = useTranslation();
  return (
    <li className="space-y-4 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg text-stone-900">{product.name}</h3>
            {product.leadTimeDays !== undefined && product.leadTimeDays > 0 ? (
              <Badge tone="accent">
                {t('inventory.madeToOrder', { count: product.leadTimeDays })}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-stone-600">
            {t('inventory.available', { count: product.available ?? 0 })}
          </p>
        </div>
        <Button variant={open ? 'primary' : 'secondary'} aria-expanded={open} onClick={onToggle}>
          {open ? t('inventory.closeProduct') : t('inventory.manage')}
        </Button>
      </div>
      {open ? (
        <ProductInventory
          idProduct={product.idProduct}
          idVariant={idVariant}
          page={page}
          onVariant={onVariant}
          onPage={onPage}
        />
      ) : null}
    </li>
  );
}
