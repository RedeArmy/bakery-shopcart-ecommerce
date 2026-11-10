import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../../shared/ui/button';
import { PagedResults } from '../../../shared/ui/paged-results';
import { StatusFilter } from '../../payment-review/components/status-filter';
import { useCategories } from '../../catalogue/hooks/use-catalogue-queries';
import { CouponCard } from '../components/coupon-card';
import { CouponForm } from '../components/coupon-form';
import { useCoupons } from '../hooks/use-coupons';
import { categoryChoices } from '../../catalogue/model/categories';
import { FILTERS, PAGE_SIZE, couponsParams, parseCouponsQuery } from '../model/coupons';

/**
 * Los cupones (RF-07), solo para el administrador: se ven con su estado (vigente, aún no empieza, vencido, agotado o desactivado),
 * se crean, se editan y se desactivan. Por omisión se ven todos y se puede elegir ver solo los vigentes o solo los desactivados; un
 * desactivado se puede volver a activar o, si ningún pedido lo usó, borrar por completo. El filtro y la página viven en la
 * dirección, así un enlace lleva a la misma lista.
 */
export function CouponsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const query = parseCouponsQuery(params);
  const result = useCoupons(query);
  const categories = categoryChoices(useCategories().data ?? []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl text-stone-900">{t('coupons.title')}</h1>
          <p className="mt-1 max-w-2xl text-stone-600">{t('coupons.intro')}</p>
        </div>
        {adding ? null : (
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('coupons.add')}
          </Button>
        )}
      </header>
      {adding ? (
        <CouponForm
          onDone={() => {
            setAdding(false);
          }}
          onCancel={() => {
            setAdding(false);
          }}
        />
      ) : null}
      <StatusFilter
        label={t('coupons.filter')}
        options={FILTERS}
        value={query.filter}
        labelOf={(option) => t(`coupons.filters.${option}`)}
        onChange={(filter) => {
          setParams(couponsParams({ filter, page: 1 }));
        }}
      />
      <PagedResults
        prefix="coupons"
        result={result}
        page={query.page}
        pageSize={PAGE_SIZE}
        onPage={(page) => {
          setParams(couponsParams({ ...query, page }));
        }}
        renderItem={(coupon) => (
          <CouponCard
            key={coupon.idCoupon}
            coupon={coupon}
            categoryName={categories.find((category) => category.id === coupon.idCategory)?.name}
          />
        )}
      />
    </div>
  );
}
