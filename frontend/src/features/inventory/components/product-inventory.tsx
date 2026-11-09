import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { PagedResults } from '../../../shared/ui/paged-results';
import { LoadingSkeleton } from '../../../shared/ui/states';
import { useProduct } from '../../catalogue/hooks/use-catalogue-queries';
import { useLedger } from '../hooks/use-inventory';
import { PAGE_SIZE } from '../model/inventory';
import { LedgerEntry } from './ledger-entry';
import { StockForm } from './stock-form';
import { VariantList, variantLabel } from './variant-list';

/**
 * Todo lo necesario para mover el inventario de un producto: sus variantes con lo que hay de cada una y, de la que se elija, el
 * libro de movimientos y las dos formas de mover el stock (una entrada o un ajuste por conteo), cada una con su motivo.
 */
export function ProductInventory({
  idProduct,
  idVariant,
  page,
  onVariant,
  onPage,
}: Readonly<{
  idProduct: number;
  idVariant: number | null;
  page: number;
  onVariant: (id: number) => void;
  onPage: (page: number) => void;
}>) {
  const { t } = useTranslation();
  const product = useProduct(idProduct);
  const ledger = useLedger(idVariant, page);
  const variant = product.data?.variants.find((item) => item.idVariant === idVariant);

  if (product.isPending) return <LoadingSkeleton count={2} />;
  if (product.isError) {
    return (
      <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
        {errorMessage(product.error)}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <VariantList variants={product.data.variants} selected={idVariant} onSelect={onVariant} />
      {variant ? (
        <section
          className="space-y-4"
          aria-label={t('inventory.ledgerOf', { name: variantLabel(variant) })}
        >
          <h3 className="text-xl text-stone-900">
            {t('inventory.ledgerOf', { name: variantLabel(variant) })}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <StockForm kind="entry" idVariant={variant.idVariant} />
            <StockForm kind="adjustment" idVariant={variant.idVariant} />
          </div>
          <PagedResults
            prefix="inventory"
            result={ledger}
            page={page}
            pageSize={PAGE_SIZE}
            onPage={onPage}
            renderItem={(entry) => <LedgerEntry key={entry.idInventoryMovement} entry={entry} />}
          />
        </section>
      ) : null}
    </div>
  );
}
