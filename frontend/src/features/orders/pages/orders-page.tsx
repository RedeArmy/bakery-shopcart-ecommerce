import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { hasAccount, useSession } from '../../../shared/auth';
import { ButtonLink } from '../../../shared/ui/button';
import { Pagination } from '../../../shared/ui/pagination';
import { Price } from '../../../shared/ui/price';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { OrderStatusBadge } from '../components/order-status-badge';
import { StatusFilter } from '../components/status-filter';
import { TrackOrder } from '../components/track-order';
import { useOrders } from '../hooks/use-orders';
import { PAGE_SIZE, displayStatus, parseOrdersQuery } from '../model/order-status';

/**
 * Los pedidos del cliente, en el orden que da el servidor, con filtro por estado y la página en la dirección. Dentro de una cuenta
 * es la página entera (con un mensaje si todavía no hay pedidos); a un invitado se le muestra debajo de la consulta y, sin pedidos,
 * no se muestra nada.
 */
function MyOrders({ inAccount }: Readonly<{ inAccount: boolean }>) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { page, status } = parseOrdersQuery(params);
  const { data, isPending, isError, error, refetch } = useOrders(page, status);

  const change = (next: { page?: number; status?: number | null }): void => {
    const target = new URLSearchParams();
    const nextStatus = next.status === undefined ? status : next.status;
    const nextPage = next.page ?? 1;
    if (nextStatus !== null) target.set('status', String(nextStatus));
    if (nextPage > 1) target.set('page', String(nextPage));
    setParams(target);
  };

  let content: ReactNode;
  if (isPending) {
    content = <LoadingSkeleton count={4} />;
  } else if (isError) {
    content = <ErrorState error={error} onRetry={() => void refetch()} />;
  } else if (data.items.length === 0) {
    content = (
      <EmptyState title={t('orders.emptyFilteredTitle')} text={t('orders.emptyFilteredText')} />
    );
  } else {
    content = (
      <>
        <ul className="space-y-3">
          {data.items.map((order) => (
            <li key={order.idOrder}>
              <Link
                to={`/orders/${String(order.idOrder)}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-stone-200 bg-white p-4 transition hover:border-accent"
              >
                <div className="space-y-1">
                  <p className="font-mono text-stone-900">{order.orderNumber}</p>
                  <p className="text-sm text-stone-600">
                    {order.createdAt === undefined ? null : formatDateTime(order.createdAt)}
                    {order.requestedDeliveryDate === undefined
                      ? null
                      : ` · ${t('orders.deliveryOn', { date: formatDateOnly(order.requestedDeliveryDate) })}`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <OrderStatusBadge
                    status={displayStatus(order.statusName, order.paymentStatusName)}
                  />
                  <Price amount={order.total} className="text-lg text-stone-900" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <Pagination
          page={page}
          pages={Math.ceil(data.total / PAGE_SIZE)}
          onChange={(next) => {
            change({ page: next });
          }}
        />
      </>
    );
  }

  const noOrdersYet = !isPending && !isError && data.items.length === 0 && status === null;
  // Un invitado sin pedidos no tiene lista que ver: le basta la consulta
  if (noOrdersYet && !inAccount) return null;
  if (noOrdersYet) {
    return (
      <EmptyState
        title={t('orders.emptyTitle')}
        text={t('orders.emptyText')}
        action={<ButtonLink to="/catalogue">{t('orders.browse')}</ButtonLink>}
      />
    );
  }

  return (
    <section aria-labelledby={inAccount ? undefined : 'orders-yours'} className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        {inAccount ? null : (
          <h2 id="orders-yours" className="text-3xl text-stone-900">
            {t('orders.yours')}
          </h2>
        )}
        <StatusFilter
          status={status}
          onChange={(next) => {
            change({ status: next });
          }}
        />
      </header>
      {content}
    </section>
  );
}

/**
 * Dentro de una cuenta es «Mis pedidos»: todos los pedidos realizados. Para cualquier otra persona (visitante o invitado) es
 * «Pedidos»: se escribe el número del pedido y el correo con el que se hizo y se ve su estado; un invitado ve además los
 * pedidos de su sesión.
 */
export function OrdersPage() {
  const { t } = useTranslation();
  const session = useSession();

  if (hasAccount(session)) {
    return (
      <div className="space-y-8">
        <h1 className="text-4xl text-stone-900">{t('orders.title')}</h1>
        <MyOrders inAccount />
      </div>
    );
  }
  return (
    <div className="space-y-12">
      <h1 className="text-4xl text-stone-900">{t('orders.publicTitle')}</h1>
      <TrackOrder />
      {session.user?.role === 'Customer' ? <MyOrders inAccount={false} /> : null}
    </div>
  );
}
