import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button, ButtonLink } from '../../../shared/ui/button';
import { useStartGuest } from '../../cart/hooks/use-start-guest';

/**
 * Primer paso para quien llega al pago sin sesión: comprar como invitado (sin cuenta) o entrar con una. El invitado se
 * crea aquí y no antes, para que quien solo mira el carrito no genere cuentas.
 */
export function IdentityStep() {
  const { t } = useTranslation();
  const startGuest = useStartGuest();
  return (
    <section aria-labelledby="checkout-identity" className="space-y-4">
      <h2 id="checkout-identity" className="text-2xl text-stone-900">
        {t('checkout.identity.title')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
          <h3 className="font-display text-lg text-stone-900">
            {t('checkout.identity.guest.title')}
          </h3>
          <p className="text-sm text-stone-600">{t('checkout.identity.guest.text')}</p>
          <Button
            loading={startGuest.isPending}
            className="w-full"
            onClick={() => {
              startGuest.mutate();
            }}
          >
            {t('checkout.identity.guest.action')}
          </Button>
          {startGuest.isError ? (
            <p role="alert" className="text-sm text-red-700">
              {errorMessage(startGuest.error)}
            </p>
          ) : null}
        </div>
        <div className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
          <h3 className="font-display text-lg text-stone-900">
            {t('checkout.identity.account.title')}
          </h3>
          <p className="text-sm text-stone-600">{t('checkout.identity.account.text')}</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/login" state={{ from: '/checkout' }} variant="secondary">
              {t('checkout.identity.account.signIn')}
            </ButtonLink>
            <ButtonLink to="/register" state={{ from: '/checkout' }} variant="ghost">
              {t('checkout.identity.account.register')}
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
