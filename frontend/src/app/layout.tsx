import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';

export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <span className="text-lg font-semibold">{t('common.appName')}</span>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
