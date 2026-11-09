import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../../shared/lib/date';
import { Badge } from '../../../shared/ui/badge';
import { Price } from '../../../shared/ui/price';
import { useStaffOrderPayments } from '../hooks/use-staff-orders';

const KNOWN_STATUSES = ['Pending', 'UnderReview', 'Approved', 'Rejected', 'Expired'];
const KNOWN_KINDS = ['Card', 'Deposit', 'Cash'];

/** Los intentos de pago del pedido, del más reciente al más antiguo: con qué método, cuánto y en qué estado quedó. */
export function OrderPayments({ idOrder }: Readonly<{ idOrder: number }>) {
  const { t } = useTranslation();
  const payments = useStaffOrderPayments(idOrder);

  return (
    <section
      aria-labelledby="order-payments"
      className="space-y-3 rounded-card border border-stone-200 bg-white p-5"
    >
      <h2 id="order-payments" className="text-xl text-stone-900">
        {t('staffOrders.payments.title')}
      </h2>
      {payments.isPending ? <p className="text-sm text-stone-600">{t('common.loading')}</p> : null}
      {payments.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {t('staffOrders.payments.failed')}
        </p>
      ) : null}
      {payments.data?.length === 0 ? (
        <p className="text-sm text-stone-600">{t('staffOrders.payments.none')}</p>
      ) : null}
      <ul className="space-y-3">
        {payments.data?.map((payment) => (
          <li key={payment.idPayment} className="space-y-1 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-stone-900">
                {payment.methodKind !== undefined && KNOWN_KINDS.includes(payment.methodKind)
                  ? t(`staffOrders.payments.kinds.${payment.methodKind}`)
                  : payment.methodCode}
              </span>
              <Badge tone={payment.statusName === 'Approved' ? 'success' : 'neutral'}>
                {KNOWN_STATUSES.includes(payment.statusName)
                  ? t(`staffOrders.payments.statuses.${payment.statusName}`)
                  : payment.statusName}
              </Badge>
            </div>
            <p className="text-stone-700">
              <Price amount={payment.amount} />
              {payment.createdAt === undefined ? null : ` · ${formatDateTime(payment.createdAt)}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
