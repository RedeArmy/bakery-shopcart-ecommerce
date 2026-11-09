import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PAGE_SIZE, toBody } from '../model/coupons';
import type { CouponValues, CouponsQuery } from '../model/coupons';

/** Una página de los cupones, con o sin los desactivados. La clave lleva la sesión. */
export function useCoupons(query: CouponsQuery) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['coupons', user?.idUser ?? null, query.inactive, query.page],
    enabled: user?.role === 'Administrator',
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/coupons', {
          params: { query: { includeInactive: query.inactive, page: query.page, size: PAGE_SIZE } },
          signal,
        }),
      ),
  });
}

/** Crea un cupón. Con la misma llave, repetir el envío no lo crea dos veces; la llave se renueva solo si se logró. */
export function useCreateCoupon() {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (values: CouponValues) => {
      const created = unwrap(
        await api.POST('/api/v1/admin/coupons', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: toBody(values, true),
        }),
      );
      key.renew();
      return created.idCoupon;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}

/** Edita un cupón: el código no cambia; el servidor no deja bajar el límite total por debajo de lo ya usado. */
export function useUpdateCoupon(idCoupon: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CouponValues) =>
      unwrap(
        await api.PUT('/api/v1/admin/coupons/{id}', {
          params: { path: { id: idCoupon } },
          body: toBody(values, false),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}

/** "Quitar" un cupón es desactivarlo: los pedidos que lo usaron lo conservan. */
export function useDeactivateCoupon(idCoupon: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/api/v1/admin/coupons/{id}', { params: { path: { id: idCoupon } } }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}
