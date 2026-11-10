import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../../shared/ui/button';
import { useStaffOrderPayments } from '../hooks/use-staff-orders';

/**
 * Lleva a la pantalla donde se atiende el cobro de este pedido, con el pedido ya buscado: «Cobro en efectivo» si espera que se
 * cobre en caja y «Depósito» si espera que se apruebe su comprobante. Con cualquier otro estado no hay nada que gestionar y no
 * se ofrece.
 */
export function ManageOrder({ idOrder }: Readonly<{ idOrder: number }>) {
  const { t } = useTranslation();
  const payments = useStaffOrderPayments(idOrder);
  const list = payments.data ?? [];
  const cash = list.some((p) => p.methodKind === 'Cash' && p.statusName === 'Pending');
  const deposit = list.some((p) => p.methodKind === 'Deposit' && p.statusName === 'UnderReview');
  if (!cash && !deposit) return null;

  const path = cash ? '/admin/payments/cash' : '/admin/payments/deposits';
  return <ButtonLink to={`${path}?q=${String(idOrder)}`}>{t('staffOrders.manage')}</ButtonLink>;
}
