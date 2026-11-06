import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { useApplyCoupon, useRemoveCoupon } from '../hooks/use-cart';
import { couponReasonKey } from '../model/cart-model';
import type { Cart } from '../model/cart-model';

/** Cupón de descuento: solo las cuentas con sesión pueden usarlo; el visitante recibe la invitación a ingresar. */
export function CouponBox({ cart }: Readonly<{ cart: Cart }>) {
  const { t } = useTranslation();
  const session = useSession();
  const apply = useApplyCoupon();
  const remove = useRemoveCoupon();
  const [code, setCode] = useState('');

  if (session.status !== 'authenticated') {
    return (
      <p className="text-sm text-stone-600">
        <Link to="/login" state={{ from: '/cart' }} className="text-accent hover:underline">
          {t('cart.coupon.signIn')}
        </Link>{' '}
        {t('cart.coupon.signInHint')}
      </p>
    );
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed === '') return;
    apply.mutate(trimmed, {
      onSuccess: () => {
        setCode('');
      },
    });
  };

  if (cart.couponCode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-stone-800">
            {t('cart.coupon.applied')} <Badge tone="accent">{cart.couponCode}</Badge>
          </p>
          <Button
            variant="ghost"
            loading={remove.isPending}
            onClick={() => {
              remove.mutate(undefined);
            }}
          >
            {t('cart.coupon.remove')}
          </Button>
        </div>
        {cart.couponReason ? (
          <p role="status" className="rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t(couponReasonKey(cart.couponReason))}
          </p>
        ) : null}
        {remove.isError ? (
          <p role="alert" className="text-sm text-red-700">
            {errorMessage(remove.error)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <TextField
        label={t('cart.coupon.label')}
        placeholder={t('cart.coupon.placeholder')}
        autoComplete="off"
        maxLength={30}
        value={code}
        error={apply.isError ? errorMessage(apply.error) : undefined}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      <Button type="submit" variant="secondary" loading={apply.isPending} className="w-full">
        {t('cart.coupon.apply')}
      </Button>
    </form>
  );
}
