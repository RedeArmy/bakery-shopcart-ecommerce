import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { RemoveConfirmation, useCardMode } from '../../../shared/ui/remove-confirmation';
import { useResumeSelling, useStopSelling } from '../hooks/use-inventory';
import { looseUnits, stockUnits, unitsPerPack, variantLabel, wholePacks } from '../model/packaging';
import type { Variant } from '../model/packaging';

/**
 * Lo que hay de un empaque, dicho en unidades y en paquetes: 54 unidades son 9 paquetes de 6 y, si fueran 50, 8 paquetes y sobran 2
 * (el resto no completa un paquete). Una variante de una sola unidad solo dice sus unidades.
 */
function StockText({ variant, packaged }: Readonly<{ variant: Variant; packaged: boolean }>) {
  const { t } = useTranslation();
  const units = stockUnits(variant);
  const perPack = unitsPerPack(variant);
  const available = t('inventory.available', { count: variant.available ?? 0 });
  if (!packaged || perPack === 1) {
    return (
      <>
        {t('inventory.onHand', { count: units })}
        {' · '}
        {available}
      </>
    );
  }
  const loose = looseUnits(units, perPack);
  return (
    <>
      {t('inventory.packs', { count: wholePacks(units, perPack), size: perPack })}
      {loose > 0 ? ` (${t('inventory.loose', { count: loose })})` : null}
      {' · '}
      {available}
    </>
  );
}

function VariantRow({
  variant,
  packaged,
  selected,
  canManage,
  onSelect,
}: Readonly<{
  variant: Variant;
  packaged: boolean;
  selected: boolean;
  canManage: boolean;
  onSelect: (id: number) => void;
}>) {
  const { t } = useTranslation();
  const { mode, remove, close } = useCardMode();
  const stop = useStopSelling(variant);
  const resume = useResumeSelling(variant);
  const perPack = unitsPerPack(variant);
  const active = variant.isActive !== false;

  return (
    <li className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg text-stone-900">{variantLabel(variant)}</p>
            {active ? null : <Badge tone="danger">{t('inventory.inactiveVariant')}</Badge>}
          </div>
          <p className="text-sm text-stone-600">
            {variant.sku}
            {packaged && perPack > 1 ? ` · ${t('inventory.perPack', { count: perPack })}` : null}
          </p>
          <p className="text-sm text-stone-600">
            <StockText variant={variant} packaged={packaged} />
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant={selected ? 'primary' : 'secondary'}
            aria-pressed={selected}
            onClick={() => {
              onSelect(variant.idVariant);
            }}
          >
            {t('inventory.openLedger')}
          </Button>
          {canManage && active && mode === 'view' ? (
            <Button variant="ghost" onClick={remove}>
              {t('inventory.stopSelling')}
            </Button>
          ) : null}
          {canManage && !active ? (
            <Button
              variant="ghost"
              loading={resume.isPending}
              onClick={() => {
                resume.mutate();
              }}
            >
              {t('inventory.resumeSelling')}
            </Button>
          ) : null}
        </div>
      </div>
      {resume.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(resume.error)}
        </p>
      ) : null}
      {mode === 'remove' ? (
        <RemoveConfirmation prefix="inventory.packaging" deactivation={stop} onClose={close} />
      ) : null}
    </li>
  );
}

/**
 * Los empaques que toman de una misma existencia (o la variante que guarda la suya) con lo que hay de cada uno. Se elige uno para
 * ver el libro y mover el stock. El administrador puede dejar de vender un empaque, o volver a venderlo, sin tocar la existencia.
 */
export function VariantList({
  variants,
  packaged,
  selected,
  canManage,
  onSelect,
}: Readonly<{
  variants: readonly Variant[];
  packaged: boolean;
  selected: number | null;
  canManage: boolean;
  onSelect: (id: number) => void;
}>) {
  return (
    <ul className="space-y-3">
      {variants.map((variant) => (
        <VariantRow
          key={variant.idVariant}
          variant={variant}
          packaged={packaged}
          selected={selected === variant.idVariant}
          canManage={canManage}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
