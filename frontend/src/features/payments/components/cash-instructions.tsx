import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../../shared/lib/date';
import { Countdown } from '../../../shared/ui/countdown';
import { Price } from '../../../shared/ui/price';
import type { Payment } from '../hooks/use-payment';

/**
 * Lo que el cliente necesita para pagar en efectivo al recoger: dónde, cuánto y hasta cuándo. No hay comprobante que subir:
 * quien atiende en la sucursal confirma el cobro. El monto sale tal cual del API.
 */
export function CashInstructions({
  payment,
  orderNumber,
  branchName,
  branchAddress,
}: Readonly<{
  payment: Payment;
  orderNumber: string;
  branchName: string | null | undefined;
  branchAddress: string | null | undefined;
}>) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="cash-instructions"
      className="space-y-4 rounded-card border border-stone-200 bg-white p-5"
    >
      <h2 id="cash-instructions" className="text-2xl text-stone-900">
        {t('payment.cash.title')}
      </h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-stone-500">{t('payment.instructions.amount')}</dt>
          <dd className="text-2xl text-stone-900">
            <Price amount={payment.amount} />
          </dd>
        </div>
        <div>
          <dt className="text-stone-500">{t('payment.instructions.reference')}</dt>
          <dd className="select-all font-mono text-lg text-stone-900">{orderNumber}</dd>
        </div>
        {branchName ? (
          <div>
            <dt className="text-stone-500">{t('payment.cash.branch')}</dt>
            <dd className="text-stone-900">
              {branchName}
              {branchAddress ? (
                <>
                  <br />
                  {branchAddress}
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-stone-500">{t('payment.instructions.deadline')}</dt>
          <dd className="text-stone-900">
            {payment.expiresAt === undefined ? null : (
              <>
                {formatDateTime(payment.expiresAt)}
                {' · '}
                <Countdown until={payment.expiresAt} className="font-medium text-accent" />
              </>
            )}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-stone-600">{t('payment.cash.note')}</p>
    </section>
  );
}
