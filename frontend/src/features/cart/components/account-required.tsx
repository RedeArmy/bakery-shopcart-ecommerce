import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../../shared/ui/button';

/**
 * Aviso de lo que solo se puede con una cuenta (productos por encargo, personalización) con el camino para tenerla. El
 * cliente vuelve a `from` al iniciar sesión o registrarse.
 */
export function AccountRequired({
  title,
  text,
  from,
}: Readonly<{ title: string; text: string; from: string }>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <h3 className="font-display text-lg text-stone-900">{title}</h3>
      <p className="text-sm text-stone-600">{text}</p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to="/login" state={{ from }} variant="secondary">
          {t('nav.signIn')}
        </ButtonLink>
        <ButtonLink to="/register" state={{ from }} variant="ghost">
          {t('nav.register')}
        </ButtonLink>
      </div>
    </div>
  );
}
