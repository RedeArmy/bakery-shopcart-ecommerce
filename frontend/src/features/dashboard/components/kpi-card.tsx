import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const CARD = 'block space-y-1 rounded-card border border-stone-200 bg-white p-4';

/** Una cifra con su nombre. Con `to` lleva a la pantalla donde se atiende. */
export function KpiCard({
  label,
  value,
  hint,
  to,
}: Readonly<{ label: string; value: ReactNode; hint?: string; to?: string }>) {
  const content = (
    <>
      <p className="text-sm text-stone-600">{label}</p>
      <p className="font-display text-2xl tabular-nums sm:text-3xl text-stone-900">{value}</p>
      {hint === undefined ? null : <p className="text-sm text-stone-500">{hint}</p>}
    </>
  );
  if (to === undefined) return <div className={CARD}>{content}</div>;
  return (
    <Link to={to} className={`${CARD} transition hover:border-accent`}>
      {content}
    </Link>
  );
}
