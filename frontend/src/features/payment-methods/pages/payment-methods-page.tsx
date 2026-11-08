import { useTranslation } from 'react-i18next';
import { MaintenanceList } from '../../../shared/ui/maintenance-list';
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
  return (
    <MaintenanceList
      title={t('paymentMethods.title')}
      intro={t('paymentMethods.intro')}
      addLabel={t('paymentMethods.add')}
      emptyTitle={t('paymentMethods.emptyTitle')}
      emptyText={t('paymentMethods.emptyText')}
      query={useAdminPaymentMethods()}
      renderItem={(method) => <PaymentMethodCard key={method.idPaymentMethod} method={method} />}
      renderForm={(done) => <PaymentMethodForm onDone={done} onCancel={done} />}
    />
  );
}
