import { useTranslation } from 'react-i18next';
import { MaintenanceList } from '../../../shared/ui/maintenance-list';
import { BranchCard } from '../components/branch-card';
import { BranchForm } from '../components/branch-form';
import { useAdminBranches } from '../hooks/use-branches';

/**
 * Mantenimiento de sucursales para el administrador: las que están activas se pueden editar y quitar (desactivar), las
 * desactivadas quedan a la vista porque los pedidos ya hechos las citan. Las reglas las decide el servidor.
 */
export function BranchesPage() {
  const { t } = useTranslation();
  return (
    <MaintenanceList
      title={t('branches.title')}
      intro={t('branches.intro')}
      addLabel={t('branches.add')}
      emptyTitle={t('branches.emptyTitle')}
      emptyText={t('branches.emptyText')}
      query={useAdminBranches()}
      renderItem={(branch) => <BranchCard key={branch.idBranch} branch={branch} />}
      renderForm={(done) => <BranchForm onDone={done} onCancel={done} />}
    />
  );
}
