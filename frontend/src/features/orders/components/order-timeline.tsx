import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../../shared/lib/date';
import { isKnownStatus } from '../model/order-status';

interface HistoryEntry {
  idNewStatus?: number;
  newStatusName?: string;
  createdAt?: string;
}

/** La línea de tiempo del pedido: cada estado por el que pasó, con su fecha; el último es en el que está ahora. */
export function OrderTimeline({ history }: Readonly<{ history: readonly HistoryEntry[] }>) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="order-history" className="space-y-3">
      <h2 id="order-history" className="text-2xl text-stone-900">
        {t('orders.history')}
      </h2>
      <ol className="space-y-4">
        {history.map((entry, index) => {
          const current = index === history.length - 1;
          return (
            <li
              key={`${entry.createdAt ?? ''}-${String(entry.idNewStatus ?? '')}`}
              className="flex gap-3"
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 size-3 shrink-0 rounded-full ${current ? 'bg-accent' : 'bg-stone-300'}`}
              />
              <div>
                <p className={current ? 'font-medium text-stone-900' : 'text-stone-700'}>
                  {entry.newStatusName !== undefined && isKnownStatus(entry.newStatusName)
                    ? t(`orders.status.${entry.newStatusName}`)
                    : entry.newStatusName}
                </p>
                <p className="text-sm text-stone-600">
                  {/* El comentario del servidor es texto técnico en inglés: el cliente ve el estado y la fecha */}
                  {entry.createdAt === undefined ? null : formatDateTime(entry.createdAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
