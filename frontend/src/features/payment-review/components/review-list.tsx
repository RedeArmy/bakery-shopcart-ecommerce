import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '../../../shared/ui/pagination';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { PAGE_SIZE } from '../model/review';

interface ReviewQueryState<T> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data?: { items: readonly T[]; total: number };
  refetch: () => unknown;
}

/**
 * El marco de una pantalla de revisión del personal: el título, los filtros, el aviso de lo que pasó con la última acción, la
 * lista con sus estados de carga, vacío y error, y la paginación. Cada pantalla aporta sus filtros y cómo se dibuja un elemento.
 * El aviso sale de `<outcomesPrefix>.<resultado>`: lo que la acción devolvió, dicho en español.
 */
export function ReviewList<T>({
  title,
  intro,
  toolbar,
  outcomesPrefix,
  query,
  page,
  onPage,
  empty,
  renderItem,
}: Readonly<{
  title: string;
  intro: string;
  toolbar: ReactNode;
  outcomesPrefix: string;
  query: ReviewQueryState<T>;
  page: number;
  onPage: (page: number) => void;
  empty: { title: string; text: string };
  renderItem: (item: T, onOutcome: (outcome: string) => void) => ReactNode;
}>) {
  const { t, i18n } = useTranslation();
  const [outcome, setOutcome] = useState<string | null>(null);

  let content: ReactNode;
  if (query.isPending) {
    content = <LoadingSkeleton count={3} />;
  } else if (query.isError) {
    content = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.data === undefined || query.data.items.length === 0) {
    content = <EmptyState title={empty.title} text={empty.text} />;
  } else {
    content = (
      <>
        <ul className="space-y-3">
          {query.data.items.map((item) => renderItem(item, setOutcome))}
        </ul>
        <Pagination page={page} pages={Math.ceil(query.data.total / PAGE_SIZE)} onChange={onPage} />
      </>
    );
  }

  const outcomeKey = `${outcomesPrefix}.${outcome ?? ''}`;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{title}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{intro}</p>
      </header>
      {toolbar}
      {outcome === null ? null : (
        <p role="status" className="rounded-card bg-emerald-50 p-3 text-sm text-emerald-900">
          {i18n.exists(outcomeKey) ? t(outcomeKey) : outcome}
        </p>
      )}
      {content}
    </div>
  );
}
