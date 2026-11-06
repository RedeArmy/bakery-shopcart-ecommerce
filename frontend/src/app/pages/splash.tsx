import { useTranslation } from 'react-i18next';
import { LoadingSkeleton } from '../../shared/ui/states';

/**
 * Lo que se ve mientras llega el código de la primera pantalla (las rutas se cargan al visitarlas). Sin esto el router
 * dejaría la página en blanco hasta que el archivo termine de bajar.
 */
export function Splash() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
      <p className="mb-8 font-display text-2xl text-stone-900">{t('common.appName')}</p>
      <LoadingSkeleton count={5} />
    </div>
  );
}
