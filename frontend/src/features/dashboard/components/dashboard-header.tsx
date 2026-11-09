import { useTranslation } from 'react-i18next';
import { useSession } from '../../../shared/auth';
import { firstName } from '../model/dashboard';

/** El encabezado de cada panel: un saludo con el nombre de quien entra y una línea que dice qué hay aquí. */
export function DashboardHeader({ intro }: Readonly<{ intro: string }>) {
  const { t } = useTranslation();
  const { user } = useSession();
  return (
    <header>
      <h1 className="text-4xl text-stone-900">
        {t('dashboard.greeting', { name: firstName(user?.fullName ?? '') })}
      </h1>
      <p className="mt-1 max-w-2xl text-stone-600">{intro}</p>
    </header>
  );
}
