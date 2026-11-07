import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { useCancelOrder } from '../hooks/use-orders';

/** Cancelar pide una confirmación aparte, porque un pedido ya pagado abre un reembolso y no se deshace. */
export function CancelOrder({ idOrder, paid }: Readonly<{ idOrder: number; paid: boolean }>) {
  const { t } = useTranslation();
  const cancel = useCancelOrder(idOrder);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  if (!asking) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setAsking(true);
        }}
      >
        {t('orders.cancel.open')}
      </Button>
    );
  }
  return (
    <section
      aria-labelledby="cancel-order"
      className="space-y-3 rounded-card border border-red-200 bg-red-50 p-4"
    >
      <h2 id="cancel-order" className="text-lg text-red-900">
        {t('orders.cancel.title')}
      </h2>
      <p className="text-sm text-red-900">
        {paid ? t('orders.cancel.paidText') : t('orders.cancel.text')}
      </p>
      <TextField
        label={t('orders.cancel.reason')}
        optionalLabel={t('common.optional')}
        maxLength={200}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      {cancel.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(cancel.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          loading={cancel.isPending}
          onClick={() => {
            cancel.mutate(reason.trim());
          }}
        >
          {t('orders.cancel.confirm')}
        </Button>
        <Button
          variant="secondary"
          disabled={cancel.isPending}
          onClick={() => {
            setAsking(false);
          }}
        >
          {t('orders.cancel.keep')}
        </Button>
      </div>
    </section>
  );
}
