import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { isReversedRange } from '../../../shared/lib/date';
import { Pagination } from '../../../shared/ui/pagination';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { AuditEntry } from '../components/audit-entry';
import { AuditFilters } from '../components/audit-filters';
import { useAuditLog } from '../hooks/use-audit-log';
import { PAGE_SIZE, auditParams, parseAuditQuery } from '../model/audit';
import type { AuditQuery } from '../model/audit';

/**
 * La bitácora (RF-09), solo para el administrador: todo lo que se crea, modifica o desactiva, el más reciente primero, con quién lo
 * hizo, cuándo y qué cambió. No se puede editar ni borrar: aquí solo se consulta. El módulo, el identificador, los días y la página
 * viven en la dirección, así un enlace lleva a la misma consulta.
 */
export function AuditLogPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const query = parseAuditQuery(params);
  const { data, isPending, isError, error, refetch } = useAuditLog(query);

  // Cambiar un filtro vuelve a la primera página
  const change = (next: Partial<AuditQuery>): void => {
    setParams(auditParams({ ...query, page: 1, ...next }));
  };

  let content: ReactNode;
  if (isReversedRange(query.from, query.to)) {
    // Un rango al revés no se pregunta al servidor: la fecha «Hasta» ya lo explica
    content = null;
  } else if (isPending) {
    content = <LoadingSkeleton count={4} />;
  } else if (isError) {
    content = <ErrorState error={error} onRetry={() => void refetch()} />;
  } else if (data.items.length === 0) {
    content = <EmptyState title={t('audit.emptyTitle')} text={t('audit.emptyText')} />;
  } else {
    content = (
      <>
        <p className="text-sm text-stone-600">{t('audit.total', { count: data.total })}</p>
        <ul className="space-y-3">
          {data.items.map((entry) => (
            <AuditEntry key={entry.idAuditLog} entry={entry} />
          ))}
        </ul>
        <Pagination
          page={query.page}
          pages={Math.ceil(data.total / PAGE_SIZE)}
          onChange={(page) => {
            setParams(auditParams({ ...query, page }));
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('audit.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('audit.intro')}</p>
      </header>
      <AuditFilters query={query} onChange={change} />
      {content}
    </div>
  );
}
