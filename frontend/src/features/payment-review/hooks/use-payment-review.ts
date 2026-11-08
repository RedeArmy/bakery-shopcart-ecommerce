import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PAGE_SIZE } from '../model/review';
import type { CashStatus, DepositStatus } from '../model/review';

export type DepositItem = components['schemas']['DepositQueueItem'];
export type CashItem = components['schemas']['CashQueueItem'];

/** Cada cuánto se vuelve a pedir la cola de trabajo, para ver los comprobantes y las reservas que van llegando. */
const REFRESH_MS = 30_000;

/** La cola de depósitos, con el texto que el personal busca. En revisión se renueva sola: es la que atiende el personal. */
export function useDepositQueue(status: DepositStatus, search: string, page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['review', 'deposits', user?.idUser ?? null, status, search, page],
    enabled: user !== null,
    refetchInterval: status === 'UnderReview' ? REFRESH_MS : false,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/payments/deposits', {
          params: {
            query: { status, page, size: PAGE_SIZE, ...(search === '' ? {} : { search }) },
          },
          signal,
        }),
      ),
  });
}

/** Los cobros en efectivo, con el texto que el personal busca (número de pedido, nombre o correo). */
export function useCashQueue(status: CashStatus, search: string, page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['review', 'cash', user?.idUser ?? null, status, search, page],
    enabled: user !== null,
    refetchInterval: status === 'Pending' ? REFRESH_MS : false,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/payments/cash', {
          params: {
            query: { status, page, size: PAGE_SIZE, ...(search === '' ? {} : { search }) },
          },
          signal,
        }),
      ),
  });
}

/**
 * Cada acción lleva su llave de idempotencia: repetir el envío (un doble clic, un reintento tras un corte) no aprueba ni rechaza
 * dos veces. La llave solo se renueva cuando la acción se logró.
 */
function useReviewAction<V>(send: (key: string, variables: V) => Promise<{ outcome: string }>) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (variables: V) => {
      const result = await send(key.current(), variables);
      key.renew();
      return result.outcome;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['review'] });
    },
  });
}

/** Aprueba un depósito en revisión; si el monto no coincide con el del pedido, el servidor lo rechaza. */
export function useApproveDeposit(idPayment: number) {
  return useReviewAction<undefined>(async (key) =>
    unwrap(
      await api.POST('/api/v1/admin/payments/{id}/approve', {
        params: { path: { id: idPayment }, header: { 'Idempotency-Key': key } },
      }),
    ),
  );
}

/** Rechaza un depósito con un motivo que el cliente podrá leer. */
export function useRejectDeposit(idPayment: number) {
  return useReviewAction<string>(async (key, reason) =>
    unwrap(
      await api.POST('/api/v1/admin/payments/{id}/reject', {
        params: { path: { id: idPayment }, header: { 'Idempotency-Key': key } },
        body: { reason },
      }),
    ),
  );
}

/** Confirma que se cobró en efectivo en la sucursal: el pedido pasa a pagado. */
export function useConfirmCash(idPayment: number) {
  return useReviewAction<undefined>(async (key) =>
    unwrap(
      await api.POST('/api/v1/admin/payments/{id}/confirm-cash', {
        params: { path: { id: idPayment }, header: { 'Idempotency-Key': key } },
      }),
    ),
  );
}

/**
 * Abre el comprobante en otra pestaña. La descarga pide el token de la sesión, así que no es un enlace: se baja el archivo con
 * el cliente de la API y se muestra desde una dirección local que se libera al rato.
 */
export function useOpenProof(idPayment: number, idProof: number) {
  return useMutation({
    mutationFn: async () => {
      const file = unwrap(
        await api.GET('/api/v1/admin/payments/{id}/proofs/{proofId}', {
          params: { path: { id: idPayment, proofId: idProof } },
          parseAs: 'blob',
        }),
      );
      const address = URL.createObjectURL(file);
      window.open(address, '_blank', 'noopener');
      setTimeout(() => {
        URL.revokeObjectURL(address);
      }, 60_000);
    },
  });
}
