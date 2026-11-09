import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PAGE_SIZE } from '../model/order-status';

/** Una página de los pedidos del cliente, con el filtro de estado opcional. Otro cliente nunca aparece aquí. */
export function useOrders(page: number, status: number | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['orders', user?.idUser ?? null, page, status],
    enabled: user !== null,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/orders', {
          params: {
            query: { page, size: PAGE_SIZE, ...(status === null ? {} : { status }) },
          },
          signal,
        }),
      ),
  });
}

/** Cancela el pedido propio. Con la misma llave, repetir el clic no lo cancela dos veces. */
export function useCancelOrder(idOrder: number) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (reason: string) => {
      const order = unwrap(
        await api.POST('/api/v1/orders/{id}/cancel', {
          params: { path: { id: idOrder }, header: { 'Idempotency-Key': key.current() } },
          body: reason === '' ? {} : { reason },
        }),
      );
      key.renew();
      return order;
    },
    // El personal cancela con la misma operación: también se vuelve a pedir lo que ve en su administración
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order-payments'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-order'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-order-payments'] });
    },
  });
}
