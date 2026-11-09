import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { Price } from '../../../shared/ui/price';

type OrderDetail = components['schemas']['OrderDetail'];

/** Un importe del resumen: se muestra tal como llega, nunca se calcula con él. */
function Row({ label, amount }: Readonly<{ label: string; amount: string | undefined }>) {
  if (amount === undefined) return null;
  return (
    <div className="flex justify-between gap-4 text-sm text-stone-700">
      <dt>{label}</dt>
      <dd>
        <Price amount={amount} />
      </dd>
    </div>
  );
}

// Solo se mira si el texto del descuento es cero para no ocupar una línea vacía
const isZero = (amount: string | undefined): boolean =>
  amount === undefined || /^0+\.00$/.test(amount);

/** Los importes del pedido tal como los calculó el servidor: subtotal, descuento, total e IVA incluido. */
export function OrderSummary({ order }: Readonly<{ order: OrderDetail }>) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="order-summary"
      className="space-y-3 rounded-card border border-stone-200 bg-white p-5"
    >
      <h2 id="order-summary" className="text-xl text-stone-900">
        {t('orders.summary')}
      </h2>
      <dl className="space-y-2">
        <Row label={t('orders.subtotal')} amount={order.subtotal} />
        {isZero(order.discount) ? null : (
          <Row
            label={t('orders.discount', { code: order.couponCode ?? '' })}
            amount={order.discount}
          />
        )}
        <div className="flex items-baseline justify-between gap-4 border-t border-stone-200 pt-3">
          <dt className="text-stone-900">{t('orders.total')}</dt>
          <dd>
            <Price amount={order.total} className="text-2xl text-stone-900" />
          </dd>
        </div>
        <Row label={t('orders.vat')} amount={order.vat} />
      </dl>
    </section>
  );
}
