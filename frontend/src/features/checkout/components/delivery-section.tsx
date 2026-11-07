import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { formatDateOnly } from '../../../shared/lib/date';
import { LoadingSkeleton } from '../../../shared/ui/states';
import type { PaymentMethodsView } from '../hooks/use-checkout';

/**
 * Para cuándo se quiere el pedido. El calendario no deja elegir un día anterior al primero que la cocina puede cumplir
 * (según el plazo del producto que más tarde en prepararse), que el servidor calcula; si aun así llegara una fecha corta,
 * el servidor la rechaza y aquí se explica.
 */
export function DeliverySection({
  date,
  onDate,
  view,
  loading,
  error,
}: Readonly<{
  date: string;
  onDate: (date: string) => void;
  view: PaymentMethodsView | undefined;
  loading: boolean;
  error: unknown;
}>) {
  const { t } = useTranslation();
  const earliest = view?.earliestDeliveryDate;
  const tooSoon = view?.deliveryDateAllowed === false;

  return (
    <section aria-labelledby="checkout-delivery" className="space-y-3">
      <h2 id="checkout-delivery" className="text-2xl text-stone-900">
        {t('checkout.delivery.title')}
      </h2>
      {loading && view === undefined ? <LoadingSkeleton count={1} /> : null}
      {earliest === undefined ? null : (
        <p className="text-sm text-stone-600">
          {t('checkout.delivery.earliest', { date: formatDateOnly(earliest) })}
        </p>
      )}
      <div className="max-w-xs space-y-1.5">
        <label htmlFor="delivery-date" className="block text-sm font-medium text-stone-800">
          {t('checkout.delivery.label')}
        </label>
        <input
          id="delivery-date"
          type="date"
          value={date}
          min={earliest}
          aria-invalid={tooSoon || undefined}
          aria-describedby={tooSoon ? 'delivery-date-error' : undefined}
          onChange={(event) => {
            onDate(event.target.value);
          }}
          className="block min-h-11 w-full rounded-control border border-stone-300 bg-white px-3 text-base text-stone-900 aria-[invalid=true]:border-red-700"
        />
        {tooSoon ? (
          <p id="delivery-date-error" role="alert" className="text-sm text-red-700">
            {t('errors.codes.DELIVERY_DATE_TOO_SOON')}
          </p>
        ) : null}
        {error === null || error === undefined ? null : (
          <p role="alert" className="text-sm text-red-700">
            {errorMessage(error)}
          </p>
        )}
      </div>
    </section>
  );
}
