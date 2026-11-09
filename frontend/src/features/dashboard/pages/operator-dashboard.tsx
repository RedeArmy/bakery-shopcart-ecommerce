import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ORDER_STATUSES } from '../../orders/model/order-status';
import { useCashQueue, useDepositQueue } from '../../payment-review/hooks/use-payment-review';
import { useStaffOrders } from '../../staff-orders/hooks/use-staff-orders';
import type { StaffOrdersQuery } from '../../staff-orders/model/staff-orders';
import { DashboardHeader } from '../components/dashboard-header';
import { KpiCard } from '../components/kpi-card';
import { OrderQueue } from '../components/order-queue';
import { statusId } from '../model/dashboard';

const queueOf = (name: (typeof ORDER_STATUSES)[number]): StaffOrdersQuery => ({
  status: statusId(name),
  page: 1,
  search: '',
  from: null,
  to: null,
});

/** El total de una cola mientras llega; si no se pudo leer se ve una raya, y la sección de abajo explica el error. */
const totalOf = (report: UseQueryResult<{ total: number }>): string =>
  report.data === undefined ? '—' : String(report.data.total);

/**
 * El panel del operador: lo que hay que atender ahora, sin reportes de ventas (esos son del administrador). Cinco cifras de
 * trabajo que llevan a su pantalla y las dos colas de pedidos: los pagados que esperan preparación y los despachados que
 * esperan entrega. Se arma con las mismas consultas de las pantallas de pedidos y de pagos.
 */
export function OperatorDashboard() {
  const { t } = useTranslation();
  const toPrepare = useStaffOrders(queueOf('Paid'));
  const inPreparation = useStaffOrders(queueOf('InPreparation'));
  const dispatched = useStaffOrders(queueOf('Dispatched'));
  const deposits = useDepositQueue('UnderReview', '', 1);
  const cash = useCashQueue('Pending', '', 1);

  return (
    <div className="space-y-6">
      <DashboardHeader intro={t('dashboard.operatorIntro')} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label={t('dashboard.queue.toPrepare')}
          value={totalOf(toPrepare)}
          hint={t('dashboard.queue.toPrepareHint')}
          to={`/admin/orders?status=${String(statusId('Paid'))}`}
        />
        <KpiCard
          label={t('dashboard.queue.inPreparation')}
          value={totalOf(inPreparation)}
          to={`/admin/orders?status=${String(statusId('InPreparation'))}`}
        />
        <KpiCard
          label={t('dashboard.queue.dispatched')}
          value={totalOf(dispatched)}
          hint={t('dashboard.queue.dispatchedHint')}
          to={`/admin/orders?status=${String(statusId('Dispatched'))}`}
        />
        <KpiCard
          label={t('dashboard.queue.deposits')}
          value={totalOf(deposits)}
          to="/admin/payments/deposits"
        />
        <KpiCard
          label={t('dashboard.queue.cash')}
          value={totalOf(cash)}
          to="/admin/payments/cash"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <OrderQueue
          id="to-prepare"
          title={t('dashboard.queue.toPrepare')}
          status={statusId('Paid')}
          report={toPrepare}
        />
        <OrderQueue
          id="dispatched"
          title={t('dashboard.queue.dispatched')}
          status={statusId('Dispatched')}
          report={dispatched}
        />
      </div>
    </div>
  );
}
