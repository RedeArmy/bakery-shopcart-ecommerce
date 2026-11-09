import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { isStaffRole, useSession } from '../shared/auth';

export function Footer() {
  const { t } = useTranslation();
  const { user } = useSession();
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 md:grid-cols-[2fr_1fr] md:px-6">
        <div>
          <p className="font-display text-xl text-stone-900">{t('common.appName')}</p>
          <p className="mt-2 max-w-sm text-sm text-stone-600">{t('footer.tagline')}</p>
        </div>
        {/* El personal no compra: la tienda no es para él */}
        {isStaffRole(user?.role) ? null : (
          <nav aria-label={t('footer.shop')}>
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500">
              {t('footer.shop')}
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>
                <Link to="/catalogue" className="text-stone-700 hover:text-accent">
                  {t('nav.catalogue')}
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </div>
      <p className="border-t border-stone-200 px-4 py-4 text-center text-xs text-stone-500">
        {t('footer.rights', { year: new Date().getFullYear() })}
      </p>
    </footer>
  );
}
