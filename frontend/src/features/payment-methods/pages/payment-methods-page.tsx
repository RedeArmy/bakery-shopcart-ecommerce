import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { PaymentMethodCard } from '../components/payment-method-card';
import { PaymentMethodForm } from '../components/payment-method-form';
import { useAdminPaymentMethods } from '../hooks/use-payment-methods';

/**
 * Mantenimiento de métodos de pago para el administrador: lo que se ofrece al cliente al pagar, y para qué forma de recibir el
 * pedido (el efectivo solo en recogidas). Quitar un método lo desactiva: los pagos ya hechos lo conservan. Las reglas las
 * decide el servidor.
 */
export function PaymentMethodsPage() {
  const { t } = useTranslation();
  const methods = useAdminPaymentMethods();
  const [adding, setAdding] = useState(false);

  let content;
  if (methods.isPending) {
    content = <LoadingSkeleton count={3} />;
  } else if (methods.isError) {
    content = <ErrorState error={methods.error} onRetry={() => void methods.refetch()} />;
  } else if (methods.data.length === 0 && !adding) {
    content = (
      <EmptyState
        title={t('paymentMethods.emptyTitle')}
        text={t('paymentMethods.emptyText')}
        action={
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('paymentMethods.add')}
          </Button>
        }
      />
    );
  } else {
    content = (
      <ul className="space-y-3">
        {methods.data.map((method) => (
          <PaymentMethodCard key={method.idPaymentMethod} method={method} />
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl text-stone-900">{t('paymentMethods.title')}</h1>
          <p className="mt-1 max-w-2xl text-stone-600">{t('paymentMethods.intro')}</p>
        </div>
        {adding ? null : (
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('paymentMethods.add')}
          </Button>
        )}
      </header>
      {adding ? (
        <PaymentMethodForm
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
