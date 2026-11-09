import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { formatDateTime } from '../../../shared/lib/date';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { RemoveConfirmation, useCardMode } from '../../../shared/ui/remove-confirmation';
import { useDeactivateUser, useReactivateUser } from '../hooks/use-users';
import { isLocked } from '../model/users';

type UserAccount = components['schemas']['UserAccount'];

/**
 * Una cuenta: quién es, su rol, si está activa y, si hace falta, hasta cuándo está bloqueada. Una cuenta no se borra: se desactiva,
 * con confirmación porque cierra sus sesiones, y se vuelve a activar de un clic. La propia cuenta de quien administra no se puede
 * desactivar (el servidor tampoco lo permite: dejaría el sistema sin quien pueda reactivarla), así que ni se ofrece.
 */
export function UserCard({ account, isSelf }: Readonly<{ account: UserAccount; isSelf: boolean }>) {
  const { t } = useTranslation();
  const { mode, remove, close } = useCardMode();
  const deactivate = useDeactivateUser(account.idUser);
  const reactivate = useReactivateUser(account.idUser);
  const roleName = t(`users.roles.${account.roleName}`, { defaultValue: account.roleName });

  let action = null;
  if (isSelf) action = <p className="text-sm text-stone-600">{t('users.self')}</p>;
  else if (account.isActive) {
    action = (
      <Button variant="secondary" onClick={remove}>
        {t('users.deactivate')}
      </Button>
    );
  } else {
    action = (
      <Button
        loading={reactivate.isPending}
        onClick={() => {
          reactivate.mutate();
        }}
      >
        {t('users.reactivate')}
      </Button>
    );
  }

  return (
    <li className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg text-stone-900">{account.fullName}</p>
            <Badge tone="accent">{roleName}</Badge>
            <Badge tone={account.isActive ? 'success' : 'danger'}>
              {account.isActive ? t('users.active') : t('users.inactive')}
            </Badge>
          </div>
          <p className="break-words text-sm text-stone-700">{account.email}</p>
          <p className="text-sm text-stone-600">
            {account.phone ? `${account.phone} · ` : null}
            {account.createdAt === undefined
              ? null
              : t('users.since', { date: formatDateTime(account.createdAt) })}
          </p>
          {isLocked(account.lockedUntil) && account.lockedUntil ? (
            <p className="text-sm text-amber-900">
              {t('users.lockedUntil', { time: formatDateTime(account.lockedUntil) })}
            </p>
          ) : null}
        </div>
        {mode === 'remove' ? null : action}
      </div>
      {reactivate.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(reactivate.error)}
        </p>
      ) : null}
      {mode === 'remove' ? (
        <RemoveConfirmation prefix="users" deactivation={deactivate} onClose={close} />
      ) : null}
    </li>
  );
}
