import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { API_STATUS, PAGE_SIZE, toBody } from '../model/coupons';
import type { CouponValues, CouponsQuery } from '../model/coupons';

/** Una página de los cupones del filtro elegido (todos, vigentes o desactivados). La clave lleva la sesión. */
export function useCoupons(query: CouponsQuery) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['coupons', user?.idUser ?? null, query.filter, query.page],
    enabled: user?.role === 'Administrator',
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/coupons', {
          params: {
            query: { status: API_STATUS[query.filter], page: query.page, size: PAGE_SIZE },
          },
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

/**
 * Vuelve a activar un cupón desactivado. Sus fechas y sus usos no cambian: si su vigencia ya pasó, sigue vencido hasta que se
 * edite. Lleva su llave de idempotencia, que solo se renueva cuando el cambio se logró.
 */
export function useReactivateCoupon(idCoupon: number) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async () => {
      const result = unwrap(
        await api.POST('/api/v1/admin/coupons/{id}/reactivate', {
          params: { path: { id: idCoupon }, header: { 'Idempotency-Key': key.current() } },
        }),
      );
      key.renew();
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}

/**
 * Borra por completo un cupón desactivado. El servidor solo lo permite si ningún pedido lo usó ni lo cita; si no, lo conserva
 * desactivado y explica por qué, y esa respuesta se muestra.
 */
export function useDeleteCoupon(idCoupon: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/api/v1/admin/coupons/{id}/permanent', {
          params: { path: { id: idCoupon } },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}
