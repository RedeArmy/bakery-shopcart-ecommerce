import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { ButtonLink } from '../../../shared/ui/button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { useOrder } from '../../payments/hooks/use-payment';
import { CancelOrder } from '../components/cancel-order';
import { OrderFulfilment } from '../components/order-fulfilment';
import { OrderLines } from '../components/order-lines';
import { OrderStatusBadge } from '../components/order-status-badge';
import { OrderSummary } from '../components/order-summary';
import { OrderTimeline } from '../components/order-timeline';
import { PaymentNotice } from '../components/payment-notice';
import { canCancel, displayStatus } from '../model/order-status';

/** El pedido con sus productos, su entrega, el historial y, mientras se puede, la cancelación. Uno ajeno responde 404. */
export function OrderPage() {
  const { t } = useTranslation();
  const params = useParams();
  const idOrder = /^\d{1,9}$/.test(params['id'] ?? '') ? Number(params['id']) : null;
  const order = useOrder(idOrder ?? 0);

  const notFound = (
    <EmptyState
      title={t('orders.notFoundTitle')}
      text={t('orders.notFoundText')}
      action={<ButtonLink to="/orders">{t('orders.back')}</ButtonLink>}
    />
  );
  if (idOrder === null) return notFound;
  if (order.isPending) return <LoadingSkeleton count={5} />;
  if (order.isError) {
    if (order.error instanceof ApiError && order.error.status === 404) return notFound;
    return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  }

  const data = order.data;
  const waiting = data.statusName === 'PendingPayment';

  return (
    <div className="space-y-8">
      <Link to="/orders" className="text-sm text-accent hover:underline">
        {t('orders.back')}
      </Link>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl text-stone-900">
            {t('orders.detailTitle', { number: data.orderNumber })}
          </h1>
          <OrderStatusBadge status={displayStatus(data.statusName, data.paymentStatusName)} />
        </div>
        <p className="text-stone-600">
          {data.createdAt === undefined ? null : formatDateTime(data.createdAt)}
          {data.requestedDeliveryDate === undefined
            ? null
            : ` · ${t('orders.deliveryOn', { date: formatDateOnly(data.requestedDeliveryDate) })}`}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-6">
          <OrderLines lines={data.lines} />
          <OrderFulfilment order={data} />
          <OrderTimeline history={data.history} />
        </div>

        <aside className="space-y-4">
          <OrderSummary order={data} />
          {waiting ? (
            <PaymentNotice idOrder={idOrder} paymentStatusName={data.paymentStatusName} />
          ) : null}
          {waiting ? (
            <ButtonLink to={`/orders/${String(idOrder)}/payment`} className="w-full">
              {t('orders.pay')}
            </ButtonLink>
          ) : null}
          {canCancel(data.statusName) ? <CancelOrder idOrder={idOrder} paid={!waiting} /> : null}
        </aside>
      </div>
    </div>
  );
}
