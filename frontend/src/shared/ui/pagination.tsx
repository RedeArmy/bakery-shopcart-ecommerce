import { useTranslation } from 'react-i18next';
import { Button } from './button';

/** Paginación del lado del servidor: el padre guarda la página (en la dirección) y pide los datos. */
export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav
      aria-label={t('common.pagination')}
      className="mt-10 flex items-center justify-between gap-4"
    >
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => {
          onChange(page - 1);
        }}
      >
        {t('common.previous')}
      </Button>
      <p className="text-sm text-stone-600" aria-live="polite">
        {t('common.pageOf', { page, pages })}
      </p>
      <Button
        variant="secondary"
        disabled={page >= pages}
        onClick={() => {
          onChange(page + 1);
        }}
      >
        {t('common.next')}
      </Button>
    </nav>
  );
}
