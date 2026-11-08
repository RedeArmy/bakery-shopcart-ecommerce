import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { DepositCard } from '../components/deposit-card';
import { ReviewList } from '../components/review-list';
import { SearchForm } from '../components/search-form';
import { StatusFilter } from '../components/status-filter';
import { useDepositQueue } from '../hooks/use-payment-review';
import { DEPOSIT_STATUSES, parseReviewQuery, reviewParams } from '../model/review';
import type { DepositStatus } from '../model/review';

const DEFAULT_STATUS: DepositStatus = 'UnderReview';

/**
 * La cola de depósitos para quien revisa pagos: los comprobantes en revisión, del más antiguo al más nuevo, para compararlos con
 * el banco y aprobarlos o rechazarlos con un motivo. El estado, el texto buscado y la página viven en la dirección. Las reglas
 * (monto distinto, intentos agotados) las decide el servidor y su resultado se muestra.
 */
export function DepositReviewPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const query = parseReviewQuery(params, DEPOSIT_STATUSES, DEFAULT_STATUS);
  const deposits = useDepositQueue(query.status, query.search, query.page);

  return (
    <ReviewList
      title={t('depositReview.title')}
      intro={t('depositReview.intro')}
      outcomesPrefix="depositReview.outcomes"
      toolbar={
        <div className="space-y-4">
          <StatusFilter
            label={t('depositReview.filter')}
            options={DEPOSIT_STATUSES}
            value={query.status}
            labelOf={(status) => t(`depositReview.filters.${status}`)}
            onChange={(status) => {
              setParams(reviewParams({ ...query, status, page: 1 }, DEFAULT_STATUS));
            }}
          />
          <SearchForm
            id="deposit-search"
            label={t('depositReview.search')}
            placeholder={t('depositReview.searchHint')}
            submitLabel={t('depositReview.searchSubmit')}
            value={query.search}
            onSearch={(search) => {
              setParams(reviewParams({ ...query, search, page: 1 }, DEFAULT_STATUS));
            }}
          />
        </div>
      }
      query={deposits}
      page={query.page}
      onPage={(page) => {
        setParams(reviewParams({ ...query, page }, DEFAULT_STATUS));
      }}
      empty={
        query.search === ''
          ? { title: t('depositReview.emptyTitle'), text: t('depositReview.emptyText') }
          : { title: t('depositReview.emptySearchTitle'), text: t('depositReview.emptySearchText') }
      }
      renderItem={(item, onOutcome) => (
        <DepositCard key={item.idPayment} item={item} onOutcome={onOutcome} />
      )}
    />
  );
}
