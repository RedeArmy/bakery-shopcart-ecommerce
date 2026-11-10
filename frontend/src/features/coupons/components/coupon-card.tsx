import { useTranslation } from 'react-i18next';
import { formatDateOnly } from '../../../shared/lib/date';
import { formatMoney } from '../../../shared/lib/money/money';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { RemoveConfirmation, useCardMode } from '../../../shared/ui/remove-confirmation';
import { useDeactivateCoupon } from '../hooks/use-coupons';
import { dayOf } from '../model/coupons';
import type { Coupon } from '../model/coupons';
import { CouponForm } from './coupon-form';

const TONES = {
  Active: 'success',
  NotStarted: 'accent',
  Expired: 'warning',
  Exhausted: 'warning',
  Inactive: 'neutral',
} as const;

/**
 * Un cupón en la administración: su código, cuánto descuenta y a qué, desde cuándo hasta cuándo rige, cuántas veces se usó y en qué
 * estado está (vigente, aún no empieza, vencido, agotado o desactivado). Mientras no esté desactivado se edita o se desactiva, con
 * confirmación: los pedidos que lo usaron lo conservan.
 */
export function CouponCard({
  coupon,
  categoryName,
}: Readonly<{ coupon: Coupon; categoryName: string | undefined }>) {
  const { t } = useTranslation();
  const deactivate = useDeactivateCoupon(coupon.idCoupon);
  const { mode, edit, remove, close } = useCardMode();

  if (mode === 'edit') {
    return (
      <li>
        <CouponForm coupon={coupon} onDone={close} onCancel={close} />
      </li>
    );
  }

  const discount =
    coupon.type === 'Percentage'
      ? t('coupons.percentageOff', { value: Number(coupon.value) })
      : t('coupons.amountOff', { value: formatMoney(coupon.value) });

  return (
    <li className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg text-stone-900">{coupon.code}</h3>
          <p className="text-stone-800">{discount}</p>
        </div>
        <Badge tone={TONES[coupon.status]}>{t(`coupons.status.${coupon.status}`)}</Badge>
      </div>
      <ul className="space-y-1 text-sm text-stone-700">
        {coupon.startsAt && coupon.endsAt ? (
          <li>
            {t('coupons.validity', {
              from: formatDateOnly(dayOf(coupon.startsAt)),
              to: formatDateOnly(dayOf(coupon.endsAt, true)),
            })}
          </li>
        ) : null}
        {coupon.minimumAmount && Number(coupon.minimumAmount) > 0 ? (
          <li>{t('coupons.minimum', { value: formatMoney(coupon.minimumAmount) })}</li>
        ) : null}
        <li>
          {categoryName
            ? t('coupons.onlyCategory', { name: categoryName })
            : t('coupons.anyCategory')}
        </li>
        <li>
          {coupon.totalUsageLimit == null
            ? t('coupons.used', { count: coupon.usageCount ?? 0 })
            : t('coupons.usedOf', { count: coupon.usageCount ?? 0, limit: coupon.totalUsageLimit })}
          {coupon.perCustomerUsageLimit == null
            ? null
            : ` · ${t('coupons.perCustomer', { count: coupon.perCustomerUsageLimit })}`}
        </li>
      </ul>

      {coupon.isActive && mode === 'view' ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={edit}>
            {t('coupons.edit')}
          </Button>
          <Button variant="ghost" onClick={remove}>
            {t('coupons.remove')}
          </Button>
        </div>
      ) : null}

      {mode === 'remove' ? (
        <RemoveConfirmation prefix="coupons" deactivation={deactivate} onClose={close} />
      ) : null}
    </li>
  );
}
