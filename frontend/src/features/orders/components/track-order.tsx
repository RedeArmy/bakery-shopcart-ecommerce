import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage } from '../../../shared/api';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useTrackOrder } from '../hooks/use-track-order';
import type { OrderTracking } from '../hooks/use-track-order';
import { trackSchema } from '../model/track-schema';
import type { TrackValues } from '../model/track-schema';
import { displayStatus } from '../model/order-status';
import { OrderStatusBadge } from './order-status-badge';
import { OrderTimeline } from './order-timeline';

/** Lo que se sabe del pedido consultado: su estado, cuándo se hizo, la fecha estimada y por dónde ha pasado. */
function TrackingResult({ order }: Readonly<{ order: OrderTracking }>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 rounded-card border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-xl text-stone-900">
          {t('orders.detailTitle', { number: order.orderNumber })}
        </h3>
        <OrderStatusBadge status={displayStatus(order.statusName, order.paymentStatusName)} />
      </div>
      <p className="text-sm text-stone-600">
        {order.createdAt === undefined ? null : formatDateTime(order.createdAt)}
        {order.requestedDeliveryDate === undefined
          ? null
          : ` · ${t('orders.deliveryOn', { date: formatDateOnly(order.requestedDeliveryDate) })}`}
      </p>
      {order.fulfilmentType === 'Pickup' && order.pickupBranchName ? (
        <p className="text-sm text-stone-700">
          {t('track.pickupAt', { name: order.pickupBranchName })}
        </p>
      ) : null}
      <OrderTimeline history={order.history} />
    </div>
  );
}

/**
 * Consulta pública del estado de un pedido, para cualquier persona con o sin cuenta: se escribe el número que se recibió al
 * comprar y el correo del pedido. Solo muestra el estado y las fechas, nunca datos personales; un correo que no es del pedido
 * se responde igual que un número que no existe.
 */
export function TrackOrder() {
  const { t } = useTranslation();
  const track = useTrackOrder();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrackValues>({
    resolver: zodResolver(trackSchema),
    defaultValues: { orderNumber: '', email: '' },
  });

  const notFound = track.error instanceof ApiError && track.error.status === 404;

  return (
    <section aria-labelledby="home-track" className="space-y-4">
      <div>
        <h2 id="home-track" className="text-3xl text-stone-900">
          {t('track.title')}
        </h2>
        <p className="mt-1 max-w-2xl text-stone-600">{t('track.text')}</p>
      </div>
      <form
        onSubmit={(event) =>
          void handleSubmit((values) => {
            track.mutate(values);
          })(event)
        }
        noValidate
        className="grid items-start gap-4 md:grid-cols-[1fr_1fr_auto]"
      >
        <TextField
          label={t('track.fields.orderNumber')}
          hint={t('track.hint')}
          autoComplete="off"
          error={fieldError(t, errors.orderNumber?.message)}
          {...register('orderNumber')}
        />
        <TextField
          label={t('track.fields.email')}
          type="email"
          autoComplete="email"
          error={fieldError(t, errors.email?.message)}
          {...register('email')}
        />
        <div className="md:pt-7">
          <Button type="submit" loading={track.isPending}>
            {t('track.submit')}
          </Button>
        </div>
      </form>
      {track.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {notFound ? t('track.notFound') : errorMessage(track.error)}
        </p>
      ) : null}
      {track.data === undefined ? null : <TrackingResult order={track.data} />}
    </section>
  );
}
