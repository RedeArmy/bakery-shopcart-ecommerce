import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api';
import { isGuestSession, useSession } from '../../../shared/auth';
import { formatDateOnly } from '../../../shared/lib/date';
import { ButtonLink } from '../../../shared/ui/button';
import { Price } from '../../../shared/ui/price';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { RecoveryCodePanel } from '../../checkout/components/recovery-code-panel';
import { DepositInstructions } from '../components/deposit-instructions';
import { PaymentStatus } from '../components/payment-status';
import { ProofForm } from '../components/proof-form';
import { useOrder, useOrderPayments } from '../hooks/use-payment';

/**
 * Pantalla del pedido recién creado y de su pago por depósito: las instrucciones, el comprobante y el estado. Se vuelve a
 * consultar mientras el pago espera, así el cliente ve cuándo una persona lo revisa. Un pedido ajeno responde como uno que no
 * existe.
 */
export function PaymentPage() {
  const { t } = useTranslation();
  const session = useSession();
  const params = useParams();
  const idOrder = /^\d{1,9}$/.test(params['id'] ?? '') ? Number(params['id']) : null;
  const order = useOrder(idOrder ?? 0);
  const payments = useOrderPayments(idOrder ?? 0);

  const notFound = (
    <EmptyState
      title={t('payment.notFoundTitle')}
      text={t('payment.notFoundText')}
      action={<ButtonLink to="/catalogue">{t('states.backHome')}</ButtonLink>}
    />
  );
  if (idOrder === null) return notFound;
  if (order.isPending || payments.isPending) return <LoadingSkeleton count={6} />;
  if (order.isError) {
    if (order.error instanceof ApiError && order.error.status === 404) return notFound;
    return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  }
  if (payments.isError) {
    return <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />;
  }

  const data = order.data;
  const current = payments.data.find((payment) => payment.isCurrent === true) ?? payments.data[0];
  const waiting = current?.statusName === 'Pending';

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          {t('payment.eyebrow')}
        </p>
        <h1 className="text-4xl text-stone-900">
          {t('payment.title', { number: data.orderNumber })}
        </h1>
        <p className="text-stone-600">
          {t('payment.summary', {
            date:
              data.requestedDeliveryDate === undefined
                ? ''
                : formatDateOnly(data.requestedDeliveryDate),
          })}{' '}
          <Price amount={data.total} />
        </p>
      </header>

      {current === undefined ? null : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
          <div className="space-y-6">
            <PaymentStatus idOrder={idOrder} payment={current} />
            {waiting ? (
              <>
                <DepositInstructions payment={current} orderNumber={data.orderNumber} running />
                <ProofForm idOrder={idOrder} amount={current.amount} />
              </>
            ) : null}
          </div>
          <aside className="space-y-4">
            {isGuestSession(session) ? <RecoveryCodePanel /> : null}
            <Link
              to={`/orders/${String(idOrder)}`}
              className="block text-sm text-accent hover:underline"
            >
              {t('payment.viewOrder')}
            </Link>
            <Link to="/catalogue" className="block text-sm text-accent hover:underline">
              {t('payment.keepShopping')}
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
