import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Price } from '../../../shared/ui/price';
import { useConfirmCash, type CashItem } from '../hooks/use-payment-review';

const TONES: Partial<Record<string, 'warning' | 'success' | 'neutral'>> = {
  Pending: 'warning',
  Approved: 'success',
  Expired: 'neutral',
};

/**
 * Un cobro en efectivo: el pedido que el cliente viene a pagar, cuánto y hasta cuándo. Confirmar es una acción que deja el
 * pedido pagado, así que pide un segundo paso: quien atiende confirma que ya tiene el dinero.
 */
export function CashCard({
  item,
  onOutcome,
}: Readonly<{ item: CashItem; onOutcome: (outcome: string) => void }>) {
  const { t } = useTranslation();
  const confirm = useConfirmCash(item.idPayment);
  const [confirming, setConfirming] = useState(false);

  const pending = item.statusName === 'Pending';
  const tone = TONES[item.statusName] ?? 'neutral';

  return (
    <li className="space-y-4 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-lg text-stone-900">{item.orderNumber}</p>
          <p className="text-sm text-stone-600">
            {item.customerName}
            {item.customerEmail === undefined ? null : ` · ${item.customerEmail}`}
          </p>
        </div>
        <Badge tone={tone}>{t(`cashPayments.statuses.${item.statusName}`)}</Badge>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-stone-500">{t('cashPayments.amount')}</dt>
          <dd className="text-lg text-stone-900">
            <Price amount={item.amount} />
          </dd>
        </div>
        {item.pickupBranchName === undefined || item.pickupBranchName === null ? null : (
          <div>
            <dt className="text-stone-500">{t('cashPayments.branch')}</dt>
            <dd className="text-stone-900">{item.pickupBranchName}</dd>
          </div>
        )}
        {item.requestedDeliveryDate === undefined || item.requestedDeliveryDate === null ? null : (
          <div>
            <dt className="text-stone-500">{t('cashPayments.pickupDate')}</dt>
            <dd className="text-stone-900">{formatDateOnly(item.requestedDeliveryDate)}</dd>
          </div>
        )}
        <div>
          <dt className="text-stone-500">{t('cashPayments.deadline')}</dt>
          <dd className="text-stone-900">{formatDateTime(item.expiresAt)}</dd>
        </div>
      </dl>

      {pending && !confirming ? (
        <Button
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t('cashPayments.confirm')}
        </Button>
      ) : null}
      {pending && confirming ? (
        <section
          aria-label={t('cashPayments.confirmTitle')}
          className="space-y-3 rounded-card border border-amber-200 bg-amber-50 p-4"
        >
          <h4 className="text-lg text-stone-900">{t('cashPayments.confirmTitle')}</h4>
          <p className="text-sm text-stone-700">{t('cashPayments.confirmText')}</p>
          {confirm.isError ? (
            <p role="alert" className="text-sm text-red-900">
              {errorMessage(confirm.error)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              loading={confirm.isPending}
              onClick={() => {
                confirm.mutate(undefined, { onSuccess: onOutcome });
              }}
            >
              {t('cashPayments.confirmYes')}
            </Button>
            <Button
              variant="secondary"
              disabled={confirm.isPending}
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('cashPayments.confirmNo')}
            </Button>
          </div>
        </section>
      ) : null}
    </li>
  );
}
