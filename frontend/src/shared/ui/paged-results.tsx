import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from './pagination';
import { EmptyState, ErrorState, LoadingSkeleton } from './states';

interface Paged<T> {
  items: T[];
  total: number;
}

/**
 * El resultado de una lista paginada en el servidor, con sus cuatro momentos: cargando, con error (y reintento), vacía y con
 * datos (cuántos hay, la lista y la paginación). Los textos salen de `<prefix>.emptyTitle`, `emptyText` y `total`.
 */
export function PagedResults<T>({
  prefix,
  result,
  page,
  pageSize,
  onPage,
  renderItem,
}: Readonly<{
  prefix: string;
  result: UseQueryResult<Paged<T>>;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  renderItem: (item: T) => ReactNode;
}>) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = result;
  if (isPending) return <LoadingSkeleton count={4} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (data.items.length === 0) {
    return <EmptyState title={t(`${prefix}.emptyTitle`)} text={t(`${prefix}.emptyText`)} />;
  }
  return (
    <>
      <p className="text-sm text-stone-600">{t(`${prefix}.total`, { count: data.total })}</p>
      <ul className="space-y-3">{data.items.map(renderItem)}</ul>
      <Pagination page={page} pages={Math.ceil(data.total / pageSize)} onChange={onPage} />
    </>
  );
}
