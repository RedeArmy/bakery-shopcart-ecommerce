import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { Footer } from './footer';
import { Header } from './header';

export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:shadow-float"
      >
        {t('common.skipToContent')}
      </a>
      <p className="bg-stone-900 px-4 py-2 text-center text-xs text-stone-100">
        {t('announcement.message')}
      </p>
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
