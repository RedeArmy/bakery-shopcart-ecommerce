import { useTranslation } from 'react-i18next';
import { isReversedRange } from '../../../shared/lib/date';
import { SelectField, TextField } from '../../../shared/ui/fields';
import { SearchForm } from '../../payment-review/components/search-form';
import { AUDIT_MODULES, isAuditModule } from '../model/audit';
import type { AuditQuery } from '../model/audit';

/**
 * Los filtros de la bitácora (RF-09: por módulo; además por identificador y por días). Todo vive en la dirección, que decide el
 * padre: cambiar un filtro vuelve a la primera página.
 */
export function AuditFilters({
  query,
  onChange,
}: Readonly<{ query: AuditQuery; onChange: (next: Partial<AuditQuery>) => void }>) {
  const { t } = useTranslation();
  const reversed = isReversedRange(query.from, query.to);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-full sm:w-56">
        <SelectField
          label={t('audit.filterModule')}
          value={query.module ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            onChange({ module: isAuditModule(value) ? value : null });
          }}
        >
          <option value="">{t('audit.allModules')}</option>
          {AUDIT_MODULES.map((module) => (
            <option key={module} value={module}>
              {t(`audit.modules.${module}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField
        label={t('audit.from')}
        type="date"
        value={query.from ?? ''}
        {...(query.to === null ? {} : { max: query.to })}
        onChange={(event) => {
          onChange({ from: event.target.value === '' ? null : event.target.value });
        }}
      />
      <TextField
        label={t('audit.to')}
        type="date"
        value={query.to ?? ''}
        {...(query.from === null ? {} : { min: query.from })}
        {...(reversed ? { error: t('audit.reversedRange') } : {})}
        onChange={(event) => {
          onChange({ to: event.target.value === '' ? null : event.target.value });
        }}
      />
      <SearchForm
        id="audit-search"
        label={t('audit.key')}
        placeholder={t('audit.keyHint')}
        submitLabel={t('audit.search')}
        value={query.entityKey}
        onSearch={(entityKey) => {
          onChange({ entityKey });
        }}
      />
    </div>
  );
}
