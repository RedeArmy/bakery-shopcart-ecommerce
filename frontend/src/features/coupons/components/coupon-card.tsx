import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { formatDateOnly } from '../../../shared/lib/date';
import { formatMoney } from '../../../shared/lib/money/money';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { RemoveConfirmation, useCardMode } from '../../../shared/ui/remove-confirmation';
import { useDeactivateCoupon, useDeleteCoupon, useReactivateCoupon } from '../hooks/use-coupons';
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

/** Lo que dice un cupón: desde cuándo hasta cuándo rige, su compra mínima, a qué categoría aplica y cuántas veces se usó. */
function CouponDetails({
  coupon,
  categoryName,
}: Readonly<{ coupon: Coupon; categoryName: string | undefined }>) {
  const { t } = useTranslation();
  const used = coupon.usageCount ?? 0;
  const hasMinimum = coupon.minimumAmount !== undefined && Number(coupon.minimumAmount) > 0;
  const uses =
    coupon.totalUsageLimit == null
      ? t('coupons.used', { count: used })
      : t('coupons.usedOf', { count: used, limit: coupon.totalUsageLimit });
  const perCustomer =
    coupon.perCustomerUsageLimit == null
      ? null
      : ` · ${t('coupons.perCustomer', { count: coupon.perCustomerUsageLimit })}`;

  return (
    <ul className="space-y-1 text-sm text-stone-700">
      {coupon.startsAt && coupon.endsAt ? (
        <li>
          {t('coupons.validity', {
            from: formatDateOnly(dayOf(coupon.startsAt)),
            to: formatDateOnly(dayOf(coupon.endsAt, true)),
          })}
        </li>
      ) : null}
      {hasMinimum && coupon.minimumAmount ? (
        <li>{t('coupons.minimum', { value: formatMoney(coupon.minimumAmount) })}</li>
      ) : null}
      <li>
        {categoryName
          ? t('coupons.onlyCategory', { name: categoryName })
          : t('coupons.anyCategory')}
      </li>
      <li>
        {uses}
        {perCustomer}
      </li>
    </ul>
  );
}

/**
 * Lo que se puede hacer con un cupón desactivado: volver a activarlo de un clic o, solo entonces, borrarlo por completo, con
 * confirmación. El servidor lo borra únicamente si ningún pedido lo usó; si no, lo conserva y su motivo se muestra.
 */
function DeactivatedActions({ coupon }: Readonly<{ coupon: Coupon }>) {
  const { t } = useTranslation();
  const reactivate = useReactivateCoupon(coupon.idCoupon);
  const deleteCoupon = useDeleteCoupon(coupon.idCoupon);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      {deleting ? (
        <RemoveConfirmation
          prefix="coupons.deletion"
          deactivation={deleteCoupon}
          onClose={() => {
            setDeleting(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            loading={reactivate.isPending}
            onClick={() => {
              reactivate.mutate();
            }}
          >
            {t('coupons.activate')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t('coupons.delete')}
          </Button>
        </div>
      )}
      {reactivate.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(reactivate.error)}
        </p>
      ) : null}
    </>
  );
}

/**
 * Un cupón en la administración: su código, cuánto descuenta y a qué, desde cuándo hasta cuándo rige, cuántas veces se usó y en qué
 * estado está (vigente, aún no empieza, vencido, agotado o desactivado). Mientras no esté desactivado se edita o se desactiva, con
 * confirmación: los pedidos que lo usaron lo conservan. Uno desactivado se vuelve a activar o se borra.
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
      <CouponDetails coupon={coupon} categoryName={categoryName} />

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

      {/* Un cupón desactivado se puede volver a activar o, solo entonces, borrar por completo */}
      {coupon.isActive ? null : <DeactivatedActions coupon={coupon} />}
    </li>
  );
}
