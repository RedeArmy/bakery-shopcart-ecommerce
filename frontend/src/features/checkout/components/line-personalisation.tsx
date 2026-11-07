import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { useSetCartItem } from '../../cart/hooks/use-cart';
import { MAX_INSCRIPTION } from '../../cart/model/cart-model';
import type { CartLine } from '../../cart/model/cart-model';

/**
 * La personalización de un producto (lo que se escribe en el pastel). Va por línea porque así existe en el pedido; se
 * guarda en el carrito con la misma cantidad que ya tenía, y de ahí pasa a la línea del pedido al confirmar.
 */
export function LinePersonalisation({ line }: Readonly<{ line: CartLine }>) {
  const { t } = useTranslation();
  const setItem = useSetCartItem();
  const saved = line.inscription ?? '';
  const [text, setText] = useState(saved);
  const changed = text.trim() !== saved;
  const name = line.productName ?? line.sku ?? '';

  const save = (): void => {
    setItem.mutate({
      idVariant: line.idVariant,
      quantity: line.quantity,
      inscription: text.trim() === '' ? null : text.trim(),
    });
  };

  return (
    <li className="space-y-2 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg text-stone-900">{name}</h3>
        <p className="shrink-0 text-sm text-stone-600">
          {t('checkout.personalisation.quantity', { count: line.quantity })}
        </p>
      </div>
      <TextField
        label={t('checkout.personalisation.label', { name })}
        placeholder={t('checkout.personalisation.placeholder')}
        hint={t('checkout.personalisation.counter', { count: text.length, max: MAX_INSCRIPTION })}
        maxLength={MAX_INSCRIPTION}
        value={text}
        error={setItem.isError ? errorMessage(setItem.error) : undefined}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          disabled={!changed}
          loading={setItem.isPending}
          onClick={save}
          aria-label={t('checkout.personalisation.saveLabel', { name })}
        >
          {t('checkout.personalisation.save')}
        </Button>
        {setItem.isSuccess && !changed ? (
          <output className="text-sm text-emerald-800">
            {t('checkout.personalisation.saved')}
          </output>
        ) : null}
      </div>
    </li>
  );
}
