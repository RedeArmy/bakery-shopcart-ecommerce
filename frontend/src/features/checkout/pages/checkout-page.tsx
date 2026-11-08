import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { hasAccount, hasContact, isGuestSession, useSession } from '../../../shared/auth';
import { ForbiddenPage } from '../../../app/pages/forbidden-page';
import { Disclosure } from '../../../shared/ui/disclosure';
import { AccountActions } from '../../cart/components/account-required';
import { CartColumns, CartGate } from '../../cart/components/cart-layout';
import { CartSummary } from '../../cart/components/cart-summary';
import { useCart } from '../../cart/hooks/use-cart';
import type { Cart } from '../../cart/model/cart-model';
import { GuestContactForm } from '../components/guest-contact-form';
import { IdentityStep } from '../components/identity-step';
import { LinePersonalisation } from '../components/line-personalisation';
import { PurchaseSteps } from '../components/purchase-steps';

/**
 * Personalización de cada producto, en una sección desplegable. Con cuenta se escribe el mensaje (abierta, porque es lo que
 * se viene a hacer aquí); un invitado o un visitante la ve cerrada, con el título que dice que necesita una cuenta, y al
 * abrirla encuentra por qué y cómo desbloquearla.
 */
function PersonalisationSection({ cart, allowed }: Readonly<{ cart: Cart; allowed: boolean }>) {
  const { t } = useTranslation();
  if (!allowed) {
    return (
      <Disclosure id="checkout-personalisation" title={t('checkout.personalisation.locked.title')}>
        <p className="text-sm text-stone-600">{t('checkout.personalisation.locked.text')}</p>
        <AccountActions from="/checkout" />
      </Disclosure>
    );
  }
  return (
    <Disclosure
      id="checkout-personalisation"
      title={t('checkout.personalisation.title')}
      summary={t('checkout.personalisation.intro')}
      defaultOpen
    >
      <ul className="divide-y divide-stone-200 border-y border-stone-200">
        {cart.lines.map((line) => (
          <LinePersonalisation key={line.idVariant} line={line} />
        ))}
      </ul>
    </Disclosure>
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

  const user = session.user;
  const body = (
    <CartGate query={cart} waiting={session.status === 'unknown'}>
      {(data) => (
        <CartColumns
          summaryId="checkout-summary"
          main={
            <div className="space-y-10">
              {user === null ? <IdentityStep /> : null}
              {user !== null && isGuestSession(session) ? <GuestContactForm user={user} /> : null}
              <PersonalisationSection cart={data} allowed={hasAccount(session)} />
              {user !== null && (!isGuestSession(session) || hasContact(user)) ? (
                <PurchaseSteps cart={data} />
              ) : null}
            </div>
          }
          summary={
            <>
              <CartSummary cart={data} />
              <Link to="/cart" className="block text-sm text-accent hover:underline">
                {t('checkout.backToCart')}
              </Link>
            </>
          }
        />
      )}
    </CartGate>
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl text-stone-900">{t('checkout.title')}</h1>
      </header>
      {body}
    </div>
  );
}
