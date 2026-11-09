import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { useCartSync } from '../features/cart/hooks/use-cart-sync';
import { isStaffRole, useSession } from '../shared/auth';
import { Footer } from './footer';
import { Header } from './header';

export function Layout() {
  const { t } = useTranslation();
  const { user } = useSession();
  // Entrega el carrito del visitante a su cuenta al iniciar sesión
  useCartSync();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:shadow-float"
      >
        {t('common.skipToContent')}
      </a>
      {/* El aviso de los pasteles por encargo es para quien compra: el personal no compra */}
      {isStaffRole(user?.role) ? null : (
        <p className="bg-stone-900 px-4 py-2 text-center text-xs text-stone-100">
          {t('announcement.message')}
        </p>
      )}
      <Header />
      <main
        id="content"
        className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 md:px-6 md:py-12"
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
