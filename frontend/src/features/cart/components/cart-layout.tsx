import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../../shared/ui/button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import type { Cart } from '../model/cart-model';

/**
 * Los tres estados que comparten el carrito y el pago antes de mostrar nada: cargando, error con reintento y carrito
 * vacío. Cuando hay productos entrega el carrito a quien lo dibuja. `waiting` cubre lo que debe llegar antes (la sesión).
 */
export function CartGate({
  query,
  waiting = false,
  children,
}: Readonly<{
  query: UseQueryResult<Cart>;
  waiting?: boolean;
  children: (cart: Cart) => ReactNode;
}>) {
  const { t } = useTranslation();
  if (waiting || query.isPending) return <LoadingSkeleton count={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.lines.length === 0) {
    return (
      <EmptyState
        title={t('cart.emptyTitle')}
        text={t('cart.emptyText')}
        action={<ButtonLink to="/catalogue">{t('cart.emptyCta')}</ButtonLink>}
      />
    );
  }
  return <>{children(query.data)}</>;
}

/** Columna principal y panel del resumen: el diseño de dos columnas del carrito y del pago. */
export function CartColumns({
  summaryId,
  main,
  summary,
}: Readonly<{ summaryId: string; main: ReactNode; summary: ReactNode }>) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      {main}
      <aside
        aria-labelledby={summaryId}
        className="space-y-5 rounded-card border border-stone-200 bg-white p-5 lg:sticky lg:top-24"
      >
        <h2 id={summaryId} className="text-xl text-stone-900">
          {t('cart.summary.title')}
        </h2>
        {summary}
      </aside>
    </div>
  );
}
