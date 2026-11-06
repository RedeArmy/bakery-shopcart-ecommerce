import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../../shared/lib/money/money';
import { Price } from '../../../shared/ui/price';
import { isZeroMoney } from '../model/cart-model';
import type { Cart } from '../model/cart-model';

/** Importes del carrito tal como los calculó la base de datos: aquí solo se muestran, nunca se suman. */
export function CartSummary({ cart }: Readonly<{ cart: Cart }>) {
  const { t } = useTranslation();
  const hasDiscount = !isZeroMoney(cart.discount);
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-stone-600">{t('cart.summary.subtotal')}</dt>
        <dd className="text-stone-900">
          <Price amount={cart.subtotal} />
        </dd>
      </div>
      {hasDiscount ? (
        <div className="flex justify-between gap-4">
          <dt className="text-stone-600">{t('cart.summary.discount')}</dt>
          <dd className="text-emerald-800">−{formatMoney(cart.discount)}</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-4 border-t border-stone-200 pt-3">
        <dt className="text-base font-medium text-stone-900">{t('cart.summary.total')}</dt>
        <dd className="text-2xl text-stone-900">
          <Price amount={cart.total} />
        </dd>
      </div>
      <p className="text-xs text-stone-500">
        {t('cart.summary.vatIncluded', { amount: formatMoney(cart.vat) })}
      </p>
    </dl>
  );
}
