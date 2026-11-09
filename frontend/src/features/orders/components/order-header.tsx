import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { displayStatus } from '../model/order-status';
import { OrderStatusBadge } from './order-status-badge';

type OrderDetail = components['schemas']['OrderDetail'];

/** El encabezado de un pedido: su número, su estado, cuándo se hizo y para cuándo es. `children` va entre el estado y las fechas. */
export function OrderHeader({
  order,
  children,
}: Readonly<{ order: OrderDetail; children?: ReactNode }>) {
  const { t } = useTranslation();
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-4xl text-stone-900">
          {t('orders.detailTitle', { number: order.orderNumber })}
        </h1>
        <OrderStatusBadge status={displayStatus(order.statusName, order.paymentStatusName)} />
      </div>
      {children}
      <p className="text-stone-600">
        {order.createdAt === undefined ? null : formatDateTime(order.createdAt)}
        {order.requestedDeliveryDate === undefined
          ? null
          : ` · ${t('orders.deliveryOn', { date: formatDateOnly(order.requestedDeliveryDate) })}`}
      </p>
    </header>
  );
}
