import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../../shared/ui/button';
import { PagedResults } from '../../../shared/ui/paged-results';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { useCategories } from '../../catalogue/hooks/use-catalogue-queries';
import { CategoryFilter } from '../../catalogue/components/category-filter';
import { StatusFilter } from '../../payment-review/components/status-filter';
import { CategoryCard } from '../components/category-card';
import { CategoryForm } from '../components/category-form';
import { ProductAdminCard } from '../components/product-admin-card';
import { useAdminCategories, useAdminProducts } from '../hooks/use-catalogue-admin';
import {
  PRODUCT_PAGE_SIZE,
  VIEWS,
  maintenanceParams,
  orderCategories,
  parseMaintenanceQuery,
} from '../model/maintenance';
import type { MaintenanceQuery } from '../model/maintenance';

/**
 * Las categorías, todas (también las desactivadas), en el orden en que se leen, con su edición y su baja. El botón de alta está
 * en la barra de arriba, junto a los de las vistas; aquí solo se muestra el formulario cuando se pidió.
 */
function CategoriesView({
  adding,
  onFormClosed,
}: Readonly<{ adding: boolean; onFormClosed: () => void }>) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useAdminCategories();

  let list: ReactNode;
  if (isPending) list = <LoadingSkeleton count={4} />;
  else if (isError) list = <ErrorState error={error} onRetry={() => void refetch()} />;
  else if (data.length === 0) {
    list = (
      <EmptyState
        title={t('catalogueAdmin.noCategoriesTitle')}
        text={t('catalogueAdmin.noCategoriesText')}
      />
    );
  } else {
    const names = new Map(data.map((category) => [category.idCategory, category.name]));
    list = (
      <ul className="space-y-3">
        {orderCategories(data).map((item) => (
          <CategoryCard
            key={item.category.idCategory}
            category={item.category}
            depth={item.depth}
            parentName={
              item.category.idParentCategory == null
                ? undefined
                : names.get(item.category.idParentCategory)
            }
            categories={data}
          />
        ))}
      </ul>
    );
  }

  return (
    <section className="space-y-4" aria-label={t('catalogueAdmin.views.categories')}>
      {adding ? (
        <CategoryForm categories={data ?? []} onDone={onFormClosed} onCancel={onFormClosed} />
      ) : null}
      {list}
    </section>
  );
}

/** Los productos de la categoría elegida, también los desactivados, para editarlos, desactivarlos y cambiar los precios. */
function ProductsView({
  query,
  go,
}: Readonly<{ query: MaintenanceQuery; go: (next: Partial<MaintenanceQuery>) => void }>) {
  const { t } = useTranslation();
  const categories = useCategories({ fresh: true });
  const products = useAdminProducts(query.category, query.page);

  return (
    <section className="space-y-4" aria-label={t('catalogueAdmin.views.products')}>
      <p className="text-sm text-stone-600">
        {t('catalogueAdmin.createHint')}{' '}
        <Link to="/admin/inventory" className="text-accent-strong underline">
          {t('catalogueAdmin.createLink')}
        </Link>
      </p>
      <CategoryFilter
        label={t('catalogueAdmin.fields.categoryFilter')}
        placeholder={t('catalogueAdmin.chooseCategory')}
        value={query.category}
        categories={categories.data ?? []}
        onChange={(category) => {
          go({ category, page: 1 });
        }}
      />
      {query.category === null ? (
        <p className="text-stone-600">{t('catalogueAdmin.chooseCategoryFirst')}</p>
      ) : (
        <PagedResults
          prefix="catalogueAdmin.products"
          result={products}
          page={query.page}
          pageSize={PRODUCT_PAGE_SIZE}
          onPage={(page) => {
            go({ page });
          }}
          renderItem={(product) => <ProductAdminCard key={product.idProduct} product={product} />}
        />
      )}
    </section>
  );
}

/**
 * El mantenimiento del catálogo (RF-02), solo para el administrador: las categorías (alta, edición y baja, sin borrar nunca) y los
 * productos de cada una (edición, baja y cambio de precio de sus variantes). La vista, la categoría y la página viven en la
 * dirección, así un enlace lleva al mismo lugar.
 */
export function CatalogueMaintenancePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const query = parseMaintenanceQuery(params);
  const go = (next: Partial<MaintenanceQuery>): void => {
    setParams(maintenanceParams({ ...query, ...next }));
  };
  // El alta de una categoría solo se ofrece en la vista de categorías y mientras su formulario no está abierto
  const canAdd = query.view === 'categories' && !adding;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('catalogueAdmin.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('catalogueAdmin.intro')}</p>
      </header>
      {/* Una sola barra: a la izquierda el alta de una categoría y a su derecha los botones de las dos vistas */}
      <div className="flex flex-wrap items-center gap-3">
        {canAdd ? (
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('catalogueAdmin.addCategory')}
          </Button>
        ) : null}
        <StatusFilter
          label={t('catalogueAdmin.viewLabel')}
          options={VIEWS}
          value={query.view}
          labelOf={(view) => t(`catalogueAdmin.views.${view}`)}
          onChange={(view) => {
            setAdding(false);
            go({ view, category: null, page: 1 });
          }}
        />
      </div>
      {query.view === 'categories' ? (
        <CategoriesView
          adding={adding}
          onFormClosed={() => {
            setAdding(false);
          }}
        />
      ) : (
        <ProductsView query={query} go={go} />
      )}
    </div>
  );
}
