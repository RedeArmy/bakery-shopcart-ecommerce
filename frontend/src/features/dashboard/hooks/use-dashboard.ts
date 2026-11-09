import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { isReversed, rangeParams } from '../model/dashboard';
import type { DashboardRange, Granularity } from '../model/dashboard';

type RangeQuery = ReturnType<typeof rangeParams>;

/**
 * Un reporte del período. La clave lleva la sesión y el período, y al cambiar de período se sigue viendo el anterior mientras
 * llega el nuevo. Un período al revés no se pregunta: el servidor lo rechazaría y la pantalla lo explica.
 */
function useReport<T>(
  name: string,
  range: DashboardRange,
  extra: readonly unknown[],
  run: (query: RangeQuery, signal: AbortSignal) => Promise<T>,
) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['dashboard', name, user?.idUser ?? null, range.from, range.to, ...extra],
    enabled: user !== null && !isReversed(range),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => run(rangeParams(range), signal),
  });
}

/** Las cifras del período y, aparte, lo que está pendiente ahora mismo. */
export function useDashboardSummary(range: DashboardRange) {
  return useReport('summary', range, [], async (query, signal) =>
    unwrap(await api.GET('/api/v1/admin/dashboard/summary', { params: { query }, signal })),
  );
}

/** Las ventas por día, semana o mes, con los períodos sin ventas en cero. */
export function useSales(range: DashboardRange, granularity: Granularity) {
  return useReport('sales', range, [granularity], async (query, signal) =>
    unwrap(
      await api.GET('/api/v1/admin/dashboard/sales', {
        params: { query: { ...query, granularity } },
        signal,
      }),
    ),
  );
}

/** La venta neta de cada categoría, la mayor primero. */
export function useSalesByCategory(range: DashboardRange) {
  return useReport('sales-by-category', range, [], async (query, signal) =>
    unwrap(
      await api.GET('/api/v1/admin/dashboard/sales-by-category', { params: { query }, signal }),
    ),
  );
}

/** Los diez productos más vendidos del período. */
export function useTopProducts(range: DashboardRange) {
  return useReport('top-products', range, [], async (query, signal) =>
    unwrap(
      await api.GET('/api/v1/admin/dashboard/top-products', {
        params: { query: { ...query, limit: 10 } },
        signal,
      }),
    ),
  );
}
