import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../shared/i18n';
import { formatDateTime } from '../../../shared/lib/date';
import { BankAccountsInfo } from '../../payments/components/bank-accounts-info';
import type { MethodOffer, PaymentMethodsView } from '../hooks/use-checkout';

/** Texto en español del motivo por el que un método no se ofrece; un código nuevo cae en un mensaje genérico. */
const reasonText = (reason: string | null | undefined): string => {
  const key = `errors.codes.${reason ?? ''}`;
  return reason && i18n.exists(key) ? i18n.t(key) : i18n.t('checkout.payment.unavailable');
};

/** Un método de pago como opción: su título y su descripción, y por qué no se puede elegir si no está disponible. */
function MethodOption({
  method,
  checked,
  onSelect,
}: Readonly<{ method: MethodOffer; checked: boolean; onSelect: () => void }>) {
  return (
    <li>
      <label
        className={`flex gap-3 border-b border-stone-200 p-4 last:border-b-0 ${method.available ? 'cursor-pointer' : 'cursor-not-allowed bg-stone-50 text-stone-500'} ${checked ? 'bg-amber-50' : ''}`}
      >
        <input
          type="radio"
          name="payment-method"
          className="mt-1 size-4 accent-accent"
          checked={checked}
          disabled={!method.available}
          onChange={onSelect}
        />
        <span className="space-y-1 text-sm">
          <span className="block text-base font-medium text-stone-900">{method.title}</span>
          {method.description ? <span className="block">{method.description}</span> : null}
          {method.available ? null : (
            <span className="block text-amber-900">{reasonText(method.reason)}</span>
          )}
        </span>
      </label>
    </li>
  );
}

/**
 * El método de pago: los que el administrador deja disponibles para cómo se recibe el pedido (el efectivo solo para
 * recogidas). El depósito puede no estar disponible si queda muy poco tiempo para la fecha; se dice por qué. Las cuentas
 * bancarias se muestran como información: no se eligen.
 */
export function PaymentSection({
  view,
  idMethod,
  onMethod,
}: Readonly<{
  view: PaymentMethodsView | undefined;
  idMethod: number | null;
  onMethod: (idPaymentMethod: number | null) => void;
}>) {
  const { t } = useTranslation();
  const methods = view?.methods ?? [];
  const chosen = methods.find((method) => method.idPaymentMethod === idMethod && method.available);

  // Si no hay un método válido elegido (al cargar o al cambiar la forma de recibir) queda elegido el primero disponible
  useEffect(() => {
    if (view === undefined || chosen !== undefined) return;
    onMethod(methods.find((method) => method.available)?.idPaymentMethod ?? null);
  }, [view, chosen, methods.length]);

  let detail = null;
  if (chosen?.kind === 'Deposit') {
    detail = (
      <>
        <p className="text-sm text-stone-600">{t('checkout.payment.depositText')}</p>
        {chosen.deadlineAt ? (
          <p className="text-sm text-stone-600">
            {t('checkout.payment.deadline', { date: formatDateTime(chosen.deadlineAt) })}
          </p>
        ) : null}
        <BankAccountsInfo accounts={view?.bankAccounts ?? []} />
      </>
    );
  } else if (chosen?.kind === 'Cash') {
    detail = <p className="text-sm text-stone-600">{t('checkout.payment.cashText')}</p>;
  }

  return (
    <section aria-labelledby="checkout-payment" className="space-y-3">
      <h2 id="checkout-payment" className="text-2xl text-stone-900">
        {t('checkout.payment.title')}
      </h2>
      {view !== undefined && methods.length === 0 ? (
        <output className="block rounded-control bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('checkout.payment.none')}
        </output>
      ) : null}
      {methods.length === 0 ? null : (
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('checkout.payment.methods')}</legend>
          <ul className="overflow-hidden rounded-card border border-stone-200 bg-white">
            {methods.map((method) => (
              <MethodOption
                key={method.idPaymentMethod}
                method={method}
                checked={method.idPaymentMethod === chosen?.idPaymentMethod}
                onSelect={() => {
                  onMethod(method.idPaymentMethod);
                }}
              />
            ))}
          </ul>
        </fieldset>
      )}
      {detail}
    </section>
  );
}
