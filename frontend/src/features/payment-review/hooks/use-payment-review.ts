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

interface QueueQuery<S extends string> {
  status: S;
  page: number;
  size: number;
  search?: string;
}

/**
 * Una cola de trabajo del personal: el estado que se mira, el texto que se busca y la página. La cola con trabajo por hacer
 * (`workStatus`) se renueva sola; las demás son historial y no cambian.
 */
function useReviewQueue<S extends string, T>(options: {
  name: string;
  status: S;
  workStatus: S;
  search: string;
  page: number;
  fetch: (query: QueueQuery<S>, signal: AbortSignal) => Promise<T>;
}) {
  const { user } = useSession();
  const { name, status, workStatus, search, page, fetch } = options;
  return useQuery({
    queryKey: ['review', name, user?.idUser ?? null, status, search, page],
    enabled: user !== null,
    refetchInterval: status === workStatus ? REFRESH_MS : false,
    queryFn: ({ signal }) =>
      fetch({ status, page, size: PAGE_SIZE, ...(search === '' ? {} : { search }) }, signal),
  });
}

/** La cola de depósitos, con el texto que el personal busca. En revisión se renueva sola. */
export function useDepositQueue(status: DepositStatus, search: string, page: number) {
  return useReviewQueue({
    name: 'deposits',
    status,
    workStatus: 'UnderReview',
    search,
    page,
    fetch: async (query, signal) =>
      unwrap(await api.GET('/api/v1/admin/payments/deposits', { params: { query }, signal })),
  });
}

/** Los cobros en efectivo, con el texto que el personal busca (número de pedido, nombre o correo). Los pendientes se renuevan solos. */
export function useCashQueue(status: CashStatus, search: string, page: number) {
  return useReviewQueue({
    name: 'cash',
    status,
    workStatus: 'Pending',
    search,
    page,
    fetch: async (query, signal) =>
      unwrap(await api.GET('/api/v1/admin/payments/cash', { params: { query }, signal })),
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

/** El pago de la ruta y la llave de idempotencia, que llevan todas las acciones de revisión. */
const actionParams = (idPayment: number, key: string) => ({
  path: { id: idPayment },
  header: { 'Idempotency-Key': key },
});

/** Aprueba un depósito en revisión; si el monto no coincide con el del pedido, el servidor lo rechaza. */
export function useApproveDeposit(idPayment: number) {
  return useReviewAction<undefined>(async (key) =>
    unwrap(
      await api.POST('/api/v1/admin/payments/{id}/approve', {
        params: actionParams(idPayment, key),
      }),
    ),
  );
}

/** Rechaza un depósito con un motivo que el cliente podrá leer. */
export function useRejectDeposit(idPayment: number) {
  return useReviewAction<string>(async (key, reason) =>
    unwrap(
      await api.POST('/api/v1/admin/payments/{id}/reject', {
        params: actionParams(idPayment, key),
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
        params: actionParams(idPayment, key),
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
