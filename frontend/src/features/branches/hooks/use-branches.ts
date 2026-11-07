import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import type { BranchValues } from '../model/schemas';

export type Branch = components['schemas']['Branch'];

/** Las sucursales activas, para elegir dónde recoger: se ven sin cuenta y cambian poco. */
export function useBranches() {
  return useQuery({
    queryKey: ['branches', 'active'],
    staleTime: 60_000,
    queryFn: async ({ signal }) => unwrap(await api.GET('/api/v1/branches', { signal })),
  });
}

/** Todas las sucursales, también las desactivadas, para la administración. */
export function useAdminBranches() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['branches', 'admin', user?.idUser ?? null],
    enabled: user?.role === 'Administrator',
    queryFn: async ({ signal }) => unwrap(await api.GET('/api/v1/admin/branches', { signal })),
  });
}

// Los campos vacíos opcionales viajan como nulos: el servidor los guarda sin texto
const toBody = (values: BranchValues) => ({
  name: values.name,
  line1: values.line1,
  municipality: values.municipality,
  department: values.department,
  phone: values.phone === '' ? null : values.phone,
  openingHours: values.openingHours === '' ? null : values.openingHours,
});

/** Agrega una sucursal. Con la misma llave, repetir el envío no la crea dos veces. */
export function useCreateBranch() {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async (values: BranchValues) => {
      const created = unwrap(
        await api.POST('/api/v1/admin/branches', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: toBody(values),
        }),
      );
      key.renew();
      return created.idBranch;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });
}

/** Edita una sucursal activa; los pedidos ya hechos conservan la copia que guardaron. */
export function useUpdateBranch(idBranch: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: BranchValues) =>
      unwrap(
        await api.PUT('/api/v1/admin/branches/{id}', {
          params: { path: { id: idBranch } },
          body: toBody(values),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });
}

/** "Quitar" una sucursal es desactivarla: los pedidos ya hechos la citan. */
export function useDeactivateBranch(idBranch: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/api/v1/admin/branches/{id}', { params: { path: { id: idBranch } } }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });
}
