import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { ButtonLink } from '../../../shared/ui/button';
import { StaffOrderItem } from '../../staff-orders/components/staff-order-item';
import { ReportSection } from './report-section';

type OrdersPage = { items: components['schemas']['OrderSummary'][]; total: number };

/** Cuántos pedidos de la cola se ven en el panel; el resto está en la lista, con su estado ya elegido. */
const SHOWN = 5;

/** Una cola de pedidos del operador: los primeros por atender y un enlace a la lista de ese estado. */
export function OrderQueue({
  id,
  title,
  status,
  report,
}: Readonly<{ id: string; title: string; status: number; report: UseQueryResult<OrdersPage> }>) {
  const { t } = useTranslation();
  return (
    <ReportSection
      id={id}
      title={title}
      report={report}
      isEmpty={(data) => data.items.length === 0}
      emptyText={t('dashboard.queue.empty')}
    >
      {(data) => (
        <div className="space-y-4">
          <ul className="space-y-3">
            {data.items.slice(0, SHOWN).map((order) => (
              <StaffOrderItem key={order.idOrder} order={order} />
            ))}
          </ul>
          <ButtonLink to={`/admin/orders?status=${String(status)}`} variant="secondary">
            {t('dashboard.queue.viewAll')} ({data.total})
          </ButtonLink>
        </div>
      )}
    </ReportSection>
  );
}
