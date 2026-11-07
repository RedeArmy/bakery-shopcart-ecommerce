import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../shared/i18n';
import { formatDateTime } from '../../../shared/lib/date';
import type { PaymentMethodsView } from '../hooks/use-checkout';

/** Texto en español del motivo por el que un método no se ofrece; un código nuevo cae en un mensaje genérico. */
const reasonText = (reason: string | null | undefined): string => {
  const key = `errors.codes.${reason ?? ''}`;
  return reason && i18n.exists(key) ? i18n.t(key) : i18n.t('checkout.payment.unavailable');
};

/**
 * Cómo se paga. Solo existe el depósito bancario: no hay pasarela de tarjeta, así que su oferta no se muestra. Si el
 * depósito no está disponible para la fecha (queda muy poco tiempo) se dice por qué y qué hacer. Con varias cuentas se elige
 * una; con una sola se muestra tal cual.
 */
export function PaymentSection({
  view,
  idBankAccount,
  onBank,
}: Readonly<{
  view: PaymentMethodsView | undefined;
  idBankAccount: number | null;
  onBank: (idBankAccount: number) => void;
}>) {
  const { t } = useTranslation();
  const deposit = view?.methods.find((method) => method.method === 'BANK_DEPOSIT');
  const accounts = view?.bankAccounts ?? [];

  // La primera cuenta queda elegida para no pedir un clic a quien solo tiene una
  useEffect(() => {
    if (idBankAccount === null && deposit?.available === true && accounts.length > 0) {
      onBank(accounts[0]?.idBankAccount ?? 0);
    }
  }, [deposit?.available, accounts.length, idBankAccount]);

  let body;
  if (view === undefined) {
    body = null;
  } else if (deposit?.available !== true) {
    body = (
      <output className="block rounded-control bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {reasonText(deposit?.reason)}
      </output>
    );
  } else {
    body = (
      <>
        <p className="text-sm text-stone-600">{t('checkout.payment.depositText')}</p>
        {deposit.deadlineAt ? (
          <p className="text-sm text-stone-600">
            {t('checkout.payment.deadline', { date: formatDateTime(deposit.deadlineAt) })}
          </p>
        ) : null}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-stone-800">
            {t('checkout.payment.account')}
          </legend>
          {accounts.map((account) => (
            <label
              key={account.idBankAccount}
              htmlFor={`bank-account-${String(account.idBankAccount)}`}
              className="flex cursor-pointer gap-3 rounded-card border border-stone-200 bg-white p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                id={`bank-account-${String(account.idBankAccount)}`}
                type="radio"
                name="bank-account"
                className="mt-1 accent-accent"
                checked={idBankAccount === account.idBankAccount}
                onChange={() => {
                  onBank(account.idBankAccount);
                }}
              />
              <span className="text-sm text-stone-800">
                <span className="block font-medium text-stone-900">{account.bankName}</span>
                <span className="block">
                  {t(`checkout.payment.accountType.${account.accountType}`)} ·{' '}
                  {account.accountNumber}
                </span>
                <span className="block text-stone-600">{account.holderName}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </>
    );
  }

  return (
    <section aria-labelledby="checkout-payment" className="space-y-3">
      <h2 id="checkout-payment" className="text-2xl text-stone-900">
        {t('checkout.payment.title')}
      </h2>
      {body}
    </section>
  );
}
