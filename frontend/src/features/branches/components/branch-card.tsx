import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { useDeactivateBranch } from '../hooks/use-branches';
import type { Branch } from '../hooks/use-branches';
import { BranchForm } from './branch-form';

/** Una sucursal en la administración: sus datos, cuántos pedidos esperan en ella y las acciones mientras está activa. */
export function BranchCard({ branch }: Readonly<{ branch: Branch }>) {
  const { t } = useTranslation();
  const deactivate = useDeactivateBranch(branch.idBranch);
  const [mode, setMode] = useState<'view' | 'edit' | 'remove'>('view');

  if (mode === 'edit') {
    return (
      <li>
        <BranchForm
          branch={branch}
          onDone={() => {
            setMode('view');
          }}
          onCancel={() => {
            setMode('view');
          }}
        />
      </li>
    );
  }

  return (
    <li className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg text-stone-900">{branch.name}</h3>
        <Badge tone={branch.isActive ? 'success' : 'neutral'}>
          {branch.isActive ? t('branches.status.active') : t('branches.status.inactive')}
        </Badge>
      </div>
      <p className="text-sm text-stone-700">
        {branch.line1}
        <br />
        {branch.municipality}, {branch.department}
        {branch.phone ? ` · ${branch.phone}` : ''}
      </p>
      {branch.openingHours ? <p className="text-sm text-stone-600">{branch.openingHours}</p> : null}
      {branch.isActive ? (
        <p className="text-sm text-stone-600">
          {t('branches.openOrders', { count: branch.openOrders ?? 0 })}
        </p>
      ) : null}

      {branch.isActive && mode === 'view' ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setMode('edit');
            }}
          >
            {t('branches.edit')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setMode('remove');
            }}
          >
            {t('branches.remove')}
          </Button>
        </div>
      ) : null}

      {mode === 'remove' ? (
        <section
          aria-label={t('branches.removeTitle')}
          className="space-y-3 rounded-card border border-red-200 bg-red-50 p-4"
        >
          <h4 className="text-lg text-red-900">{t('branches.removeTitle')}</h4>
          <p className="text-sm text-red-900">{t('branches.removeText')}</p>
          {deactivate.isError ? (
            <p role="alert" className="text-sm text-red-900">
              {errorMessage(deactivate.error)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              loading={deactivate.isPending}
              onClick={() => {
                // Al lograrse, la sucursal pasa a desactivada y la confirmación se cierra
                deactivate.mutate(undefined, {
                  onSuccess: () => {
                    setMode('view');
                  },
                });
              }}
            >
              {t('branches.removeConfirm')}
            </Button>
            <Button
              variant="secondary"
              disabled={deactivate.isPending}
              onClick={() => {
                setMode('view');
              }}
            >
              {t('branches.removeKeep')}
            </Button>
          </div>
        </section>
      ) : null}
    </li>
  );
}
