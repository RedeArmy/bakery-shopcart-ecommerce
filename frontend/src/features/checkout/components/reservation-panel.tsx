import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { Countdown } from '../../../shared/ui/countdown';

export interface ActiveReservation {
  idReservation: number;
  expiresAt: string;
}

/**
 * Último paso: reservar las existencias (15 minutos) y confirmar el pedido. El reloj es el del servidor; al llegar a cero la
 * reserva se suelta y hay que reservar otra vez. Los dos botones se desactivan mientras su petición está en curso, para que
 * un doble clic no repita la operación.
 */
export function ReservationPanel({
  ready,
  reservation,
  reserving,
  confirming,
  error,
  onReserve,
  onConfirm,
  onExpire,
}: Readonly<{
  /** Hay dirección, fecha posible y cuenta bancaria elegidas */
  ready: boolean;
  reservation: ActiveReservation | null;
  reserving: boolean;
  confirming: boolean;
  error: unknown;
  onReserve: () => void;
  onConfirm: () => void;
  onExpire: () => void;
}>) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="checkout-confirm"
      className="space-y-4 rounded-card border border-stone-300 bg-white p-5"
    >
      <h2 id="checkout-confirm" className="text-2xl text-stone-900">
        {t('checkout.confirm.title')}
      </h2>
      {reservation === null ? (
        <>
          <p className="text-sm text-stone-600">{t('checkout.confirm.reserveText')}</p>
          <Button disabled={!ready} loading={reserving} onClick={onReserve}>
            {t('checkout.confirm.reserve')}
          </Button>
          {ready ? null : <p className="text-sm text-stone-500">{t('checkout.confirm.missing')}</p>}
        </>
      ) : (
        <>
          <p className="text-sm text-stone-700">
            {t('checkout.confirm.reserved')}{' '}
            <Countdown
              until={reservation.expiresAt}
              onExpire={onExpire}
              className="text-lg font-medium text-accent"
            />
          </p>
          <p className="text-sm text-stone-600">{t('checkout.confirm.confirmText')}</p>
          <Button loading={confirming} onClick={onConfirm}>
            {t('checkout.confirm.confirm')}
          </Button>
        </>
      )}
      {error === null || error === undefined ? null : (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}
