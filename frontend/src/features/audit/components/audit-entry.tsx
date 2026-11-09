import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { formatDateTime } from '../../../shared/lib/date';
import { Badge } from '../../../shared/ui/badge';
import { describeChange } from '../model/audit';
import { isAuditModule } from '../model/audit';

type AuditEntryData = components['schemas']['AuditEntry'];

/** Los dos textos que guarda la bitácora cuando no son un objeto JSON: se muestran tal cual, nunca se pierden. */
function RawValues({ entry }: Readonly<{ entry: AuditEntryData }>) {
  const { t } = useTranslation();
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-stone-600">{t('audit.before')}</dt>
        <dd className="mt-1 break-words font-mono text-stone-900">
          {entry.previousValue ?? t('audit.noValue')}
        </dd>
      </div>
      <div>
        <dt className="text-stone-600">{t('audit.after')}</dt>
        <dd className="mt-1 break-words font-mono text-stone-900">
          {entry.newValue ?? t('audit.noValue')}
        </dd>
      </div>
    </dl>
  );
}

/** Lo que cambió en un registro, campo por campo: el nombre del campo, su valor anterior y el nuevo. */
function Changes({ entry }: Readonly<{ entry: AuditEntryData }>) {
  const { t } = useTranslation();
  const changes = describeChange(entry.previousValue, entry.newValue);
  if (changes === null) return <RawValues entry={entry} />;
  if (changes.length === 0) return <p className="text-sm text-stone-600">{t('audit.noChanges')}</p>;

  return (
    // Ancho fijo: las columnas de un registro quedan alineadas con las del siguiente
    <table className="w-full table-fixed text-left text-sm">
      <caption className="sr-only">{t('audit.changes')}</caption>
      <thead className="text-stone-600">
        <tr>
          <th scope="col" className="w-[28%] py-1 pr-4 font-medium">
            {t('audit.field')}
          </th>
          <th scope="col" className="w-[36%] py-1 pr-4 font-medium">
            {t('audit.before')}
          </th>
          <th scope="col" className="py-1 font-medium">
            {t('audit.after')}
          </th>
        </tr>
      </thead>
      <tbody>
        {changes.map((change) => (
          <tr key={change.field} className="border-t border-stone-100 align-top">
            <th scope="row" className="py-1.5 pr-4 font-mono font-normal text-stone-700">
              {change.field}
            </th>
            <td className="break-words py-1.5 pr-4 font-mono text-stone-600">
              {change.before ?? t('audit.noValue')}
            </td>
            <td className="break-words py-1.5 font-mono text-stone-900">
              {change.after ?? t('audit.noValue')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Un registro de la bitácora: qué se hizo (la acción), sobre qué (el módulo y la entidad con su identificador), quién y cuándo, y lo
 * que cambió. El módulo y la acción salen en español cuando se conocen; si la base de datos agrega uno nuevo se muestra tal cual.
 */
export function AuditEntry({ entry }: Readonly<{ entry: AuditEntryData }>) {
  const { t } = useTranslation();
  const module = isAuditModule(entry.module) ? t(`audit.modules.${entry.module}`) : entry.module;
  const action = t(`audit.actions.${entry.action}`, { defaultValue: entry.action });

  return (
    <li className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={entry.action === 'Deactivate' ? 'danger' : 'neutral'}>{action}</Badge>
        <p className="text-stone-900">{module}</p>
        <p className="font-mono text-sm text-stone-600">
          {entry.entityName} {entry.entityKey}
        </p>
      </div>
      <p className="text-sm text-stone-600">
        {entry.userName === undefined || entry.userName === null
          ? t('audit.bySystem')
          : t('audit.by', { name: entry.userName })}
        {entry.createdAt === undefined ? null : ` · ${formatDateTime(entry.createdAt)}`}
      </p>
      <Changes entry={entry} />
    </li>
  );
}
