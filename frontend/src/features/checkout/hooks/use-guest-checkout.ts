import { useMutation } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { auth } from '../../../shared/auth';
import type { GuestContactValues } from '../../auth/model/schemas';

/** Guarda el contacto del invitado y actualiza su sesión, que es donde la pantalla sabe si ya lo dio. */
export function useSaveGuestContact() {
  return useMutation({
    mutationFn: async (values: GuestContactValues) => {
      const profile = unwrap(
        await api.PUT('/api/v1/auth/guest/contact', {
          body: {
            email: values.email,
            fullName: values.fullName,
            phone: values.phone === '' ? null : values.phone,
          },
        }),
      );
      auth.updateUser(profile);
      return profile;
    },
  });
}

/** Pide un código nuevo de recuperación de los pedidos del invitado; el servidor solo lo entrega esta vez. */
export function useIssueRecoveryCode() {
  return useMutation({
    mutationFn: async () => unwrap(await api.POST('/api/v1/auth/guest/recovery-code')).code,
  });
}
