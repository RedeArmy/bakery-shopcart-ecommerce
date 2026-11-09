import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { PagedResults } from '../../../shared/ui/paged-results';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { DEFAULT_QUERY } from '../../catalogue/model/catalogue-query';
import { useProduct, useProducts } from '../../catalogue/hooks/use-catalogue-queries';
import { SearchForm } from '../../payment-review/components/search-form';
import { LedgerEntry } from '../components/ledger-entry';
import { StockForm } from '../components/stock-form';
import { VariantList, variantLabel } from '../components/variant-list';
import { useLedger } from '../hooks/use-inventory';
import {
  PAGE_SIZE,
  PRODUCT_CHOICES,
  inventoryParams,
  parseInventoryQuery,
} from '../model/inventory';
import type { InventoryQuery } from '../model/inventory';

/** Los productos que coinciden con la búsqueda, para elegir uno. */
function ProductChoices({
  search,
  onChoose,
}: Readonly<{ search: string; onChoose: (id: number) => void }>) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useProducts(
    { ...DEFAULT_QUERY, q: search },
    PRODUCT_CHOICES,
  );
  if (search === '') return <p className="text-stone-600">{t('inventory.searchFirst')}</p>;
  if (isPending) return <LoadingSkeleton count={3} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (data.items.length === 0) {
    return (
      <EmptyState title={t('inventory.noProductsTitle')} text={t('inventory.noProductsText')} />
    );
  }
  return (
    <ul className="space-y-3">
      {data.items.map((product) => (
        <li
          key={product.idProduct}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-stone-200 bg-white p-4"
        >
          <div>
            <p className="text-lg text-stone-900">{product.name}</p>
            {product.categoryName ? (
              <p className="text-sm text-stone-600">{product.categoryName}</p>
            ) : null}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              onChoose(product.idProduct);
            }}
          >
            {t('inventory.chooseProduct')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * El inventario (RF-05), para el operador y el administrador: se busca el producto, se elige una de sus variantes y se ve su libro
 * de movimientos (el más reciente primero) con quién movió qué y por qué. El stock se mueve de dos formas, las dos con motivo:
 * registrando unidades que llegaron o dejándolo en lo que se contó. El producto, la variante y la página viven en la dirección.
 */
export function InventoryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const query = parseInventoryQuery(params);
  const go = (next: Partial<InventoryQuery>): void => {
    setParams(inventoryParams({ ...query, ...next }));
  };
  const product = useProduct(query.product);
  const ledger = useLedger(query.variant, query.page);
  const variant = product.data?.variants.find((item) => item.idVariant === query.variant);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('inventory.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('inventory.intro')}</p>
      </header>
      <SearchForm
        id="inventory-search"
        label={t('inventory.search')}
        placeholder={t('inventory.searchHint')}
        submitLabel={t('inventory.searchSubmit')}
        value={query.search}
        onSearch={(search) => {
          go({ search, product: null, variant: null, page: 1 });
        }}
      />
      {query.product === null ? (
        <ProductChoices
          search={query.search}
          onChoose={(id) => {
            go({ product: id, variant: null, page: 1 });
          }}
        />
      ) : (
        <section className="space-y-4" aria-label={t('inventory.variants')}>
          {product.isPending ? <LoadingSkeleton count={2} /> : null}
          {product.isError ? (
            <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
              {errorMessage(product.error)}
            </p>
          ) : null}
          {product.data ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl text-stone-900">{product.data.name}</h2>
                <Button
                  variant="ghost"
                  onClick={() => {
                    go({ product: null, variant: null, page: 1 });
                  }}
                >
                  {t('inventory.changeProduct')}
                </Button>
              </div>
              <VariantList
                variants={product.data.variants}
                selected={query.variant}
                onSelect={(id) => {
                  go({ variant: id, page: 1 });
                }}
              />
            </>
          ) : null}
        </section>
      )}
      {query.variant !== null && variant ? (
        <section
          className="space-y-4"
          aria-label={t('inventory.ledgerOf', { name: variantLabel(variant) })}
        >
          <h2 className="text-2xl text-stone-900">
            {t('inventory.ledgerOf', { name: variantLabel(variant) })}
          </h2>
          <p className="text-stone-700">
            {t('inventory.onHand', { count: variant.onHandStock ?? 0 })}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <StockForm kind="entry" idVariant={variant.idVariant} />
            <StockForm kind="adjustment" idVariant={variant.idVariant} />
          </div>
          <PagedResults
            prefix="inventory"
            result={ledger}
            page={query.page}
            pageSize={PAGE_SIZE}
            onPage={(page) => {
              go({ page });
            }}
            renderItem={(entry) => <LedgerEntry key={entry.idInventoryMovement} entry={entry} />}
          />
        </section>
      ) : null}
    </div>
  );
}
