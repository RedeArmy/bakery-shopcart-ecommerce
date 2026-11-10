import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { LIMIT, apiStatus } from '../model/refunds';
import type { RefundFilter } from '../model/refunds';

/** Los reembolsos con el estado pedido, el más reciente primero. La lista llega entera, sin páginas; la clave lleva la sesión. */
export function useRefunds(filter: RefundFilter) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['refunds', user?.idUser ?? null, filter],
    enabled: user?.role === 'Administrator',
    queryFn: async ({ signal }) => {
      const status = apiStatus(filter);
      return unwrap(
        await api.GET('/api/v1/admin/refunds', {
          params: { query: { limit: LIMIT, ...(status === undefined ? {} : { status }) } },
          signal,
        }),
      );
    },
    // PagedResults lee una lista con su total: aquí el total es lo que llegó
    select: (items) => ({ items, total: items.length }),
  });
}

/**
 * Marca un reembolso como procesado (con la referencia de la transferencia) o como fallido. Lleva su llave de idempotencia, que
 * solo se renueva cuando el cambio se logró: repetir el envío no lo aplica dos veces. Un reembolso procesado ya no cambia.
 */
export function useMarkRefund(idRefund: number) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (input: { status: 'Processed' | 'Failed'; externalReference?: string }) => {
      const result = unwrap(
        await api.PATCH('/api/v1/admin/refunds/{id}', {
          params: { path: { id: idRefund }, header: { 'Idempotency-Key': key.current() } },
          body: {
            status: input.status,
            ...(input.externalReference === undefined
              ? {}
              : { externalReference: input.externalReference }),
          },
        }),
      );
      key.renew();
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['refunds'] });
    },
  });
}
