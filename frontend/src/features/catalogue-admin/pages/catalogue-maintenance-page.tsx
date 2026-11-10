import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../../shared/ui/button';
import { SelectField } from '../../../shared/ui/fields';
import { PagedResults } from '../../../shared/ui/paged-results';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { useCategories } from '../../catalogue/hooks/use-catalogue-queries';
import { categoryChoices, choiceLabel } from '../../catalogue/model/categories';
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

/** Las categorías, todas (también las desactivadas), en el orden en que se leen, con su alta, su edición y su baja. */
function CategoriesView() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
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
        <CategoryForm
          categories={data ?? []}
          onDone={() => {
            setAdding(false);
          }}
          onCancel={() => {
            setAdding(false);
          }}
        />
      ) : (
        <div>
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('catalogueAdmin.addCategory')}
          </Button>
        </div>
      )}
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
      <div className="w-full sm:w-80">
        <SelectField
          label={t('catalogueAdmin.fields.categoryFilter')}
          value={query.category === null ? '' : String(query.category)}
          onChange={(event) => {
            const id = Number(event.target.value);
            go({ category: id > 0 ? id : null, page: 1 });
          }}
        >
          <option value="">{t('catalogueAdmin.chooseCategory')}</option>
          {categoryChoices(categories.data ?? []).map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choiceLabel(choice)}
            </option>
          ))}
        </SelectField>
      </div>
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
  const query = parseMaintenanceQuery(params);
  const go = (next: Partial<MaintenanceQuery>): void => {
    setParams(maintenanceParams({ ...query, ...next }));
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl text-stone-900">{t('catalogueAdmin.title')}</h1>
        <p className="mt-1 max-w-2xl text-stone-600">{t('catalogueAdmin.intro')}</p>
      </header>
      <StatusFilter
        label={t('catalogueAdmin.viewLabel')}
        options={VIEWS}
        value={query.view}
        labelOf={(view) => t(`catalogueAdmin.views.${view}`)}
        onChange={(view) => {
          go({ view, category: null, page: 1 });
        }}
      />
      {query.view === 'categories' ? <CategoriesView /> : <ProductsView query={query} go={go} />}
    </div>
  );
}
