import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { EmptyState, ErrorState, LoadingSkeleton } from './states';

interface ListQuery<T> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data?: readonly T[];
  refetch: () => unknown;
}

/**
 * Página de mantenimiento del administrador: el título, el botón de agregar con su formulario y la lista con sus estados de
 * carga, vacío y error. Cada módulo aporta sus textos, cómo se dibuja un elemento y su formulario.
 */
export function MaintenanceList<T>({
  title,
  intro,
  addLabel,
  emptyTitle,
  emptyText,
  query,
  renderItem,
  renderForm,
}: Readonly<{
  title: string;
  intro: string;
  addLabel: string;
  emptyTitle: string;
  emptyText: string;
  query: ListQuery<T>;
  renderItem: (item: T) => ReactNode;
  renderForm: (done: () => void) => ReactNode;
}>) {
  const [adding, setAdding] = useState(false);
  const startAdding = () => {
    setAdding(true);
  };
  const items = query.data ?? [];

  let content;
  if (query.isPending) {
    content = <LoadingSkeleton count={3} />;
  } else if (query.isError) {
    content = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (items.length === 0 && !adding) {
    content = (
      <EmptyState
        title={emptyTitle}
        text={emptyText}
        action={<Button onClick={startAdding}>{addLabel}</Button>}
      />
    );
  } else {
    content = <ul className="space-y-3">{items.map((item) => renderItem(item))}</ul>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl text-stone-900">{title}</h1>
          <p className="mt-1 max-w-2xl text-stone-600">{intro}</p>
        </div>
        {adding ? null : <Button onClick={startAdding}>{addLabel}</Button>}
      </header>
      {adding
        ? renderForm(() => {
            setAdding(false);
          })
        : null}
      {content}
    </div>
  );
}
