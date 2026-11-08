import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { useNewAttempt } from '../hooks/use-payment';
import type { Payment } from '../hooks/use-payment';

const TONES = {
  Pending: 'warning',
  UnderReview: 'accent',
  Approved: 'success',
  Rejected: 'danger',
  Expired: 'danger',
} as const;

const toneOf = (status: string): 'warning' | 'accent' | 'success' | 'danger' | 'neutral' =>
  (TONES as Record<string, 'warning' | 'accent' | 'success' | 'danger'>)[status] ?? 'neutral';

/**
 * Cómo va el pago y qué sigue: esperar el depósito, la revisión, la aprobación, un rechazo con su motivo (y otro intento si
 * quedan) o el plazo vencido. El estado y los intentos salen del servidor.
 */
export function PaymentStatus({
  idOrder,
  payment,
}: Readonly<{ idOrder: number; payment: Payment }>) {
  const { t, i18n } = useTranslation();
  const attempt = useNewAttempt(idOrder);
  const status = payment.statusName;
  // El efectivo se paga en la sucursal: sus estados hablan de pagar en efectivo y no de depósito ni de comprobante
  const prefix =
    payment.methodKind === 'Cash' && i18n.exists(`payment.status.cash.${status}.title`)
      ? 'cash.'
      : '';
  const known = ['Pending', 'UnderReview', 'Approved', 'Rejected', 'Expired'].includes(status);
  const attemptsLeft = Math.max(0, payment.maxAttempts - payment.attemptsRejected);

  return (
    <section
      aria-labelledby="payment-status"
      className="space-y-3 rounded-card border border-stone-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="payment-status" className="text-2xl text-stone-900">
          {t('payment.status.title')}
        </h2>
        <Badge tone={toneOf(status)}>
          {known ? t(`payment.status.${prefix}${status}.title`) : status}
        </Badge>
      </div>
      {known ? (
        <p className="text-sm text-stone-700">{t(`payment.status.${prefix}${status}.text`)}</p>
      ) : null}
      {status === 'Rejected' ? (
        <>
          {payment.rejectionReason ? (
            <p className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
              {t('payment.status.reason', { reason: payment.rejectionReason })}
            </p>
          ) : null}
          {attemptsLeft > 0 ? (
            <>
              <p className="text-sm text-stone-600">
                {t('payment.status.attemptsLeft', { count: attemptsLeft })}
              </p>
              <Button
                loading={attempt.isPending}
                onClick={() => {
                  attempt.mutate(payment.idBankAccount ?? null);
                }}
              >
                {t('payment.status.retry')}
              </Button>
            </>
          ) : (
            <p className="text-sm text-stone-600">{t('payment.status.noAttempts')}</p>
          )}
          {attempt.isError ? (
            <p role="alert" className="text-sm text-red-700">
              {errorMessage(attempt.error)}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
