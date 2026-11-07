import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { ButtonLink } from '../../../shared/ui/button';
import { SelectField } from '../../../shared/ui/fields';
import { Pagination } from '../../../shared/ui/pagination';
import { Price } from '../../../shared/ui/price';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { OrderStatusBadge } from '../components/order-status-badge';
import { useOrders } from '../hooks/use-orders';
import { ORDER_STATUSES, PAGE_SIZE, parseOrdersQuery } from '../model/order-status';

/** Los pedidos del cliente, en el orden que da el servidor, con filtro por estado y la página en la dirección. */
export function OrdersPage() {
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
      <EmptyState
        title={status === null ? t('orders.emptyTitle') : t('orders.emptyFilteredTitle')}
        text={status === null ? t('orders.emptyText') : t('orders.emptyFilteredText')}
        action={<ButtonLink to="/catalogue">{t('orders.browse')}</ButtonLink>}
      />
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
                  <OrderStatusBadge status={order.statusName} />
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl text-stone-900">{t('orders.title')}</h1>
        <div className="w-full sm:w-64">
          <SelectField
            label={t('orders.filter')}
            value={status === null ? '' : String(status)}
            onChange={(event) => {
              change({ status: event.target.value === '' ? null : Number(event.target.value) });
            }}
          >
            <option value="">{t('orders.allStatuses')}</option>
            {ORDER_STATUSES.map((name, index) => (
              <option key={name} value={index + 1}>
                {t(`orders.status.${name}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </header>
      {content}
    </div>
  );
}
