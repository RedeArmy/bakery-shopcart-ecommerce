import { useTranslation } from 'react-i18next';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className="text-3xl font-bold">{t('home.title')}</h1>
      <p className="mt-2 text-stone-600">{t('home.subtitle')}</p>
    </section>
  );
}
