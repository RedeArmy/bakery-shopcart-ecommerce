import { useMutation } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import type { TrackValues } from '../model/track-schema';

export type OrderTracking = components['schemas']['OrderTracking'];

/**
 * Consulta el estado de un pedido sin sesión, con su número y el correo con el que se hizo. Es una consulta que se dispara al
 * enviar el formulario y no se guarda en caché: lo que se ve es lo que el servidor contestó en ese momento.
 */
export function useTrackOrder() {
  return useMutation({
    mutationFn: async (values: TrackValues) =>
      unwrap(
        await api.GET('/api/v1/orders/track', {
          params: { query: { orderNumber: values.orderNumber, email: values.email } },
        }),
      ),
  });
}
