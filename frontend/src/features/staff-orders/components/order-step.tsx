import { useTranslation } from 'react-i18next';
import { useSession } from '../../../shared/auth';
import { canTakeStep, nextStep } from '../model/staff-orders';
import { AdvanceStatus } from './advance-status';

/**
 * Lo que el personal puede hacer ahora con el estado del pedido: dar el siguiente paso, o saber que no le toca. Un pedido a
 * domicilio lo entrega un operador, así que a un administrador se le explica en lugar de mostrarle un botón que el servidor rechazaría.
 */
export function OrderStep({
  idOrder,
  status,
  fulfilmentType,
}: Readonly<{ idOrder: number; status: string; fulfilmentType: string | undefined }>) {
  const { t } = useTranslation();
  const session = useSession();
  const step = nextStep(status, fulfilmentType);
  if (step === null) return null;
  if (canTakeStep(step, fulfilmentType, session.user?.role)) {
    return <AdvanceStatus idOrder={idOrder} step={step} />;
  }
  return (
    <p className="rounded-card bg-stone-100 p-3 text-sm text-stone-700">
      {t('staffOrders.operatorOnly')}
    </p>
  );
}
