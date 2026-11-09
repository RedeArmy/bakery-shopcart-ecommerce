import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { Price } from '../../../shared/ui/price';
import { statusId } from '../model/dashboard';
import { KpiCard } from './kpi-card';

type DashboardSummary = components['schemas']['DashboardSummary'];

/**
 * Las cifras del período (ventas, devoluciones, pedidos, ticket promedio) y, aparte, lo que está pendiente ahora mismo, que no
 * depende del período. Las pendientes llevan a la pantalla donde se atienden.
 */
export function SummaryCards({ summary }: Readonly<{ summary: DashboardSummary }>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label={t('dashboard.kpi.net')} value={<Price amount={summary.net} />} />
        <KpiCard label={t('dashboard.kpi.gross')} value={<Price amount={summary.gross} />} />
        <KpiCard label={t('dashboard.kpi.returned')} value={<Price amount={summary.returned} />} />
        <KpiCard label={t('dashboard.kpi.orders')} value={summary.orders} />
        <KpiCard
          label={t('dashboard.kpi.ticket')}
          value={<Price amount={summary.averageTicket} />}
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium uppercase tracking-widest text-stone-500">
          {t('dashboard.kpi.now')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label={t('dashboard.kpi.pending')}
            value={summary.pendingPaymentOrders}
            to={`/admin/orders?status=${String(statusId('PendingPayment'))}`}
          />
          <KpiCard
            label={t('dashboard.kpi.deposits')}
            value={summary.depositsUnderReview}
            to="/admin/payments/deposits"
          />
          <KpiCard label={t('dashboard.kpi.abandoned')} value={summary.abandonedCarts} />
        </div>
      </div>
    </div>
  );
}
