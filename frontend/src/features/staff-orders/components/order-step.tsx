import { useTranslation } from 'react-i18next';
import type { OrderAction } from '../../orders/model/order-status';
import { stepToTake } from '../model/staff-orders';
import { AdvanceStatus } from './advance-status';

/**
 * Lo que el personal puede hacer ahora con el estado del pedido: dar el siguiente paso, o saber que no le toca. Todo sale de lo que
 * el servidor ofrece: un paso que ofrece es un botón; un paso que el estado permite pero está reservado a los operadores (un
 * administrador no entrega a domicilio) se explica en lugar de esconderse o de mostrar un botón que el servidor rechazaría.
 */
export function OrderStep({
  idOrder,
  allowed,
  operatorOnly,
}: Readonly<{
  idOrder: number;
  allowed: readonly OrderAction[];
  operatorOnly: readonly OrderAction[];
}>) {
  const { t } = useTranslation();
  const step = stepToTake(allowed);
  if (step !== null) return <AdvanceStatus idOrder={idOrder} step={step} />;
  if (stepToTake(operatorOnly) === null) return null;
  return (
    <p className="rounded-card bg-stone-100 p-3 text-sm text-stone-700">
      {t('staffOrders.operatorOnly')}
    </p>
  );
}
