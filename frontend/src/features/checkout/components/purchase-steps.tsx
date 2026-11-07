import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../shared/api';
import { useBranches } from '../../branches/hooks/use-branches';
import type { Cart } from '../../cart/model/cart-model';
import { useConfirmOrder, usePaymentMethods, useReserveCart } from '../hooks/use-checkout';
import type { Fulfilment } from '../hooks/use-checkout';
import { AddressSection } from './address-section';
import { DELIVERY_CHOICE, FulfilmentSection } from './fulfilment-section';
import { PaymentSection } from './payment-section';
import { ReservationPanel } from './reservation-panel';
import type { ActiveReservation } from './reservation-panel';

/** Lo que cambia el carrito de forma que importa al pago: productos, cantidades y personalización. */
const signatureOf = (cart: Cart): string =>
  cart.lines
    .map((line) => `${String(line.idVariant)}:${String(line.quantity)}:${line.inscription ?? ''}`)
    .join('|');

/**
 * Los pasos que son iguales para todos los compradores (con cuenta o invitados): cómo se recibe el pedido (entrega a
 * domicilio con su dirección, o recogida en una sucursal sin dirección), el depósito y la reserva con su confirmación. Todo
 * lo que se decide (la fecha estimada, si el depósito alcanza, la cuenta) lo dice el servidor; aquí solo se elige y se muestra.
 */
export function PurchaseSteps({ cart }: Readonly<{ cart: Cart }>) {
  const navigate = useNavigate();
  const [choice, setChoice] = useState(DELIVERY_CHOICE);
  const [idAddress, setIdAddress] = useState<number | null>(null);
  const [idBank, setIdBank] = useState<number | null>(null);
  const [reservation, setReservation] = useState<ActiveReservation | null>(null);
  const [expired, setExpired] = useState(false);

  const signature = signatureOf(cart);
  const branches = useBranches();
  const methods = usePaymentMethods(signature);
  const reserve = useReserveCart();
  const confirm = useConfirmOrder();
  const view = methods.data;

  // Si la sucursal elegida deja de ofrecerse mientras se compra, se vuelve a la entrega a domicilio
  useEffect(() => {
    if (
      choice !== DELIVERY_CHOICE &&
      branches.data !== undefined &&
      !branches.data.some((branch) => String(branch.idBranch) === choice)
    ) {
      setChoice(DELIVERY_CHOICE);
    }
  }, [branches.data, choice]);

  // Cambiar el carrito suelta la reserva en el servidor (la describe tal como estaba): aquí también se descarta
  useEffect(() => {
    setReservation(null);
  }, [signature]);

  const deposit = view?.methods.find((method) => method.method === 'BANK_DEPOSIT');

  let fulfilment: Fulfilment | null = null;
  if (choice !== DELIVERY_CHOICE) fulfilment = { type: 'Pickup', idBranch: Number(choice) };
  else if (idAddress !== null) fulfilment = { type: 'Delivery', idAddress };

  const ready =
    fulfilment !== null &&
    idBank !== null &&
    view !== undefined &&
    !methods.isFetching &&
    deposit?.available === true;

  const error =
    confirm.error ??
    reserve.error ??
    (expired ? new ApiError(409, 'RESERVATION_EXPIRED', 'The reservation expired') : null);

  return (
    <>
      <FulfilmentSection
        choice={choice}
        onChoice={setChoice}
        branches={branches.data ?? []}
        branchesLoading={branches.isPending}
        branchesError={branches.error}
        view={view}
        viewLoading={methods.isPending}
        viewError={methods.error}
      />
      {choice === DELIVERY_CHOICE ? (
        <AddressSection selected={idAddress} onSelect={setIdAddress} />
      ) : null}
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
          if (reservation === null || fulfilment === null || idBank === null) return;
          confirm.mutate(
            { idReservation: reservation.idReservation, idBankAccount: idBank, fulfilment },
            {
              onSuccess: (order) => {
                void navigate(`/orders/${String(order.idOrder)}/payment`, { replace: true });
              },
              // Si el servidor dice que la reserva venció, ya no hay nada que confirmar: se vuelve a reservar
              onError: (failure) => {
                if (failure instanceof ApiError && failure.code === 'RESERVATION_EXPIRED') {
                  setReservation(null);
                }
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
