import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../api/error-message';
import { Button } from './button';

/** Marcador de carga: ocupa el lugar del contenido para que la página no salte al llegar los datos. */
export function LoadingSkeleton({
  variant = 'lines',
  count = 3,
}: {
  variant?: 'lines' | 'grid';
  count?: number;
}) {
  const { t } = useTranslation();
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <div role="status" aria-live="polite" aria-label={t('common.loading')}>
      {variant === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item} className="space-y-3">
              <div className="aspect-[4/3] animate-pulse rounded-card bg-stone-200" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-stone-200" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item} className="h-5 animate-pulse rounded bg-stone-200" />
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-stone-300 px-6 py-12 text-center">
      <h2 className="text-xl text-stone-900">{title}</h2>
      {text === undefined ? null : <p className="mx-auto mt-2 max-w-md text-stone-600">{text}</p>}
      {action === undefined ? null : <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/** Error de una vista: dice qué pasó en español, sin mostrar jamás el mensaje técnico, y permite reintentar. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="rounded-card border border-red-200 bg-red-50 px-6 py-10 text-center"
    >
      <h2 className="text-xl text-red-900">{t('states.errorTitle')}</h2>
      <p className="mx-auto mt-2 max-w-md text-red-900">{errorMessage(error)}</p>
      {onRetry === undefined ? null : (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
