import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { api, unwrap } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { useSession } from '../../../shared/auth';
import type { AddressValues } from '../model/schemas';

export type Address = components['schemas']['Address'];
export type PaymentMethodsView = components['schemas']['PaymentMethodsView'];

/**
 * Una llave de idempotencia por intento: nace al abrir el paso y se reutiliza si el cliente reintenta, así repetir el envío
 * no crea dos reservas ni dos pedidos. Al lograrse la operación se renueva, porque la siguiente es otra.
 */
export function useIdempotencyKey() {
  const key = useRef(crypto.randomUUID());
  return {
    current: () => key.current,
    renew: () => {
      key.current = crypto.randomUUID();
    },
  };
}

/** Las direcciones del cliente (o del invitado). La clave lleva la cuenta: nunca se ven las de otra sesión. */
export function useAddresses() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['addresses', user?.idUser ?? null],
    enabled: user !== null,
    queryFn: async ({ signal }) => unwrap(await api.GET('/api/v1/addresses', { signal })),
  });
}

/** Agrega una dirección y devuelve su identificador; la lista se pide de nuevo. */
export function useCreateAddress() {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (values: AddressValues) => {
      const created = unwrap(
        await api.POST('/api/v1/addresses', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: {
            label: values.label,
            recipient: values.recipient,
            phone: values.phone,
            line1: values.line1,
            line2: values.line2 === '' ? null : values.line2,
            municipality: values.municipality,
            department: values.department,
            reference: values.reference === '' ? null : values.reference,
          },
        }),
      );
      key.renew();
      return created.idAddress;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

/**
 * Lo que ofrece el pago: la fecha estimada de entrega o recogida (la define el servidor según los productos del carrito, el
 * cliente no la elige), si el depósito alcanza y qué cuentas hay. Se pide de nuevo al cambiar el carrito.
 */
export function usePaymentMethods(cartSignature: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['payment-methods', user?.idUser ?? null, cartSignature],
    enabled: user !== null,
    staleTime: 0,
    queryFn: async ({ signal }) =>
      unwrap(await api.GET('/api/v1/checkout/payment-methods', { signal })),
  });
}

/** Reserva las existencias del carrito por 15 minutos. */
export function useReserveCart() {
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async () => {
      const reservation = unwrap(
        await api.POST('/api/v1/checkout/start', {
          params: { header: { 'Idempotency-Key': key.current() } },
        }),
      );
      key.renew();
      return reservation;
    },
  });
}

/** Cómo se recibe el pedido: en una dirección del cliente o recogiéndolo en una sucursal. */
export type Fulfilment =
  { type: 'Delivery'; idAddress: number } | { type: 'Pickup'; idBranch: number };

export interface ConfirmInput {
  idReservation: number;
  idBankAccount: number;
  fulfilment: Fulfilment;
}

/** Crea el pedido a pagar por depósito. Un reintento con la misma llave devuelve el mismo pedido. */
export function useConfirmOrder() {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (input: ConfirmInput) => {
      const order = unwrap(
        await api.POST('/api/v1/checkout/confirm', {
          params: { header: { 'Idempotency-Key': key.current() } },
          // La fecha no se envía: la define el sistema
          body: {
            idReservation: input.idReservation,
            idBankAccount: input.idBankAccount,
            method: 'BANK_DEPOSIT',
            fulfilmentType: input.fulfilment.type,
            idAddress: input.fulfilment.type === 'Delivery' ? input.fulfilment.idAddress : null,
            idBranch: input.fulfilment.type === 'Pickup' ? input.fulfilment.idBranch : null,
          },
        }),
      );
      key.renew();
      return order;
    },
    // El carrito se convirtió en pedido: lo que había en memoria ya no es de nadie
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}
