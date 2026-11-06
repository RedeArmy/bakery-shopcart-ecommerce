import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CartLink } from '../features/cart/components/cart-link';
import { auth, useSession } from '../shared/auth';
import { Button, ButtonLink } from '../shared/ui/button';
import { CloseIcon, MenuIcon, UserIcon } from '../shared/ui/icons';
import { visibleNavItems } from './navigation';

const LINK =
  'text-xs font-medium uppercase tracking-widest text-stone-700 hover:text-accent aria-[current=page]:text-accent';

export function Header() {
  const { t } = useTranslation();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const items = visibleNavItems(session.user?.role ?? null);

  // Al cambiar de página el menú del teléfono se cierra solo
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const signOut = (): void => {
    void auth.logout().then(() => navigate('/'));
  };

  const account =
    session.status === 'authenticated' && session.user !== null ? (
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-2 text-sm text-stone-700 md:flex">
          <UserIcon />
          <span className="max-w-40 truncate">{session.user.fullName}</span>
        </span>
        <Button variant="ghost" className="whitespace-nowrap" onClick={signOut}>
          {t('nav.signOut')}
        </Button>
      </div>
    ) : (
      <div className="flex items-center gap-1">
        <ButtonLink to="/login" variant="ghost" className="whitespace-nowrap">
          {t('nav.signIn')}
        </ButtonLink>
        {/* Envuelto: `hidden` y `inline-flex` en el mismo elemento se pisan. "Crear cuenta" cabe desde pantallas grandes; antes va en el menú o en la pantalla de iniciar sesión */}
        <span className="hidden lg:block">
          <ButtonLink to="/register" variant="secondary">
            {t('nav.register')}
          </ButtonLink>
        </span>
      </div>
    );

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <div className="mx-auto grid h-16 max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center px-4 md:px-6">
        <nav className="hidden gap-6 md:flex" aria-label={t('common.mainNavigation')}>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={LINK}>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="md:hidden">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-control text-stone-800 hover:bg-stone-100"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={t('common.menu')}
            onClick={() => {
              setOpen((current) => !current);
            }}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        <Link to="/" className="font-display text-2xl tracking-tight text-stone-900">
          {t('common.appName')}
        </Link>

        <div className="flex items-center justify-end gap-1">
          <CartLink />
          {account}
        </div>
      </div>

      <nav
        id="mobile-menu"
        hidden={!open}
        className="border-t border-stone-200 bg-stone-50 px-4 py-3 md:hidden"
        aria-label={t('common.mainNavigation')}
      >
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={`${LINK} flex min-h-11 items-center`}>
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
          {session.status === 'authenticated' ? null : (
            <li>
              <NavLink to="/register" className={`${LINK} flex min-h-11 items-center`}>
                {t('nav.register')}
              </NavLink>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
