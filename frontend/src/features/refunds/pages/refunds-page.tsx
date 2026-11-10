import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PagedResults } from '../../../shared/ui/paged-results';
import { StatusFilter } from '../../payment-review/components/status-filter';
import { RefundCard } from '../components/refund-card';
import { useRefunds } from '../hooks/use-refunds';
import { FILTERS, LIMIT, parseRefundFilter, refundParams } from '../model/refunds';

/**
 * Los reembolsos (RF-06), solo para el administrador: el dinero que hay que devolver por un pedido cancelado o una devolución.
 * Por omisión se ven los que esperan; se pueden ver también los fallidos, los procesados o todos. El estado vive en la dirección.
 */
export function RefundsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filter = parseRefundFilter(params);
  const result = useRefunds(filter);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('refunds.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('refunds.intro')}</p>
      </header>
      <StatusFilter
        label={t('refunds.filter')}
        options={FILTERS}
        value={filter}
        labelOf={(option) => t(`refunds.filters.${option}`)}
        onChange={(option) => {
          setParams(refundParams(option));
        }}
      />
      <PagedResults
        prefix="refunds"
        result={result}
        page={1}
        pageSize={LIMIT}
        onPage={() => undefined}
        renderItem={(refund) => <RefundCard key={refund.idRefund} refund={refund} />}
      />
      {result.data !== undefined && result.data.total >= LIMIT ? (
        <p className="text-sm text-stone-600">{t('refunds.limitNote', { count: LIMIT })}</p>
      ) : null}
    </div>
  );
}
