import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../../shared/auth';
import { PagedResults } from '../../../shared/ui/paged-results';
import { UserCard } from '../components/user-card';
import { UsersFilters } from '../components/users-filters';
import { useUsers } from '../hooks/use-users';
import { PAGE_SIZE, parseUsersQuery, usersParams } from '../model/users';
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
  const result = useUsers(query);

  // Cambiar un filtro vuelve a la primera página
  const change = (next: Partial<UsersQuery>): void => {
    setParams(usersParams({ ...query, page: 1, ...next }));
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('users.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('users.intro')}</p>
      </header>
      <UsersFilters query={query} onChange={change} />
      <PagedResults
        prefix="users"
        result={result}
        page={query.page}
        pageSize={PAGE_SIZE}
        onPage={(page) => {
          setParams(usersParams({ ...query, page }));
        }}
        renderItem={(account) => (
          <UserCard
            key={account.idUser}
            account={account}
            isSelf={account.idUser === user?.idUser}
          />
        )}
      />
    </div>
  );
}
