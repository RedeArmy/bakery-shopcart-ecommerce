import { useTranslation } from 'react-i18next';
import { Badge } from '../../../shared/ui/badge';
import { isKnownStatus, statusTone } from '../model/order-status';

/** El estado con palabras; un estado que esta versión no conoce se muestra tal como llega. */
export function OrderStatusBadge({ status }: Readonly<{ status: string }>) {
  const { t } = useTranslation();
  return (
    <Badge tone={statusTone(status)}>
      {isKnownStatus(status) ? t(`orders.status.${status}`) : status}
    </Badge>
  );
}
