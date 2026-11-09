import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { PagedResults } from '../../../shared/ui/paged-results';
import { LoadingSkeleton } from '../../../shared/ui/states';
import { useInventoryProduct, useLedger } from '../hooks/use-inventory';
import { PAGE_SIZE } from '../model/inventory';
import { groupByStock, variantLabel } from '../model/packaging';
import { AddPackaging } from './add-packaging';
import { LedgerEntry } from './ledger-entry';
import { StockForm } from './stock-form';
import { VariantList } from './variant-list';

/**
 * Todo lo necesario para mover el inventario de un producto. Los empaques que toman de una misma existencia (la bolsa de 6 y la
 * docena de las champurradas) forman un grupo: se ven las unidades que hay y cuántos paquetes de cada uno son. De la variante que se
 * elija se ven el libro de movimientos (el de la existencia compartida, en unidades) y las dos formas de mover el stock, cada una
 * con su motivo. El administrador agrega empaques y deja de venderlos.
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
  const { user } = useSession();
  const product = useInventoryProduct(idProduct);
  const ledger = useLedger(idVariant, page);
  const canManage = user?.role === 'Administrator';

  if (product.isPending) return <LoadingSkeleton count={2} />;
  if (product.isError) {
    return (
      <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
        {errorMessage(product.error)}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groupByStock(product.data.variants).map((group) => {
        const variant = group.variants.find((item) => item.idVariant === idVariant);
        return (
          <section key={group.holder} className="space-y-4">
            {group.packaged ? (
              <p className="text-stone-800">{t('inventory.sharedStock', { count: group.units })}</p>
            ) : null}
            <VariantList
              variants={group.variants}
              packaged={group.packaged}
              selected={idVariant}
              canManage={canManage}
              onSelect={onVariant}
            />
            {canManage ? (
              <AddPackaging idProduct={idProduct} stockVariantId={group.holder} />
            ) : null}
            {variant ? (
              <section
                className="space-y-4"
                aria-label={t('inventory.ledgerOf', { name: variantLabel(variant) })}
              >
                <h3 className="text-xl text-stone-900">
                  {t('inventory.ledgerOf', { name: variantLabel(variant) })}
                </h3>
                {group.packaged ? (
                  <p className="text-sm text-stone-600">{t('inventory.ledgerIsUnits')}</p>
                ) : null}
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
                  renderItem={(entry) => (
                    <LedgerEntry key={entry.idInventoryMovement} entry={entry} />
                  )}
                />
              </section>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
