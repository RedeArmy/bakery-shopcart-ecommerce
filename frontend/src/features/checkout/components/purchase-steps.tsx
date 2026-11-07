import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../shared/api';
import { todayText } from '../../../shared/lib/date';
import type { Cart } from '../../cart/model/cart-model';
import { useConfirmOrder, usePaymentMethods, useReserveCart } from '../hooks/use-checkout';
import { AddressSection } from './address-section';
import { DeliverySection } from './delivery-section';
import { PaymentSection } from './payment-section';
import { ReservationPanel } from './reservation-panel';
import type { ActiveReservation } from './reservation-panel';

/** Lo que cambia el carrito de forma que importa al pago: productos, cantidades y personalización. */
const signatureOf = (cart: Cart): string =>
  cart.lines
    .map((line) => `${String(line.idVariant)}:${String(line.quantity)}:${line.inscription ?? ''}`)
    .join('|');

/**
 * Los pasos que son iguales para todos los compradores (con cuenta o invitados): dirección, fecha de entrega, depósito y la
 * reserva con su confirmación. Todo lo que se decide (primera fecha posible, si el depósito alcanza, la cuenta) lo dice el
 * servidor; aquí solo se elige y se muestra.
 */
export function PurchaseSteps({ cart }: Readonly<{ cart: Cart }>) {
  const navigate = useNavigate();
  const [idAddress, setIdAddress] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [idBank, setIdBank] = useState<number | null>(null);
  const [reservation, setReservation] = useState<ActiveReservation | null>(null);
  const [expired, setExpired] = useState(false);

  const signature = signatureOf(cart);
  const methods = usePaymentMethods(date === '' ? todayText() : date, signature);
  const reserve = useReserveCart();
  const confirm = useConfirmOrder();
  const view = methods.data;

  // La primera fecha posible queda elegida; el cliente puede pedir una posterior
  useEffect(() => {
    if (date === '' && view !== undefined) setDate(view.earliestDeliveryDate ?? view.deliveryDate);
  }, [view, date]);

  // Cambiar el carrito suelta la reserva en el servidor (la describe tal como estaba): aquí también se descarta
  useEffect(() => {
    setReservation(null);
  }, [signature]);

  const deposit = view?.methods.find((method) => method.method === 'BANK_DEPOSIT');
  const ready =
    idAddress !== null &&
    idBank !== null &&
    date !== '' &&
    view !== undefined &&
    !methods.isFetching &&
    view.deliveryDateAllowed !== false &&
    deposit?.available === true;

  const error =
    confirm.error ??
    reserve.error ??
    (expired ? new ApiError(409, 'RESERVATION_EXPIRED', 'The reservation expired') : null);

  return (
    <>
      <AddressSection selected={idAddress} onSelect={setIdAddress} />
      <DeliverySection
        date={date}
        onDate={setDate}
        view={view}
        loading={methods.isPending}
        error={methods.error}
      />
      <PaymentSection view={view} idBankAccount={idBank} onBank={setIdBank} />
      <ReservationPanel
        ready={ready}
        reservation={reservation}
        reserving={reserve.isPending}
        confirming={confirm.isPending}
        error={error}
        onReserve={() => {
          setExpired(false);
          confirm.reset();
          reserve.mutate(undefined, {
            onSuccess: (created) => {
              setReservation({
                idReservation: created.idReservation,
                expiresAt: created.expiresAt,
              });
            },
          });
        }}
        onConfirm={() => {
          if (reservation === null || idAddress === null || idBank === null) return;
          confirm.mutate(
            {
              idReservation: reservation.idReservation,
              idAddress,
              deliveryDate: date,
              idBankAccount: idBank,
            },
            {
              onSuccess: (order) => {
                void navigate(`/orders/${String(order.idOrder)}/payment`, { replace: true });
              },
            },
          );
        }}
        onExpire={() => {
          setReservation(null);
          setExpired(true);
        }}
      />
    </>
  );
}
