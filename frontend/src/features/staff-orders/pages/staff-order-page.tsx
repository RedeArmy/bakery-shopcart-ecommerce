import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { ButtonLink } from '../../../shared/ui/button';
import { Price } from '../../../shared/ui/price';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { CancelOrder } from '../../orders/components/cancel-order';
import { OrderFulfilment } from '../../orders/components/order-fulfilment';
import { OrderLines } from '../../orders/components/order-lines';
import { OrderStatusBadge } from '../../orders/components/order-status-badge';
import { OrderSummary } from '../../orders/components/order-summary';
import { OrderTimeline } from '../../orders/components/order-timeline';
import { canCancel, displayStatus } from '../../orders/model/order-status';
import { AdvanceStatus } from '../components/advance-status';
import { OrderPayments } from '../components/order-payments';
import { RegisterReturn } from '../components/register-return';
import { useRegisterReturn, useStaffOrder } from '../hooks/use-staff-orders';
import { canReturn, nextStep } from '../model/staff-orders';

/**
 * Un pedido para el personal: quién lo hizo, lo que lleva, cómo se recibe, sus pagos y su historial, con lo que se puede hacer
 * ahora: dar el siguiente paso, cancelarlo o registrar una devolución. Cada acción se ofrece solo cuando el estado la permite; si el
 * servidor la rechaza, su motivo se muestra.
 */
export function StaffOrderPage() {
  const { t } = useTranslation();
  const params = useParams();
  const idOrder = /^\d{1,9}$/.test(params['id'] ?? '') ? Number(params['id']) : null;
  const order = useStaffOrder(idOrder);
  // La devolución se registra desde la página y no desde su formulario: este desaparece cuando ya no queda nada por devolver
  const register = useRegisterReturn(idOrder ?? 0);
  const { reset } = register;
  // Al pasar a otro pedido no se queda el aviso del anterior
  useEffect(() => {
    reset();
  }, [idOrder, reset]);

  const notFound = (
    <EmptyState
      title={t('staffOrders.notFoundTitle')}
      text={t('staffOrders.notFoundText')}
      action={<ButtonLink to="/admin/orders">{t('staffOrders.back')}</ButtonLink>}
    />
  );
  if (idOrder === null) return notFound;
  if (order.isPending) return <LoadingSkeleton count={5} />;
  if (order.isError) {
    if (order.error instanceof ApiError && order.error.status === 404) return notFound;
    return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  }

  const data = order.data;
  const step = nextStep(data.statusName);

  return (
    <div className="space-y-8">
      <Link to="/admin/orders" className="text-sm text-accent hover:underline">
        {t('staffOrders.back')}
      </Link>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl text-stone-900">
            {t('orders.detailTitle', { number: data.orderNumber })}
          </h1>
          <OrderStatusBadge status={displayStatus(data.statusName, data.paymentStatusName)} />
        </div>
        <p className="text-stone-700">
          {data.customerName}
          {data.customerEmail ? ` · ${data.customerEmail}` : null}
        </p>
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
          <OrderPayments idOrder={idOrder} />
          {step === null ? null : <AdvanceStatus idOrder={idOrder} step={step} />}
          {canCancel(data.statusName) ? (
            <CancelOrder idOrder={idOrder} paid={data.statusName !== 'PendingPayment'} />
          ) : null}
          {canReturn(data.statusName) ? (
            <RegisterReturn lines={data.lines} register={register} />
          ) : null}
          {register.isSuccess ? (
            <output className="block rounded-card bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('staffOrders.return.done')} <Price amount={register.data.refundAmount} />
            </output>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
