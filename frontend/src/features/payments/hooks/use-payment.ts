import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';

export type Payment = components['schemas']['Payment'];

/** Estados del pago en los que ya no hay nada que esperar: dejan de consultarse cada pocos segundos. */
const SETTLED = new Set(['Approved', 'Rejected', 'Expired', 'Cancelled', 'Refunded']);

/** El pedido propio con su historial. Otro cliente nunca lo ve: el servidor contesta 404. */
export function useOrder(idOrder: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['order', user?.idUser ?? null, idOrder],
    enabled: user !== null,
    queryFn: async ({ signal }) =>
      unwrap(await api.GET('/api/v1/orders/{id}', { params: { path: { id: idOrder } }, signal })),
  });
}

/** Los intentos de pago del pedido; mientras uno espera se vuelve a pedir, para ver cuándo lo revisa una persona. */
export function useOrderPayments(idOrder: number) {
  const { user } = useSession();
  return useQuery<Payment[]>({
    queryKey: ['order-payments', user?.idUser ?? null, idOrder],
    enabled: user !== null,
    refetchInterval: (query) => {
      const list = query.state.data;
      const current = list?.find((payment) => payment.isCurrent === true) ?? list?.[0];
      return current === undefined || SETTLED.has(current.statusName) ? false : 10_000;
    },
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/orders/{id}/payment', { params: { path: { id: idOrder } }, signal }),
      ),
  });
}

export interface ProofInput {
  file: File;
  referenceNumber: string;
  depositDate: string;
  depositedAmount: string;
}

/** Sube el comprobante del depósito. Con la misma llave, repetir el envío no lo guarda dos veces. */
export function useUploadProof(idOrder: number) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (input: ProofInput) => {
      const stored = unwrap(
        await api.POST('/api/v1/orders/{id}/payment/proofs', {
          params: { path: { id: idOrder }, header: { 'Idempotency-Key': key.current() } },
          // El contrato describe el archivo como binario; el cuerpo real se arma como multipart con el archivo de verdad
          body: {
            file: '',
            referenceNumber: input.referenceNumber,
            depositDate: input.depositDate,
            depositedAmount: input.depositedAmount,
          },
          bodySerializer: () => {
            const form = new FormData();
            form.append('referenceNumber', input.referenceNumber);
            form.append('depositDate', input.depositDate);
            form.append('depositedAmount', input.depositedAmount);
            form.append('file', input.file);
            return form;
          },
        }),
      );
      key.renew();
      return stored;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order-payments'] });
      await queryClient.invalidateQueries({ queryKey: ['order'] });
    },
  });
}

/** Abre otro intento de depósito después de un rechazo, con la misma cuenta del intento anterior. */
export function useNewAttempt(idOrder: number) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (idBankAccount: number | null) => {
      const attempt = unwrap(
        await api.POST('/api/v1/orders/{id}/payment/attempts', {
          params: { path: { id: idOrder }, header: { 'Idempotency-Key': key.current() } },
          body: { idBankAccount },
        }),
      );
      key.renew();
      return attempt;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order-payments'] });
    },
  });
}
