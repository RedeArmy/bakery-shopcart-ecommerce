import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';

type OrderDetail = components['schemas']['OrderDetail'];

/** Cómo se recibe el pedido: la sucursal donde se recoge o la dirección de entrega. */
export function OrderFulfilment({ order }: Readonly<{ order: OrderDetail }>) {
  const { t } = useTranslation();
  if (order.fulfilmentType === 'Pickup') {
    return (
      <section aria-labelledby="order-delivery" className="space-y-2">
        <h2 id="order-delivery" className="text-2xl text-stone-900">
          {t('orders.pickup')}
        </h2>
        <p className="text-stone-700">
          {order.pickupBranchName}
          <br />
          {order.pickupBranchAddress}
        </p>
      </section>
    );
  }
  if (!order.deliveryLine1) return null;
  return (
    <section aria-labelledby="order-delivery" className="space-y-2">
      <h2 id="order-delivery" className="text-2xl text-stone-900">
        {t('orders.delivery')}
      </h2>
      <p className="text-stone-700">
        {order.deliveryRecipient}
        {order.deliveryPhone ? ` · ${order.deliveryPhone}` : ''}
        <br />
        {order.deliveryLine1}
        <br />
        {order.deliveryMunicipality}, {order.deliveryDepartment}
      </p>
      {order.deliveryNotes ? (
        <p className="text-sm text-stone-600">
          {t('orders.deliveryNotes')}: {order.deliveryNotes}
        </p>
      ) : null}
    </section>
  );
}
