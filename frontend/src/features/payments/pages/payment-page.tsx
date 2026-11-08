import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api';
import { formatDateOnly } from '../../../shared/lib/date';
import { ButtonLink } from '../../../shared/ui/button';
import { Price } from '../../../shared/ui/price';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { CheckoutStepper } from '../../checkout/components/checkout-stepper';
import { CashInstructions } from '../components/cash-instructions';
import { DepositInstructions } from '../components/deposit-instructions';
import { PaymentStatus } from '../components/payment-status';
import { ProofForm } from '../components/proof-form';
import { useOrder, useOrderPayments, type Payment } from '../hooks/use-payment';

/** Lo que el cliente debe hacer mientras el pago espera: pagar en la sucursal si es efectivo, o depositar y subir el comprobante. */
function PaymentInstructions({
  idOrder,
  payment,
  orderNumber,
  branchName,
  branchAddress,
}: Readonly<{
  idOrder: number;
  payment: Payment;
  orderNumber: string;
  branchName: string | null | undefined;
  branchAddress: string | null | undefined;
}>) {
  if (payment.methodKind === 'Cash') {
    return (
      <CashInstructions
        payment={payment}
        orderNumber={orderNumber}
        branchName={branchName}
        branchAddress={branchAddress}
      />
    );
  }
  return (
    <>
      <DepositInstructions payment={payment} orderNumber={orderNumber} running />
      <ProofForm idOrder={idOrder} amount={payment.amount} />
    </>
  );
}

/**
 * Pantalla del pedido recién creado y de su pago por depósito: las instrucciones, el comprobante y el estado. Se vuelve a
 * consultar mientras el pago espera, así el cliente ve cuándo una persona lo revisa. Un pedido ajeno responde como uno que no
 * existe.
 */
export function PaymentPage() {
  const { t } = useTranslation();
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
      <CheckoutStepper current={3} />
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
              <PaymentInstructions
                idOrder={idOrder}
                payment={current}
                orderNumber={data.orderNumber}
                branchName={data.pickupBranchName}
                branchAddress={data.pickupBranchAddress}
              />
            ) : null}
          </div>
          <aside className="space-y-4">
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
