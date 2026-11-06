import { useTranslation } from 'react-i18next';
import { Pagination } from '../../../shared/ui/pagination';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { Button } from '../../../shared/ui/button';
import { CatalogueFilters } from '../components/catalogue-filters';
import { ProductGrid } from '../components/product-grid';
import { useCategories, useProducts } from '../hooks/use-catalogue-queries';
import { useCatalogueSearch } from '../hooks/use-catalogue-search';
import { PAGE_SIZE, hasActiveFilters, pageCount } from '../model/catalogue-query';

export function CataloguePage() {
  const { t } = useTranslation();
  const { query, setFilter, setPage, clear } = useCatalogueSearch();
  const categories = useCategories();
  const products = useProducts(query);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl text-stone-900">{t('catalogue.title')}</h1>
        <p className="mt-2 text-stone-600">{t('catalogue.subtitle')}</p>
      </header>

      <CatalogueFilters
        query={query}
        categories={categories.data ?? []}
        categoriesLoading={categories.isPending}
        onChange={setFilter}
        onClear={clear}
      />

      <section aria-live="polite">
        {/* Las tarjetas son h3: este título (solo para lectores de pantalla) evita saltar de h1 a h3 */}
        <h2 className="sr-only">{t('catalogue.resultsHeading')}</h2>
        {products.isPending ? <LoadingSkeleton variant="grid" count={PAGE_SIZE} /> : null}
        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => void products.refetch()} />
        ) : null}
        {products.data === undefined ? null : products.data.items.length === 0 ? (
          <EmptyState
            title={t('catalogue.emptyTitle')}
            text={t('catalogue.emptyText')}
            action={
              hasActiveFilters(query) ? (
                <Button variant="secondary" onClick={clear}>
                  {t('catalogue.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div
            aria-busy={products.isPlaceholderData}
            className={
              products.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'
            }
          >
            <p className="mb-6 text-sm text-stone-600">
              {t('catalogue.results', { count: products.data.total })}
            </p>
            <ProductGrid products={products.data.items} />
            <Pagination
              page={query.page}
              pages={pageCount(products.data.total)}
              onChange={setPage}
            />
          </div>
        )}
      </section>
    </div>
  );
}
