import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { dayEnd, dayStart, isReversedRange } from '../../../shared/lib/date';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PAGE_SIZE } from '../model/staff-orders';
import type { NextStep, StaffOrdersQuery } from '../model/staff-orders';

/** Una página de los pedidos de todos los clientes, con el estado y el texto buscado. La clave lleva la sesión del personal. */
export function useStaffOrders(query: StaffOrdersQuery) {
  const { user } = useSession();
  return useQuery({
    queryKey: [
      'staff-orders',
      user?.idUser ?? null,
      query.status,
      query.search,
      query.from,
      query.to,
      query.page,
    ],
    enabled: user !== null && !isReversedRange(query.from, query.to),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/orders', {
          params: {
            query: {
              page: query.page,
              size: PAGE_SIZE,
              ...(query.status === null ? {} : { status: query.status }),
              ...(query.search === '' ? {} : { search: query.search }),
              ...(query.from === null ? {} : { from: dayStart(query.from) }),
              ...(query.to === null ? {} : { to: dayEnd(query.to) }),
            },
          },
          signal,
        }),
      ),
  });
}

/** Cualquier pedido, con sus productos y su historial. Sin un identificador válido no pregunta nada al servidor. */
export function useStaffOrder(idOrder: number | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['staff-order', user?.idUser ?? null, idOrder],
    enabled: user !== null && idOrder !== null,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/orders/{id}', {
          params: { path: { id: idOrder ?? 0 } },
          signal,
        }),
      ),
  });
}

/** Los intentos de pago del pedido, para ver si ya se cobró antes de prepararlo. */
export function useStaffOrderPayments(idOrder: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['staff-order-payments', user?.idUser ?? null, idOrder],
    enabled: user !== null,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/orders/{id}/payment', {
          params: { path: { id: idOrder } },
          signal,
        }),
      ),
  });
}

/**
 * Una acción del personal sobre un pedido. Con la misma llave, repetir el clic no la aplica dos veces; al lograrse se renueva
 * la llave y se vuelve a pedir todo lo que muestra el pedido, porque cambió su estado, su historial o sus reembolsos.
 */
function useOrderAction<V, R>(run: (variables: V, key: string) => Promise<R>) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (variables: V) => {
      const result = await run(variables, key.current());
      key.renew();
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff-order'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-order-payments'] });
    },
  });
}

/** Pasa el pedido al siguiente paso: en preparación, despachado o entregado. */
export function useChangeStatus(idOrder: number) {
  return useOrderAction(async (status: NextStep, key) =>
    unwrap(
      await api.PATCH('/api/v1/admin/orders/{id}/status', {
        params: { path: { id: idOrder }, header: { 'Idempotency-Key': key } },
        body: { status },
      }),
    ),
  );
}

export interface ReturnBody {
  reason: string;
  lines: { idOrderLine: number; quantity: number }[];
}

/** Registra una devolución, total o parcial; el servidor calcula el reembolso al centavo. */
export function useRegisterReturn(idOrder: number) {
  return useOrderAction(async (body: ReturnBody, key) =>
    unwrap(
      await api.POST('/api/v1/admin/orders/{id}/returns', {
        params: { path: { id: idOrder }, header: { 'Idempotency-Key': key } },
        body,
      }),
    ),
  );
}
