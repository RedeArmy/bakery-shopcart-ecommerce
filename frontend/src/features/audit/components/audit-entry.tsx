import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { formatDateTime } from '../../../shared/lib/date';
import { Badge } from '../../../shared/ui/badge';
import { ChevronDownIcon } from '../../../shared/ui/icons';
import { describeChange, isAuditModule } from '../model/audit';
import type { FieldChange } from '../model/audit';
import {
  entityKeyLabel,
  entityLabel,
  fieldLabel,
  formatNested,
  formatValue,
  isNested,
} from '../model/audit-format';

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

/**
 * Un valor de un campo como lo lee una persona: un texto simple con el formato de su campo (importe, fecha, sí o no, estado), o,
 * si es un arreglo o un objeto (los atributos de una variante, las líneas de una devolución), una línea por elemento. Sin valor
 * se muestra «—».
 */
function FieldValue({ change, raw }: Readonly<{ change: FieldChange; raw: unknown }>) {
  const { t } = useTranslation();
  if (isNested(raw)) {
    const lines = formatNested(t, raw);
    if (lines.length === 0) return <>{t('audit.noValue')}</>;
    return (
      <>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </>
    );
  }
  return <>{formatValue(t, change.field, raw, change.context) ?? t('audit.noValue')}</>;
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
            <th scope="row" className="py-1.5 pr-4 font-normal text-stone-700">
              {fieldLabel(t, change.field)}
            </th>
            <td className="break-words py-1.5 pr-4 text-stone-600">
              <FieldValue change={change} raw={change.rawBefore} />
            </td>
            <td className="break-words py-1.5 text-stone-900">
              <FieldValue change={change} raw={change.rawAfter} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Un registro de la bitácora, como un desplegable: cerrado muestra qué se hizo (la acción), sobre qué (el módulo y la entidad con su
 * identificador), quién y cuándo; al pulsarlo se abre lo que cambió, campo por campo. El módulo y la acción salen en español cuando
 * se conocen; si la base de datos agrega uno nuevo se muestra tal cual.
 */
export function AuditEntry({ entry }: Readonly<{ entry: AuditEntryData }>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const module = isAuditModule(entry.module) ? t(`audit.modules.${entry.module}`) : entry.module;
  const action = t(`audit.actions.${entry.action}`, { defaultValue: entry.action });

  return (
    <li className="rounded-card border border-stone-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-4 rounded-card p-4 text-left hover:bg-stone-50"
      >
        <span className="min-w-0 space-y-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={entry.action === 'Deactivate' ? 'danger' : 'neutral'}>{action}</Badge>
            <span className="text-stone-900">{module}</span>
            <span className="text-sm text-stone-600">
              {entityLabel(t, entry.entityName)} {entityKeyLabel(t, entry.entityKey)}
            </span>
          </span>
          <span className="block text-sm text-stone-600">
            {entry.userName === undefined || entry.userName === null
              ? t('audit.bySystem')
              : t('audit.by', { name: entry.userName })}
            {entry.createdAt === undefined ? null : ` · ${formatDateTime(entry.createdAt)}`}
          </span>
        </span>
        <ChevronDownIcon
          className={`shrink-0 stroke-current transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div id={detailsId} className="border-t border-stone-200 p-4">
          <Changes entry={entry} />
        </div>
      ) : null}
    </li>
  );
}
