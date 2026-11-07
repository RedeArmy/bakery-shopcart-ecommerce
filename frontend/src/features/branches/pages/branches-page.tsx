import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { BranchCard } from '../components/branch-card';
import { BranchForm } from '../components/branch-form';
import { useAdminBranches } from '../hooks/use-branches';

/**
 * Mantenimiento de sucursales para el administrador: las que están activas se pueden editar y quitar (desactivar), las
 * desactivadas quedan a la vista porque los pedidos ya hechos las citan. Las reglas las decide el servidor.
 */
export function BranchesPage() {
  const { t } = useTranslation();
  const branches = useAdminBranches();
  const [adding, setAdding] = useState(false);

  let content;
  if (branches.isPending) {
    content = <LoadingSkeleton count={3} />;
  } else if (branches.isError) {
    content = <ErrorState error={branches.error} onRetry={() => void branches.refetch()} />;
  } else if (branches.data.length === 0 && !adding) {
    content = (
      <EmptyState
        title={t('branches.emptyTitle')}
        text={t('branches.emptyText')}
        action={
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('branches.add')}
          </Button>
        }
      />
    );
  } else {
    content = (
      <ul className="space-y-3">
        {branches.data.map((branch) => (
          <BranchCard key={branch.idBranch} branch={branch} />
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl text-stone-900">{t('branches.title')}</h1>
          <p className="mt-1 max-w-2xl text-stone-600">{t('branches.intro')}</p>
        </div>
        {adding ? null : (
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('branches.add')}
          </Button>
        )}
      </header>
      {adding ? (
        <BranchForm
          onDone={() => {
            setAdding(false);
          }}
          onCancel={() => {
            setAdding(false);
          }}
        />
      ) : null}
      {content}
    </div>
  );
}
