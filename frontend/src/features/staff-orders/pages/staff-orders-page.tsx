import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Pagination } from '../../../shared/ui/pagination';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { StatusFilter } from '../../orders/components/status-filter';
import { SearchForm } from '../../payment-review/components/search-form';
import { StaffOrderItem } from '../components/staff-order-item';
import { useStaffOrders } from '../hooks/use-staff-orders';
import { PAGE_SIZE, parseStaffOrdersQuery, staffOrdersParams } from '../model/staff-orders';
import type { StaffOrdersQuery } from '../model/staff-orders';

/**
 * Los pedidos de todos los clientes para quien atiende: se filtran por estado y se buscan por número de pedido o correo. El
 * estado, el texto y la página viven en la dirección, así un enlace lleva a la misma lista.
 */
export function StaffOrdersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const query = parseStaffOrdersQuery(params);
  const { data, isPending, isError, error, refetch } = useStaffOrders(query);

  // Cambiar el estado o el texto vuelve a la primera página
  const change = (next: Partial<StaffOrdersQuery>): void => {
    setParams(staffOrdersParams({ ...query, page: 1, ...next }));
  };

  let content: ReactNode;
  if (isPending) {
    content = <LoadingSkeleton count={4} />;
  } else if (isError) {
    content = <ErrorState error={error} onRetry={() => void refetch()} />;
  } else if (data.items.length === 0) {
    content = <EmptyState title={t('staffOrders.emptyTitle')} text={t('staffOrders.emptyText')} />;
  } else {
    content = (
      <>
        <ul className="space-y-3">
          {data.items.map((order) => (
            <StaffOrderItem key={order.idOrder} order={order} />
          ))}
        </ul>
        <Pagination
          page={query.page}
          pages={Math.ceil(data.total / PAGE_SIZE)}
          onChange={(page) => {
            setParams(staffOrdersParams({ ...query, page }));
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('staffOrders.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('staffOrders.intro')}</p>
      </header>
      <div className="flex flex-wrap items-end gap-4">
        <StatusFilter
          status={query.status}
          onChange={(status) => {
            change({ status });
          }}
        />
        <SearchForm
          id="staff-orders-search"
          label={t('staffOrders.search')}
          placeholder={t('staffOrders.searchHint')}
          submitLabel={t('staffOrders.searchSubmit')}
          value={query.search}
          onSearch={(search) => {
            change({ search });
          }}
        />
      </div>
      {content}
    </div>
  );
}
