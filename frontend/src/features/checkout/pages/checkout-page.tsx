import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { hasAccount, hasContact, isGuestSession, useSession } from '../../../shared/auth';
import { ForbiddenPage } from '../../../app/pages/forbidden-page';
import { ButtonLink } from '../../../shared/ui/button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { AccountRequired } from '../../cart/components/account-required';
import { CartSummary } from '../../cart/components/cart-summary';
import { useCart } from '../../cart/hooks/use-cart';
import type { Cart } from '../../cart/model/cart-model';
import { GuestContactForm } from '../components/guest-contact-form';
import { IdentityStep } from '../components/identity-step';
import { LinePersonalisation } from '../components/line-personalisation';
import { RecoveryCodePanel } from '../components/recovery-code-panel';

/** Personalización de cada producto: solo con cuenta. Un invitado o un visitante ve por qué y cómo desbloquearla. */
function PersonalisationSection({ cart, allowed }: Readonly<{ cart: Cart; allowed: boolean }>) {
  const { t } = useTranslation();
  if (!allowed) {
    return (
      <AccountRequired
        title={t('checkout.personalisation.locked.title')}
        text={t('checkout.personalisation.locked.text')}
        from="/checkout"
      />
    );
  }
  return (
    <section aria-labelledby="checkout-personalisation">
      <h2 id="checkout-personalisation" className="text-2xl text-stone-900">
        {t('checkout.personalisation.title')}
      </h2>
      <p className="mt-1 text-sm text-stone-600">{t('checkout.personalisation.intro')}</p>
      <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
        {cart.lines.map((line) => (
          <LinePersonalisation key={line.idVariant} line={line} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Pantalla de pago. Cualquiera puede llegar: quien no tiene sesión elige comprar como invitado o entrar; el invitado da su
 * contacto; quien tiene cuenta personaliza sus productos. La dirección, la fecha de entrega y el depósito se agregan a
 * continuación y son iguales para todos.
 */
export function CheckoutPage() {
  const { t } = useTranslation();
  const session = useSession();
  const cart = useCart();

  // El personal no compra: sus cuentas no son de clientes
  if (session.user !== null && session.user.role !== 'Customer') return <ForbiddenPage />;

  let body;
  if (session.status === 'unknown' || cart.isPending) {
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
    const user = session.user;
    body = (
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-10">
          {user === null ? <IdentityStep /> : null}
          {user !== null && isGuestSession(session) ? <GuestContactForm user={user} /> : null}
          {user !== null && isGuestSession(session) && hasContact(user) ? (
            <RecoveryCodePanel />
          ) : null}
          <PersonalisationSection cart={data} allowed={hasAccount(session)} />
        </div>

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
