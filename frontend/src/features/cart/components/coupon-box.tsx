import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { auth } from '../../../shared/auth';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { useApplyCoupon, useRemoveCoupon } from '../hooks/use-cart';
import { useStartGuest } from '../hooks/use-start-guest';
import { couponReasonKey } from '../model/cart-model';
import type { Cart } from '../model/cart-model';

/**
 * Cupón de descuento. No exige cuenta: quien todavía no tiene sesión recibe una de invitado al aplicarlo (ADR-0027), con su
 * carrito, y el cupón se descuenta de esa cuenta.
 */
export function CouponBox({ cart }: Readonly<{ cart: Cart }>) {
  const { t } = useTranslation();
  const apply = useApplyCoupon();
  const remove = useRemoveCoupon();
  const startGuest = useStartGuest();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed === '') return;
    try {
      // Primero la sesión de invitado y la fusión de su carrito; después el cupón, ya como de esa cuenta
      if (auth.getState().status !== 'authenticated') await startGuest.mutateAsync();
      await apply.mutateAsync(trimmed);
      setCode('');
      // La lectura del carrito que pudo salir antes de aplicar el cupón no debe pisar el resultado
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch {
      // El motivo se muestra desde el estado de cada operación
    }
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
          <output className="block rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t(couponReasonKey(cart.couponReason))}
          </output>
        ) : null}
        {remove.isError ? (
          <p role="alert" className="text-sm text-red-700">
            {errorMessage(remove.error)}
          </p>
        ) : null}
      </div>
    );
  }

  const failure = startGuest.error ?? (apply.isError ? apply.error : null);
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-3">
      <TextField
        label={t('cart.coupon.label')}
        placeholder={t('cart.coupon.placeholder')}
        autoComplete="off"
        maxLength={30}
        value={code}
        error={failure === null ? undefined : errorMessage(failure)}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      <Button
        type="submit"
        variant="secondary"
        loading={apply.isPending || startGuest.isPending}
        className="w-full"
      >
        {t('cart.coupon.apply')}
      </Button>
    </form>
  );
}
