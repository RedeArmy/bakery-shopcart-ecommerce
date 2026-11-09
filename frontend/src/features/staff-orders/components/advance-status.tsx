import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { useChangeStatus } from '../hooks/use-staff-orders';
import type { NextStep } from '../model/staff-orders';

/** El paso siguiente del pedido (preparar, despachar o entregar) en un solo botón, con el error del servidor si no se pudo. */
export function AdvanceStatus({ idOrder, step }: Readonly<{ idOrder: number; step: NextStep }>) {
  const { t } = useTranslation();
  const change = useChangeStatus(idOrder);
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        loading={change.isPending}
        onClick={() => {
          change.mutate(step);
        }}
      >
        {t(`staffOrders.steps.${step}`)}
      </Button>
      {change.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(change.error)}
        </p>
      ) : null}
    </div>
  );
}
