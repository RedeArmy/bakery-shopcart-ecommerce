import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { formatDateTime } from '../../../shared/lib/date';
import { Badge } from '../../../shared/ui/badge';

type LedgerEntryData = components['schemas']['LedgerEntry'];

const TONES = {
  Entry: 'success',
  Exit: 'warning',
  Adjustment: 'accent',
  Return: 'neutral',
} as const;

/**
 * Un movimiento del libro: de qué tipo es, cuántas unidades movió, cuántas quedaron, por qué, quién lo hizo y cuándo. Las salidas
 * por pedido dicen de qué pedido son. El libro solo se lee: un movimiento no se edita ni se borra.
 */
export function LedgerEntry({ entry }: Readonly<{ entry: LedgerEntryData }>) {
  const { t } = useTranslation();
  const signed = entry.quantity > 0 ? `+${entry.quantity}` : String(entry.quantity);
  const hasOrder = entry.idOrder !== null && entry.idOrder !== undefined;
  return (
    <li className="space-y-1 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONES[entry.movementType]}>{t(`inventory.types.${entry.movementType}`)}</Badge>
        <p className="text-lg text-stone-900">{t('inventory.units', { signed })}</p>
        <p className="text-sm text-stone-600">
          {t('inventory.balance', { count: entry.resultingBalance })}
        </p>
      </div>
      {entry.reason ? <p className="text-sm text-stone-700">{entry.reason}</p> : null}
      <p className="text-sm text-stone-600">
        {entry.userName ? t('inventory.by', { name: entry.userName }) : t('inventory.bySystem')}
        {hasOrder ? ` · ${t('inventory.order', { id: entry.idOrder })}` : null}
        {entry.createdAt === undefined ? null : ` · ${formatDateTime(entry.createdAt)}`}
      </p>
    </li>
  );
}
