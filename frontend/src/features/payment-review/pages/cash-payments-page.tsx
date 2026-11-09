import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CashCard } from '../components/cash-card';
import { ReviewList } from '../components/review-list';
import { SearchForm } from '../components/search-form';
import { StatusFilter } from '../components/status-filter';
import { useCashQueue } from '../hooks/use-payment-review';
import { CASH_STATUSES, parseReviewQuery, reviewParams } from '../model/review';
import type { CashStatus } from '../model/review';

const DEFAULT_STATUS: CashStatus = 'Pending';

/**
 * Los cobros en efectivo para quien atiende en la sucursal: el cliente llega con su número de pedido, se busca aquí, se cobra
 * en caja y se confirma. El estado, el texto buscado y la página viven en la dirección.
 */
export function CashPaymentsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const query = parseReviewQuery(params, CASH_STATUSES, DEFAULT_STATUS);
  const cash = useCashQueue(query.status, query.search, query.page);

  return (
    <ReviewList
      title={t('cashPayments.title')}
      intro={t('cashPayments.intro')}
      outcomesPrefix="cashPayments.outcomes"
      toolbar={
        <div className="space-y-4">
          <StatusFilter
            label={t('cashPayments.filter')}
            options={CASH_STATUSES}
            value={query.status}
            labelOf={(status) => t(`cashPayments.filters.${status}`)}
            onChange={(status) => {
              setParams(reviewParams({ ...query, status, page: 1 }, DEFAULT_STATUS));
            }}
          />
          <SearchForm
            id="cash-search"
            label={t('cashPayments.search')}
            placeholder={t('cashPayments.searchHint')}
            submitLabel={t('cashPayments.searchSubmit')}
            value={query.search}
            onSearch={(search) => {
              setParams(reviewParams({ ...query, search, page: 1 }, DEFAULT_STATUS));
            }}
          />
        </div>
      }
      query={cash}
      page={query.page}
      onPage={(page) => {
        setParams(reviewParams({ ...query, page }, DEFAULT_STATUS));
      }}
      empty={
        query.search === ''
          ? { title: t('cashPayments.emptyTitle'), text: t('cashPayments.emptyText') }
          : { title: t('cashPayments.emptySearchTitle'), text: t('cashPayments.emptySearchText') }
      }
      renderItem={(item, onOutcome) => (
        <CashCard key={item.idPayment} item={item} onOutcome={onOutcome} />
      )}
    />
  );
}
