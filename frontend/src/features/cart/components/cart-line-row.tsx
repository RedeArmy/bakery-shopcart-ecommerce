import { useTranslation } from 'react-i18next';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Price } from '../../../shared/ui/price';
import { ProductImage } from '../../../shared/ui/product-image';
import { QuantityStepper } from '../../../shared/ui/quantity-stepper';
import { lineBlocked, lineLimit } from '../model/cart-model';
import type { CartLine } from '../model/cart-model';

/** Una línea del carrito: producto, cantidad, importes y el aviso de existencias cuando ya no alcanza. */
export function CartLineRow({
  line,
  busy,
  onQuantity,
  onRemove,
}: Readonly<{
  line: CartLine;
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}>) {
  const { t } = useTranslation();
  const blocked = lineBlocked(line);
  const limit = lineLimit(line);
  const soldOut = line.isAvailable === false || limit === 0;

  let notice = null;
  if (soldOut) notice = <Badge tone="danger">{t('cart.line.unavailable')}</Badge>;
  else if (blocked)
    notice = <Badge tone="warning">{t('cart.line.onlyAvailable', { count: limit })}</Badge>;

  return (
    <li className="grid grid-cols-[6rem_1fr] gap-4 py-5 sm:grid-cols-[7rem_1fr_auto]">
      <div className="w-24 sm:w-28">
        <ProductImage url={null} name={line.productName ?? line.sku ?? ''} />
      </div>

      <div className="min-w-0 space-y-1">
        <h3 className="font-display text-lg leading-snug text-stone-900">{line.productName}</h3>
        {line.sku === undefined ? null : (
          <p className="text-xs text-stone-500">{t('product.sku', { sku: line.sku })}</p>
        )}
        {line.inscription ? (
          <p className="text-sm text-stone-700">
            {t('cart.line.inscription', { text: line.inscription })}
          </p>
        ) : null}
        <p className="text-sm text-stone-600">
          {t('cart.line.unitPrice')}: <Price amount={line.unitPrice} />
        </p>
        {notice}
      </div>

      <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
        <QuantityStepper
          label={t('cart.line.quantityOf', { name: line.productName })}
          value={line.quantity}
          max={Math.max(limit, 1)}
          disabled={busy || soldOut}
          onChange={onQuantity}
        />
        <p className="text-lg text-stone-900">
          <Price amount={line.lineTotal} />
        </p>
        <Button
          variant="ghost"
          disabled={busy}
          aria-label={t('cart.line.removeLabel', { name: line.productName })}
          onClick={onRemove}
        >
          {t('cart.line.remove')}
        </Button>
      </div>
    </li>
  );
}
