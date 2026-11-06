import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../../../shared/ui/button';
import { CakeIcon } from '../../../shared/ui/icons';
import { ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { ProductGrid } from '../components/product-grid';
import { useCategories, useProducts } from '../hooks/use-catalogue-queries';
import { DEFAULT_QUERY } from '../model/catalogue-query';

const NEWEST = { ...DEFAULT_QUERY, sort: 'newest' } as const;

const TRUST = ['madeToOrder', 'reserved', 'deposit'] as const;

export function HomePage() {
  const { t } = useTranslation();
  const categories = useCategories();
  const newest = useProducts(NEWEST, 4);

  return (
    <div className="space-y-16">
      <section className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr] md:gap-12">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">
            {t('home.eyebrow')}
          </p>
          <h1 className="mt-3 text-5xl leading-[1.05] text-stone-900 md:text-6xl">
            {t('home.title')}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-stone-600">{t('home.subtitle')}</p>
          <div className="mt-8">
            <ButtonLink to="/catalogue">{t('home.cta')}</ButtonLink>
          </div>
        </div>
        <div
          className="grid aspect-[4/3] place-items-center rounded-card bg-accent-soft text-accent"
          aria-hidden="true"
        >
          <CakeIcon width={96} height={96} strokeWidth={1.25} />
        </div>
      </section>

      <section aria-label={t('home.eyebrow')}>
        <ul className="grid gap-6 border-y border-stone-200 py-8 md:grid-cols-3">
          {TRUST.map((key) => (
            <li key={key}>
              <p className="font-display text-lg text-stone-900">{t(`home.trust.${key}.title`)}</p>
              <p className="mt-1 text-sm text-stone-600">{t(`home.trust.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {categories.data === undefined || categories.data.length === 0 ? null : (
        <section aria-labelledby="home-categories">
          <h2 id="home-categories" className="text-3xl text-stone-900">
            {t('home.categories')}
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            {categories.data.map((category) => (
              <li key={category.idCategory}>
                <Link
                  to={`/catalogue?category=${category.idCategory}`}
                  className="flex min-h-24 items-end rounded-card border border-stone-200 bg-white p-4 text-xs font-medium uppercase tracking-widest text-stone-800 hover:border-accent hover:text-accent"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="home-newest">
        <div className="flex items-end justify-between gap-4">
          <h2 id="home-newest" className="text-3xl text-stone-900">
            {t('home.newest')}
          </h2>
          <Link to="/catalogue?sort=newest" className="text-sm text-accent hover:underline">
            {t('home.viewAll')}
          </Link>
        </div>
        <div className="mt-6">
          {newest.isPending ? <LoadingSkeleton variant="grid" count={4} /> : null}
          {newest.isError ? (
            <ErrorState error={newest.error} onRetry={() => void newest.refetch()} />
          ) : null}
          {newest.data === undefined ? null : <ProductGrid products={newest.data.items} />}
        </div>
      </section>
    </div>
  );
}
