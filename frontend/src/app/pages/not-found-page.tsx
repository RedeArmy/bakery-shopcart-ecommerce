import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/states';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('states.notFoundTitle')}
      text={t('states.notFoundText')}
      action={<ButtonLink to="/">{t('states.backHome')}</ButtonLink>}
    />
  );
}
