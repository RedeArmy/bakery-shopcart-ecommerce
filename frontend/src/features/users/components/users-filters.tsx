import { useTranslation } from 'react-i18next';
import { SelectField } from '../../../shared/ui/fields';
import { SearchForm } from '../../payment-review/components/search-form';
import { ROLES, activeFromValue, activeValue } from '../model/users';
import type { UsersQuery } from '../model/users';

/**
 * Los filtros de las cuentas: texto, rol y estado. Todo vive en la dirección, que decide el padre: cambiar un filtro vuelve a la
 * primera página.
 */
export function UsersFilters({
  query,
  onChange,
}: Readonly<{ query: UsersQuery; onChange: (next: Partial<UsersQuery>) => void }>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-full sm:w-52">
        <SelectField
          label={t('users.filterRole')}
          value={query.role === null ? '' : String(query.role)}
          onChange={(event) => {
            onChange({ role: event.target.value === '' ? null : Number(event.target.value) });
          }}
        >
          <option value="">{t('users.allRoles')}</option>
          {ROLES.map((role) => (
            <option key={role.id} value={role.id}>
              {t(`users.roles.${role.name}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="w-full sm:w-52">
        <SelectField
          label={t('users.filterStatus')}
          value={activeValue(query.active)}
          onChange={(event) => {
            onChange({ active: activeFromValue(event.target.value) });
          }}
        >
          <option value="">{t('users.allStatuses')}</option>
          <option value="true">{t('users.onlyActive')}</option>
          <option value="false">{t('users.onlyInactive')}</option>
        </SelectField>
      </div>
      <SearchForm
        id="users-search"
        label={t('users.search')}
        placeholder={t('users.searchHint')}
        submitLabel={t('users.searchSubmit')}
        value={query.search}
        onSearch={(search) => {
          onChange({ search });
        }}
      />
    </div>
  );
}
