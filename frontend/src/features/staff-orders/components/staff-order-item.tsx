import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { components } from '../../../shared/api/generated/schema';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { Price } from '../../../shared/ui/price';
import { OrderStatusBadge } from '../../orders/components/order-status-badge';
import { displayStatus } from '../../orders/model/order-status';

type OrderSummary = components['schemas']['OrderSummary'];

/** Un pedido de la lista: quién lo hizo, cuándo, para cuándo es, su estado y su total. Lleva al detalle. */
export function StaffOrderItem({ order }: Readonly<{ order: OrderSummary }>) {
  const { t } = useTranslation();
  return (
    <li>
      <Link
        to={`/admin/orders/${String(order.idOrder)}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-stone-200 bg-white p-4 transition hover:border-accent"
      >
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-stone-900">{order.orderNumber}</p>
          <p className="truncate text-sm text-stone-700">
            {order.customerName}
            {order.customerEmail ? ` · ${order.customerEmail}` : null}
          </p>
          <p className="text-sm text-stone-600">
            {order.createdAt === undefined ? null : formatDateTime(order.createdAt)}
            {order.requestedDeliveryDate === undefined
              ? null
              : ` · ${t('orders.deliveryOn', { date: formatDateOnly(order.requestedDeliveryDate) })}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <OrderStatusBadge status={displayStatus(order.statusName, order.paymentStatusName)} />
          <Price amount={order.total} className="text-lg text-stone-900" />
        </div>
      </Link>
    </li>
  );
}
