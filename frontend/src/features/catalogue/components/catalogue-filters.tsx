import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { useDebouncedValue } from '../../../shared/lib/use-debounced-value';
import { Button } from '../../../shared/ui/button';
import { CheckboxField, SelectField, TextField } from '../../../shared/ui/fields';
import { SORTS, hasActiveFilters, toMoneyText } from '../model/catalogue-query';
import type { CatalogueQuery, Sort } from '../model/catalogue-query';

type CategoryNode = components['schemas']['CategoryNode'];

interface Props {
  query: CatalogueQuery;
  categories: readonly CategoryNode[];
  categoriesLoading?: boolean;
  onChange: (change: Partial<Omit<CatalogueQuery, 'page'>>) => void;
  onClear: () => void;
}

export function CatalogueFilters({
  query,
  categories,
  categoriesLoading = false,
  onChange,
  onClear,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const [showMore, setShowMore] = useState(hasActiveFilters({ ...query, q: '', category: null }));

  // El texto se escribe en local y solo llega a la dirección cuando el cliente deja de teclear
  const [search, setSearch] = useState(query.q);
  const debounced = useDebouncedValue(search.trim(), 350);
  useEffect(() => {
    if (debounced !== query.q) onChange({ q: debounced });
    // Solo reacciona a lo que el cliente escribe, no a que la dirección cambie por otro filtro: por eso la dependencia es
    // `debounced` y no `query.q`, que reaplicaría una búsqueda vieja justo después de quitar los filtros
  }, [debounced]);
  useEffect(() => {
    setSearch(query.q);
  }, [query.q]);

  // Los importes se aceptan al salir de la casilla: "100" pasa a "100.00" y lo que no es un importe se descarta
  const [min, setMin] = useState(query.min ?? '');
  const [max, setMax] = useState(query.max ?? '');
  useEffect(() => {
    setMin(query.min ?? '');
  }, [query.min]);
  useEffect(() => {
    setMax(query.max ?? '');
  }, [query.max]);

  return (
    <section aria-label={t('catalogue.filters')} className="space-y-6">
      <TextField
        label={t('catalogue.searchLabel')}
        type="search"
        placeholder={t('catalogue.searchPlaceholder')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />

      <nav
        aria-label={t('catalogue.category')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        <Button
          variant={query.category === null ? 'primary' : 'secondary'}
          aria-pressed={query.category === null}
          onClick={() => {
            onChange({ category: null });
          }}
        >
          {t('catalogue.allCategories')}
        </Button>
        {categoriesLoading
          ? [0, 1, 2, 3, 4].map((placeholder) => (
              <span
                key={placeholder}
                aria-hidden="true"
                className="h-11 w-24 shrink-0 animate-pulse rounded-control bg-stone-200"
              />
            ))
          : null}
        {categories.map((category) => (
          <Button
            key={category.idCategory}
            variant={query.category === category.idCategory ? 'primary' : 'secondary'}
            aria-pressed={query.category === category.idCategory}
            onClick={() => {
              onChange({ category: category.idCategory });
            }}
          >
            {category.name}
          </Button>
        ))}
      </nav>

      <Button
        variant="secondary"
        className="md:hidden"
        aria-expanded={showMore}
        aria-controls="catalogue-more-filters"
        onClick={() => {
          setShowMore((current) => !current);
        }}
      >
        {t('catalogue.filters')}
      </Button>

      {/* En pantallas pequeñas estos filtros se despliegan con el botón; desde tablet siempre se ven */}
      <div
        id="catalogue-more-filters"
        className={`${showMore ? 'grid' : 'hidden'} gap-4 sm:grid-cols-2 md:grid lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end`}
      >
        <TextField
          label={t('catalogue.priceMin')}
          inputMode="decimal"
          value={min}
          onChange={(event) => {
            setMin(event.target.value);
          }}
          onBlur={() => {
            onChange({ min: toMoneyText(min) });
          }}
        />
        <TextField
          label={t('catalogue.priceMax')}
          inputMode="decimal"
          value={max}
          onChange={(event) => {
            setMax(event.target.value);
          }}
          onBlur={() => {
            onChange({ max: toMoneyText(max) });
          }}
        />
        <SelectField
          label={t('catalogue.sort.label')}
          value={query.sort}
          onChange={(event) => {
            onChange({ sort: event.target.value as Sort });
          }}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`catalogue.sort.${sort}`)}
            </option>
          ))}
        </SelectField>
        <CheckboxField
          label={t('catalogue.onlyAvailable')}
          checked={query.available}
          onChange={(event) => {
            onChange({ available: event.target.checked });
          }}
        />
      </div>

      {hasActiveFilters(query) ? (
        <Button variant="ghost" onClick={onClear}>
          {t('catalogue.clearFilters')}
        </Button>
      ) : null}
    </section>
  );
}
