import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseQuery, toSearchParams, withFilter } from '../model/catalogue-query';
import type { CatalogueQuery } from '../model/catalogue-query';

/** La búsqueda del catálogo leída de la dirección y una forma de cambiarla. */
export function useCatalogueSearch() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseQuery(params), [params]);

  const setFilter = useCallback(
    (change: Partial<Omit<CatalogueQuery, 'page'>>) => {
      setParams(toSearchParams(withFilter(query, change)));
    },
    [query, setParams],
  );
  const setPage = useCallback(
    (page: number) => {
      setParams(toSearchParams({ ...query, page }));
    },
    [query, setParams],
  );
  const clear = useCallback(() => {
    setParams(new URLSearchParams());
  }, [setParams]);

  return { query, setFilter, setPage, clear };
}
