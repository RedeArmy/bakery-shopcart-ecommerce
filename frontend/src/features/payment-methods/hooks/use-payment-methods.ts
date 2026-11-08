import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import type { PaymentMethodValues } from '../model/schemas';

export type PaymentMethod = components['schemas']['PaymentMethod'];

/** Los métodos que administra el administrador, también los desactivados (la tarjeta no se administra aquí). */
export function useAdminPaymentMethods() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['payment-methods', 'admin', user?.idUser ?? null],
    enabled: user?.role === 'Administrator',
    queryFn: async ({ signal }) =>
      unwrap(await api.GET('/api/v1/admin/payment-methods', { signal })),
  });
}

// Un texto vacío viaja como nulo: el servidor lo guarda sin descripción
const detailsOf = (values: PaymentMethodValues) => ({
  title: values.title,
  description: values.description === '' ? null : values.description,
  appliesToDelivery: values.appliesToDelivery,
  appliesToPickup: values.appliesToPickup,
});

/** Agrega un método. Con la misma llave, repetir el envío no lo crea dos veces. */
export function useCreatePaymentMethod() {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (values: PaymentMethodValues) => {
      const created = unwrap(
        await api.POST('/api/v1/admin/payment-methods', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: { kind: values.kind, ...detailsOf(values) },
        }),
      );
      key.renew();
      return created.idPaymentMethod;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
  });
}

export interface UpdateInput {
  values: PaymentMethodValues;
  /** Con `true` reactiva un método desactivado; sin él el estado no cambia */
  isActive?: boolean;
}

/** Edita un método o lo reactiva; los pagos ya hechos conservan el método con el que se hicieron. */
export function useUpdatePaymentMethod(idPaymentMethod: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, isActive }: UpdateInput) =>
      unwrap(
        await api.PUT('/api/v1/admin/payment-methods/{id}', {
          params: { path: { id: idPaymentMethod } },
          body: { ...detailsOf(values), ...(isActive === undefined ? {} : { isActive }) },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
  });
}

/** "Quitar" un método es desactivarlo: los pagos ya hechos lo citan. */
export function useDeactivatePaymentMethod(idPaymentMethod: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/api/v1/admin/payment-methods/{id}', {
          params: { path: { id: idPaymentMethod } },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
  });
}
