import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PAGE_SIZE } from '../model/inventory';

/** Una página del libro de movimientos de la variante, el más reciente primero. La clave lleva la sesión. */
export function useLedger(idVariant: number | null, page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['ledger', user?.idUser ?? null, idVariant, page],
    enabled: user !== null && idVariant !== null,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/inventory/ledger', {
          params: { query: { variant: idVariant ?? 0, page, size: PAGE_SIZE } },
          signal,
        }),
      ),
  });
}

/** Tras mover el stock cambian el libro, las existencias del producto y lo que el catálogo ofrece. */
function useRefreshStock() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      queryClient.invalidateQueries({ queryKey: ['product'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ]);
  };
}

/** Registra unidades que llegaron. Lleva su llave de idempotencia, que solo se renueva cuando el movimiento se logró. */
export function useRegisterEntry(idVariant: number) {
  const key = useIdempotencyKey();
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: async (values: { quantity: number; reason: string }) => {
      const result = unwrap(
        await api.POST('/api/v1/admin/inventory/entries', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: { idVariant, ...values },
        }),
      );
      key.renew();
      return result;
    },
    onSuccess: refresh,
  });
}

/** Deja el stock físico en el valor contado. Si ya valía eso, el servidor no anota nada. */
export function useAdjustStock(idVariant: number) {
  const key = useIdempotencyKey();
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: async (values: { newOnHand: number; reason: string }) => {
      const result = unwrap(
        await api.POST('/api/v1/admin/inventory/adjustments', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: { idVariant, ...values },
        }),
      );
      key.renew();
      return result;
    },
    onSuccess: refresh,
  });
}
