import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { QuantityStepper } from '../../../shared/ui/quantity-stepper';
import { useCart, useSetCartItem } from '../hooks/use-cart';
import { MAX_QUANTITY, nextQuantity } from '../model/cart-model';

/** Agregar la variante elegida al carrito: cantidad y el aviso de lo que ya había. La personalización se escribe al pagar. */
export function AddToCart({
  idVariant,
  available,
}: Readonly<{ idVariant: number; available: number | undefined }>) {
  const { t } = useTranslation();
  const cart = useCart();
  const setItem = useSetCartItem();
  const [quantity, setQuantity] = useState(1);

  const existing = cart.data?.lines.find((line) => line.idVariant === idVariant);
  const inCart = existing?.quantity ?? 0;
  const soldOut = available !== undefined && available <= 0;
  // Se puede elegir hasta lo que queda, descontando lo que ya está en el carrito
  const room = Math.max(1, Math.min(MAX_QUANTITY, (available ?? MAX_QUANTITY) - inCart));

  const add = (): void => {
    setItem.mutate({
      idVariant,
      quantity: nextQuantity(inCart, quantity),
      // `PUT` reemplaza la línea: se reenvía la personalización que ya tenía para no borrarla al sumar unidades
      inscription: existing?.inscription ?? null,
    });
  };

  return (
    <div className="space-y-4 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-4">
        <QuantityStepper
          label={t('cart.add.quantity')}
          value={Math.min(quantity, room)}
          max={room}
          disabled={soldOut}
          onChange={setQuantity}
        />
        <Button className="flex-1" disabled={soldOut} loading={setItem.isPending} onClick={add}>
          {setItem.isPending ? t('cart.add.adding') : t('cart.add.button')}
        </Button>
      </div>
      {inCart > 0 ? (
        <p className="text-sm text-stone-600">{t('cart.add.alreadyInCart', { count: inCart })}</p>
      ) : null}
      {setItem.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(setItem.error)}
        </p>
      ) : null}
      {setItem.isSuccess ? (
        <output className="block text-sm text-emerald-800">
          {t('cart.add.added')}{' '}
          <Link to="/cart" className="font-medium underline">
            {t('cart.add.viewCart')}
          </Link>
        </output>
      ) : null}
    </div>
  );
}
