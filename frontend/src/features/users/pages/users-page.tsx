import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../../shared/auth';
import { SelectField } from '../../../shared/ui/fields';
import { Pagination } from '../../../shared/ui/pagination';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { SearchForm } from '../../payment-review/components/search-form';
import { UserCard } from '../components/user-card';
import { useUsers } from '../hooks/use-users';
import {
  PAGE_SIZE,
  ROLES,
  activeFromValue,
  activeValue,
  parseUsersQuery,
  usersParams,
} from '../model/users';
import type { UsersQuery } from '../model/users';

/**
 * Las cuentas (RF-01), solo para el administrador: se buscan por nombre o correo, se filtran por rol y por estado y se paginan en
 * el servidor. Una cuenta no se borra: se desactiva y se reactiva. Los invitados no aparecen: sus pedidos se ven en la lista de
 * pedidos. El texto, el rol, el estado y la página viven en la dirección, así un enlace lleva a la misma lista.
 */
export function UsersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { user } = useSession();
  const query = parseUsersQuery(params);
  const { data, isPending, isError, error, refetch } = useUsers(query);

  // Cambiar un filtro vuelve a la primera página
  const change = (next: Partial<UsersQuery>): void => {
    setParams(usersParams({ ...query, page: 1, ...next }));
  };

  let content: ReactNode;
  if (isPending) {
    content = <LoadingSkeleton count={4} />;
  } else if (isError) {
    content = <ErrorState error={error} onRetry={() => void refetch()} />;
  } else if (data.items.length === 0) {
    content = <EmptyState title={t('users.emptyTitle')} text={t('users.emptyText')} />;
  } else {
    content = (
      <>
        <p className="text-sm text-stone-600">{t('users.total', { count: data.total })}</p>
        <ul className="space-y-3">
          {data.items.map((account) => (
            <UserCard
              key={account.idUser}
              account={account}
              isSelf={account.idUser === user?.idUser}
            />
          ))}
        </ul>
        <Pagination
          page={query.page}
          pages={Math.ceil(data.total / PAGE_SIZE)}
          onChange={(page) => {
            setParams(usersParams({ ...query, page }));
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('users.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('users.intro')}</p>
      </header>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-52">
          <SelectField
            label={t('users.filterRole')}
            value={query.role === null ? '' : String(query.role)}
            onChange={(event) => {
              change({ role: event.target.value === '' ? null : Number(event.target.value) });
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
              change({ active: activeFromValue(event.target.value) });
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
            change({ search });
          }}
        />
      </div>
      {content}
    </div>
  );
}
