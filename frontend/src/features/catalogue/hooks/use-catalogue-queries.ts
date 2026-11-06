import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { toApiQuery } from '../model/catalogue-query';
import type { CatalogueQuery } from '../model/catalogue-query';

/** Árbol de categorías activas: cambia muy poco, así que se conserva diez minutos. */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 10 * 60 * 1000,
    queryFn: async ({ signal }) => unwrap(await api.GET('/api/v1/categories', { signal })),
  });
}

/** Una página de productos. Mientras llega la siguiente se conserva la anterior para que la lista no parpadee. */
export function useProducts(query: CatalogueQuery, size?: number) {
  return useQuery({
    queryKey: ['products', query, size],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/products', {
          params: { query: toApiQuery(query, size) },
          signal,
        }),
      ),
  });
}

export function useProduct(idProduct: number | null) {
  return useQuery({
    queryKey: ['product', idProduct],
    enabled: idProduct !== null,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/products/{id}', {
          params: { path: { id: idProduct ?? 0 } },
          signal,
        }),
      ),
  });
}
