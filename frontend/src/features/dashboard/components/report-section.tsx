import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState, LoadingSkeleton } from '../../../shared/ui/states';

/**
 * Una sección del panel con sus estados de carga, de error y vacío, para que cada reporte los resuelva igual y nadie los olvide.
 * El contenido solo se dibuja cuando hay datos.
 */
export function ReportSection<T>({
  id,
  title,
  report,
  isEmpty,
  emptyText,
  children,
}: Readonly<{
  id: string;
  title: string;
  report: UseQueryResult<T>;
  isEmpty: (data: T) => boolean;
  emptyText: string;
  children: (data: T) => ReactNode;
}>) {
  let body: ReactNode;
  if (report.isPending) body = <LoadingSkeleton count={3} />;
  else if (report.isError) {
    body = <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  } else if (isEmpty(report.data)) body = <p className="text-stone-600">{emptyText}</p>;
  else body = children(report.data);

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="space-y-4 rounded-card border border-stone-200 bg-white p-5"
    >
      <h2 id={`${id}-title`} className="text-2xl text-stone-900">
        {title}
      </h2>
      {body}
    </section>
  );
}
