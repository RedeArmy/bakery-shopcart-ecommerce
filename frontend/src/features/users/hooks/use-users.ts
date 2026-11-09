import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PAGE_SIZE } from '../model/users';
import type { UsersQuery } from '../model/users';

/** Una página de las cuentas (sin los invitados), con el texto, el rol y el estado que se piden. La clave lleva la sesión. */
export function useUsers(query: UsersQuery) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['users', user?.idUser ?? null, query.search, query.role, query.active, query.page],
    enabled: user !== null,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/users', {
          params: {
            query: {
              page: query.page,
              size: PAGE_SIZE,
              ...(query.search === '' ? {} : { search: query.search }),
              ...(query.role === null ? {} : { role: query.role }),
              ...(query.active === null ? {} : { active: query.active }),
            },
          },
          signal,
        }),
      ),
  });
}

/**
 * Activa o desactiva una cuenta (nunca se borra). Lleva su llave de idempotencia, que solo se renueva cuando el cambio se logró:
 * repetir el envío no lo aplica dos veces. Al lograrse se vuelven a pedir las listas de cuentas.
 */
function useUserStatus(idUser: number, isActive: boolean) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: async () => {
      const result = unwrap(
        await api.PATCH('/api/v1/admin/users/{id}', {
          params: { path: { id: idUser }, header: { 'Idempotency-Key': key.current() } },
          body: { isActive },
        }),
      );
      key.renew();
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/** Desactiva la cuenta: ya no puede entrar y sus sesiones abiertas se cierran. */
export const useDeactivateUser = (idUser: number) => useUserStatus(idUser, false);

/** Vuelve a activar la cuenta y le limpia el bloqueo por intentos fallidos. */
export const useReactivateUser = (idUser: number) => useUserStatus(idUser, true);
