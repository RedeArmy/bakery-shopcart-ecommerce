import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { dayEnd, dayStart, isReversedRange } from '../../../shared/lib/date';
import { PAGE_SIZE } from '../model/audit';
import type { AuditQuery } from '../model/audit';

/**
 * Una página de la bitácora, la más reciente primero, con el módulo, el identificador y los días que se piden. Los días se
 * convierten en instantes de medianoche a medianoche de Guatemala, de modo que el último día se cuenta entero. Un rango al revés
 * no se pregunta: el servidor lo rechazaría y la pantalla lo explica.
 */
export function useAuditLog(query: AuditQuery) {
  const { user } = useSession();
  return useQuery({
    queryKey: [
      'audit-log',
      user?.idUser ?? null,
      query.module,
      query.entityKey,
      query.from,
      query.to,
      query.page,
    ],
    enabled: user !== null && !isReversedRange(query.from, query.to),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/audit-log', {
          params: {
            query: {
              page: query.page,
              size: PAGE_SIZE,
              ...(query.module === null ? {} : { module: query.module }),
              ...(query.entityKey === '' ? {} : { entityKey: query.entityKey }),
              ...(query.from === null ? {} : { from: dayStart(query.from) }),
              ...(query.to === null ? {} : { to: dayEnd(query.to) }),
            },
          },
          signal,
        }),
      ),
  });
}
