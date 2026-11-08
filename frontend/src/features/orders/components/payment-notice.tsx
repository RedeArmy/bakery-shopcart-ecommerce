import { useTranslation } from 'react-i18next';
import { useOrderPayments } from '../../payments/hooks/use-payment';

/**
 * Qué se espera de un pedido pendiente de pago, según cómo se paga: un depósito sin comprobante espera el comprobante, uno con
 * comprobante espera que se verifique, y el efectivo espera que se pague en la sucursal. El método sale del pago más reciente;
 * mientras se consulta no se dice nada, para no mostrar primero el texto del depósito y luego cambiarlo.
 */
export function PaymentNotice({
  idOrder,
  paymentStatusName,
}: Readonly<{ idOrder: number; paymentStatusName: string | null | undefined }>) {
  const { t } = useTranslation();
  const payments = useOrderPayments(idOrder);
  // Si el pago no se pudo consultar se conserva el aviso del depósito, que es el caso corriente
  if (payments.isPending) return null;
  const current =
    payments.data?.find((payment) => payment.isCurrent === true) ?? payments.data?.[0];

  let key = 'orders.awaitingDeposit';
  if (current?.methodKind === 'Cash') key = 'orders.awaitingCash';
  else if (paymentStatusName === 'UnderReview') key = 'orders.verifyingDeposit';

  return <p className="rounded-card bg-amber-50 p-3 text-sm text-stone-700">{t(key)}</p>;
}
