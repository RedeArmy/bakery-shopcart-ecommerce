import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button, ButtonLink } from '../../../shared/ui/button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { CartLineRow } from '../components/cart-line-row';
import { CartSummary } from '../components/cart-summary';
import { CouponBox } from '../components/coupon-box';
import { useCart, useRemoveCartItem, useSetCartItem } from '../hooks/use-cart';
import { lineBlocked } from '../model/cart-model';
import type { Cart } from '../model/cart-model';

/** Botón para seguir al pago: no pide cuenta (quien no la tiene paga como invitado); una línea agotada lo bloquea. */
function CheckoutAction({ cart }: Readonly<{ cart: Cart }>) {
  const { t } = useTranslation();
  const blocked = cart.hasUnavailableLines === true || cart.lines.some(lineBlocked);

  if (blocked) {
    return (
      <div className="space-y-2">
        <Button disabled className="w-full">
          {t('cart.checkout.continue')}
        </Button>
        <output className="block text-sm text-amber-900">{t('cart.checkout.blocked')}</output>
      </div>
    );
  }
  return (
    <ButtonLink to="/checkout" className="w-full">
      {t('cart.checkout.continue')}
    </ButtonLink>
  );
}

export function CartPage() {
  const { t } = useTranslation();
  const cart = useCart();
  const setItem = useSetCartItem();
  const remove = useRemoveCartItem();
  const busy = setItem.isPending || remove.isPending;
  const actionError = setItem.error ?? remove.error;

  let body;
  if (cart.isPending) {
    body = <LoadingSkeleton count={4} />;
  } else if (cart.isError) {
    body = <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />;
  } else if (cart.data.lines.length === 0) {
    body = (
      <EmptyState
        title={t('cart.emptyTitle')}
        text={t('cart.emptyText')}
        action={<ButtonLink to="/catalogue">{t('cart.emptyCta')}</ButtonLink>}
      />
    );
  } else {
    const data = cart.data;
    body = (
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <section aria-labelledby="cart-lines">
          <h2 id="cart-lines" className="sr-only">
            {t('cart.linesHeading')}
          </h2>
          <ul className="divide-y divide-stone-200 border-y border-stone-200" aria-busy={busy}>
            {data.lines.map((line) => (
              <CartLineRow
                key={line.idVariant}
                line={line}
                busy={busy}
                onQuantity={(quantity) => {
                  setItem.mutate({
                    idVariant: line.idVariant,
                    quantity,
                    inscription: line.inscription ?? null,
                  });
                }}
                onRemove={() => {
                  remove.mutate(line.idVariant);
                }}
              />
            ))}
          </ul>
        </section>

        <aside
          aria-labelledby="cart-summary"
          className="space-y-5 rounded-card border border-stone-200 bg-white p-5 lg:sticky lg:top-24"
        >
          <h2 id="cart-summary" className="text-xl text-stone-900">
            {t('cart.summary.title')}
          </h2>
          <CartSummary cart={data} />
          <CouponBox cart={data} />
          <CheckoutAction cart={data} />
        </aside>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl text-stone-900">{t('cart.title')}</h1>
        {cart.data === undefined || cart.data.lines.length === 0 ? null : (
          <p className="mt-2 text-stone-600">{t('cart.items', { count: cart.data.itemCount })}</p>
        )}
      </header>
      {actionError === null ? null : (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(actionError)}
        </p>
      )}
      {body}
    </div>
  );
}
