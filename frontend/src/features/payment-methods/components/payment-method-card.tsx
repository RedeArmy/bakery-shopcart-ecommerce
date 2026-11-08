import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { RemoveConfirmation, useCardMode } from '../../../shared/ui/remove-confirmation';
import { useDeactivatePaymentMethod, useUpdatePaymentMethod } from '../hooks/use-payment-methods';
import type { PaymentMethod } from '../hooks/use-payment-methods';
import { PaymentMethodForm } from './payment-method-form';

/** Para qué formas de recibir el pedido se ofrece el método, dicho en una frase. */
const appliesKey = (method: PaymentMethod): string => {
  if (method.appliesToDelivery && method.appliesToPickup) return 'both';
  return method.appliesToPickup ? 'pickup' : 'delivery';
};

/** Un método de pago en la administración: su texto, dónde se ofrece y las acciones (editar, quitar o reactivar). */
export function PaymentMethodCard({ method }: Readonly<{ method: PaymentMethod }>) {
  const { t } = useTranslation();
  const deactivate = useDeactivatePaymentMethod(method.idPaymentMethod);
  const reactivate = useUpdatePaymentMethod(method.idPaymentMethod);
  const { mode, edit, remove, close } = useCardMode();

  if (mode === 'edit') {
    return (
      <li>
        <PaymentMethodForm method={method} onDone={close} onCancel={close} />
      </li>
    );
  }

  return (
    <li className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg text-stone-900">{method.title}</h3>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">{t(`paymentMethods.kinds.${method.kind}`)}</Badge>
          <Badge tone={method.isActive ? 'success' : 'neutral'}>
            {method.isActive
              ? t('paymentMethods.status.active')
              : t('paymentMethods.status.inactive')}
          </Badge>
        </div>
      </div>
      {method.description ? <p className="text-sm text-stone-700">{method.description}</p> : null}
      <p className="text-sm text-stone-600">{t(`paymentMethods.applies.${appliesKey(method)}`)}</p>

      {mode === 'view' ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={edit}>
            {t('paymentMethods.edit')}
          </Button>
          {method.isActive ? (
            <Button variant="ghost" onClick={remove}>
              {t('paymentMethods.remove')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              loading={reactivate.isPending}
              onClick={() => {
                reactivate.mutate({
                  values: {
                    kind: method.kind === 'Cash' ? 'Cash' : 'Deposit',
                    title: method.title,
                    description: method.description ?? '',
                    appliesToDelivery: method.appliesToDelivery,
                    appliesToPickup: method.appliesToPickup,
                  },
                  isActive: true,
                });
              }}
            >
              {t('paymentMethods.reactivate')}
            </Button>
          )}
        </div>
      ) : null}
      {reactivate.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(reactivate.error)}
        </p>
      ) : null}

      {mode === 'remove' ? (
        <RemoveConfirmation prefix="paymentMethods" deactivation={deactivate} onClose={close} />
      ) : null}
    </li>
  );
}
