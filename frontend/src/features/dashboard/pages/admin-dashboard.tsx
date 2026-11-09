import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CategorySalesList } from '../components/category-sales';
import { PeriodFilter } from '../components/period-filter';
import { RecentOrders } from '../components/recent-orders';
import { ReportSection } from '../components/report-section';
import { SalesChart } from '../components/sales-chart';
import { SummaryCards } from '../components/summary-cards';
import { TopProductsList } from '../components/top-products';
import {
  useDashboardSummary,
  useSales,
  useSalesByCategory,
  useTopProducts,
} from '../hooks/use-dashboard';
import { dashboardParams, isReversed, parseDashboardQuery } from '../model/dashboard';

/**
 * El panel del administrador (RF-08): ventas por día, semana o mes en quetzales y en pedidos, ventas por categoría, los diez
 * productos más vendidos y los pedidos del período, con lo que está pendiente ahora mismo. El período y la agrupación viven en la
 * dirección. Cada sección resuelve sus propios estados de carga, vacío y error.
 */
export function AdminDashboard() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const query = parseDashboardQuery(params);
  const range = { from: query.from, to: query.to };
  const summary = useDashboardSummary(range);
  const sales = useSales(range, query.granularity);
  const categories = useSalesByCategory(range);
  const top = useTopProducts(range);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('dashboard.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('dashboard.adminIntro')}</p>
      </header>
      <PeriodFilter
        query={query}
        onChange={(next) => {
          setParams(dashboardParams(next));
        }}
      />
      {isReversed(query) ? null : (
        <>
          <ReportSection
            id="summary"
            title={t('dashboard.summary.title')}
            report={summary}
            isEmpty={() => false}
            emptyText=""
          >
            {(data) => <SummaryCards summary={data} />}
          </ReportSection>
          <ReportSection
            id="sales"
            title={t('dashboard.sales.title')}
            report={sales}
            isEmpty={(data) => data.length === 0}
            emptyText={t('dashboard.sales.empty')}
          >
            {(data) => <SalesChart points={data} granularity={query.granularity} />}
          </ReportSection>
          <div className="grid gap-6 lg:grid-cols-2">
            <ReportSection
              id="categories"
              title={t('dashboard.categories.title')}
              report={categories}
              isEmpty={(data) => data.length === 0}
              emptyText={t('dashboard.categories.empty')}
            >
              {(data) => <CategorySalesList items={data} />}
            </ReportSection>
            <ReportSection
              id="top-products"
              title={t('dashboard.top.title')}
              report={top}
              isEmpty={(data) => data.length === 0}
              emptyText={t('dashboard.top.empty')}
            >
              {(data) => <TopProductsList items={data} />}
            </ReportSection>
          </div>
          {summary.data === undefined ? null : (
            <RecentOrders from={summary.data.fromDate} to={summary.data.toDate} />
          )}
        </>
      )}
    </div>
  );
}
