import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../../shared/lib/date';
import { Countdown } from '../../../shared/ui/countdown';
import { Price } from '../../../shared/ui/price';
import { useBankAccounts } from '../hooks/use-payment';
import type { Payment } from '../hooks/use-payment';
import { BankAccountsInfo } from './bank-accounts-info';

/**
 * Lo que el cliente necesita para depositar: la cuenta, el monto exacto, la referencia (el número del pedido) y el plazo.
 * El monto sale tal cual del API: nunca se calcula aquí.
 */
export function DepositInstructions({
  payment,
  orderNumber,
  running,
}: Readonly<{ payment: Payment; orderNumber: string; running: boolean }>) {
  const { t } = useTranslation();
  const accounts = useBankAccounts();
  return (
    <section
      aria-labelledby="deposit-instructions"
      className="space-y-4 rounded-card border border-stone-200 bg-white p-5"
    >
      <h2 id="deposit-instructions" className="text-2xl text-stone-900">
        {t('payment.instructions.title')}
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
        <div>
          <dt className="text-stone-500">{t('payment.instructions.deadline')}</dt>
          <dd className="text-stone-900">
            {payment.expiresAt === undefined ? null : (
              <>
                {formatDateTime(payment.expiresAt)}
                {running ? (
                  <>
                    {' · '}
                    <Countdown until={payment.expiresAt} className="font-medium text-accent" />
                  </>
                ) : null}
              </>
            )}
          </dd>
        </div>
      </dl>
      {accounts.isError ? null : <BankAccountsInfo accounts={accounts.data ?? []} />}
      <p className="text-sm text-stone-600">{t('payment.instructions.note')}</p>
    </section>
  );
}
