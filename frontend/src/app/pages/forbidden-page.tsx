import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/states';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('states.forbiddenTitle')}
      text={t('states.forbiddenText')}
      action={<ButtonLink to="/">{t('states.backHome')}</ButtonLink>}
    />
  );
}
