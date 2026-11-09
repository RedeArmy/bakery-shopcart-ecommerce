import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../../shared/ui/button';
import { StaffOrderItem } from '../../staff-orders/components/staff-order-item';
import { useStaffOrders } from '../../staff-orders/hooks/use-staff-orders';
import { staffOrdersParams } from '../../staff-orders/model/staff-orders';
import { ReportSection } from './report-section';

/** Cuántos pedidos se ven en el panel; el resto está en la lista completa. */
const SHOWN = 5;

/**
 * Los últimos pedidos del período, con un enlace a la lista completa con las mismas fechas (RF-08: el listado se filtra por
 * estado, cliente y rango de fechas, y esos filtros viven en la lista). Las fechas son las que resolvió el servidor.
 */
export function RecentOrders({ from, to }: Readonly<{ from: string; to: string }>) {
  const { t } = useTranslation();
  const report = useStaffOrders({ status: null, page: 1, search: '', from, to });
  const listParams = staffOrdersParams({ status: null, page: 1, search: '', from, to });

  return (
    <ReportSection
      id="recent-orders"
      title={t('dashboard.recent.title')}
      report={report}
      isEmpty={(data) => data.items.length === 0}
      emptyText={t('dashboard.recent.empty')}
    >
      {(data) => (
        <div className="space-y-4">
          <ul className="space-y-3">
            {data.items.slice(0, SHOWN).map((order) => (
              <StaffOrderItem key={order.idOrder} order={order} />
            ))}
          </ul>
          <ButtonLink to={`/admin/orders?${listParams.toString()}`} variant="secondary">
            {t('dashboard.recent.all')}
          </ButtonLink>
        </div>
      )}
    </ReportSection>
  );
}
