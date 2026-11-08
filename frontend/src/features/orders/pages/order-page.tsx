import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { ButtonLink } from '../../../shared/ui/button';
import { Price } from '../../../shared/ui/price';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { useOrder } from '../../payments/hooks/use-payment';
import { CancelOrder } from '../components/cancel-order';
import { OrderStatusBadge } from '../components/order-status-badge';
import { PaymentNotice } from '../components/payment-notice';
import { OrderTimeline } from '../components/order-timeline';
import { canCancel, displayStatus } from '../model/order-status';

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

type OrderDetail = components['schemas']['OrderDetail'];

/** Cómo se recibe el pedido: la sucursal donde se recoge o la dirección de entrega. */
function Fulfilment({ order }: Readonly<{ order: OrderDetail }>) {
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
          <section aria-labelledby="order-lines" className="space-y-3">
            <h2 id="order-lines" className="text-2xl text-stone-900">
              {t('orders.lines')}
            </h2>
            <ul className="divide-y divide-stone-200 rounded-card border border-stone-200 bg-white">
              {data.lines.map((line) => (
                <li
                  key={line.idOrderLine}
                  className="flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="space-y-1">
                    <p className="text-stone-900">{line.productName ?? line.sku}</p>
                    {line.attributes ? (
                      <p className="text-sm text-stone-600">{line.attributes}</p>
                    ) : null}
                    {line.inscription ? (
                      <p className="text-sm text-stone-700">
                        {t('orders.inscription', { text: line.inscription })}
                      </p>
                    ) : null}
                    <p className="text-sm text-stone-600">
                      {t('orders.quantity', { count: line.quantity })} ·{' '}
                      <Price amount={line.unitPrice} />
                    </p>
                  </div>
                  <Price amount={line.lineTotal} className="text-stone-900" />
                </li>
              ))}
            </ul>
          </section>

          <Fulfilment order={data} />

          <OrderTimeline history={data.history} />
        </div>

        <aside className="space-y-4">
          <section
            aria-labelledby="order-summary"
            className="space-y-3 rounded-card border border-stone-200 bg-white p-5"
          >
            <h2 id="order-summary" className="text-xl text-stone-900">
              {t('orders.summary')}
            </h2>
            <dl className="space-y-2">
              <Row label={t('orders.subtotal')} amount={data.subtotal} />
              {isZero(data.discount) ? null : (
                <Row
                  label={t('orders.discount', { code: data.couponCode ?? '' })}
                  amount={data.discount}
                />
              )}
              <div className="flex items-baseline justify-between gap-4 border-t border-stone-200 pt-3">
                <dt className="text-stone-900">{t('orders.total')}</dt>
                <dd>
                  <Price amount={data.total} className="text-2xl text-stone-900" />
                </dd>
              </div>
              <Row label={t('orders.vat')} amount={data.vat} />
            </dl>
          </section>
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
