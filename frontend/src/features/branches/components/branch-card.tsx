import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { RemoveConfirmation } from '../../../shared/ui/remove-confirmation';
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
        <RemoveConfirmation
          title={t('branches.removeTitle')}
          text={t('branches.removeText')}
          confirmLabel={t('branches.removeConfirm')}
          keepLabel={t('branches.removeKeep')}
          pending={deactivate.isPending}
          error={deactivate.error}
          onKeep={() => {
            setMode('view');
          }}
          onConfirm={() => {
            // Al lograrse, la sucursal pasa a desactivada y la confirmación se cierra
            deactivate.mutate(undefined, {
              onSuccess: () => {
                setMode('view');
              },
            });
          }}
        />
      ) : null}
    </li>
  );
}
