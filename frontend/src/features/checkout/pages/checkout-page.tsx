import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../../../shared/ui/button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { CartSummary } from '../../cart/components/cart-summary';
import { useCart } from '../../cart/hooks/use-cart';
import { LinePersonalisation } from '../components/line-personalisation';

/**
 * Pantalla de pago (cliente con sesión). Este primer paso reúne los extras del pedido: la personalización de cada
 * producto. La dirección, la fecha de entrega y el depósito se agregan a continuación.
 */
export function CheckoutPage() {
  const { t } = useTranslation();
  const cart = useCart();

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
        <section aria-labelledby="checkout-personalisation">
          <h2 id="checkout-personalisation" className="text-2xl text-stone-900">
            {t('checkout.personalisation.title')}
          </h2>
          <p className="mt-1 text-sm text-stone-600">{t('checkout.personalisation.intro')}</p>
          <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
            {data.lines.map((line) => (
              <LinePersonalisation key={line.idVariant} line={line} />
            ))}
          </ul>
        </section>

        <aside
          aria-labelledby="checkout-summary"
          className="space-y-5 rounded-card border border-stone-200 bg-white p-5 lg:sticky lg:top-24"
        >
          <h2 id="checkout-summary" className="text-xl text-stone-900">
            {t('cart.summary.title')}
          </h2>
          <CartSummary cart={data} />
          <Link to="/cart" className="block text-sm text-accent hover:underline">
            {t('checkout.backToCart')}
          </Link>
        </aside>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl text-stone-900">{t('checkout.title')}</h1>
      </header>
      {body}
    </div>
  );
}
