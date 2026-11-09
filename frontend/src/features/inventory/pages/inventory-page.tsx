import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../../shared/auth';
import { Button } from '../../../shared/ui/button';
import { SelectField } from '../../../shared/ui/fields';
import { PagedResults } from '../../../shared/ui/paged-results';
import { ErrorState } from '../../../shared/ui/states';
import { useCategories } from '../../catalogue/hooks/use-catalogue-queries';
import { categoryChoices, choiceLabel } from '../../catalogue/model/categories';
import { CreateProductDialog } from '../components/create-product-dialog';
import { ProductRow } from '../components/product-row';
import { useCategoryProducts } from '../hooks/use-inventory';
import { PRODUCT_LIST_SIZE, inventoryParams, parseInventoryQuery } from '../model/inventory';
import type { InventoryQuery } from '../model/inventory';

/**
 * El inventario (RF-05), para el operador y el administrador: se elige una categoría (en orden alfabético), se ven sus productos y
 * de cada uno se abre todo lo necesario para mover su stock: las variantes, su libro de movimientos y las dos formas de moverlo
 * (una entrada o un ajuste por conteo), las dos con motivo. Solo el administrador crea productos, en una ventana. La categoría, el
 * producto, la variante y las páginas viven en la dirección, así un enlace lleva al mismo lugar.
 */
export function InventoryPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const query = parseInventoryQuery(params);
  const categories = useCategories();
  const products = useCategoryProducts(query.category, query.list);
  const go = (next: Partial<InventoryQuery>): void => {
    setParams(inventoryParams({ ...query, ...next }));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl text-stone-900">{t('inventory.title')}</h1>
          <p className="mt-1 max-w-2xl text-stone-600">{t('inventory.intro')}</p>
        </div>
        {user?.role === 'Administrator' ? (
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            {t('inventory.create.open')}
          </Button>
        ) : null}
      </header>

      {categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
      ) : null}
      <div className="w-full sm:w-80">
        <SelectField
          label={t('inventory.category')}
          value={query.category === null ? '' : String(query.category)}
          onChange={(event) => {
            const id = Number(event.target.value);
            go({ category: id > 0 ? id : null, list: 1, product: null, variant: null, page: 1 });
          }}
        >
          <option value="">{t('inventory.chooseCategory')}</option>
          {categoryChoices(categories.data ?? []).map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choiceLabel(choice)}
            </option>
          ))}
        </SelectField>
      </div>

      {query.category === null ? (
        <p className="text-stone-600">{t('inventory.chooseCategoryFirst')}</p>
      ) : (
        <PagedResults
          prefix="inventory.products"
          result={products}
          page={query.list}
          pageSize={PRODUCT_LIST_SIZE}
          onPage={(list) => {
            go({ list, product: null, variant: null, page: 1 });
          }}
          renderItem={(product) => (
            <ProductRow
              key={product.idProduct}
              product={product}
              open={query.product === product.idProduct}
              idVariant={query.product === product.idProduct ? query.variant : null}
              page={query.page}
              onToggle={() => {
                go({
                  product: query.product === product.idProduct ? null : product.idProduct,
                  variant: null,
                  page: 1,
                });
              }}
              onVariant={(variant) => {
                go({ variant, page: 1 });
              }}
              onPage={(page) => {
                go({ page });
              }}
            />
          )}
        />
      )}

      {creating ? (
        <CreateProductDialog
          category={query.category}
          onClose={() => {
            setCreating(false);
          }}
          onCreated={(idProduct, idCategory) => {
            setCreating(false);
            // Se muestra el producto recién creado, abierto, para poder mover su stock enseguida
            go({ category: idCategory, list: 1, product: idProduct, variant: null, page: 1 });
          }}
        />
      ) : null}
    </div>
  );
}
