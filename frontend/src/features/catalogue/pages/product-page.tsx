import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { Badge } from '../../../shared/ui/badge';
import { Price } from '../../../shared/ui/price';
import { ProductImage } from '../../../shared/ui/product-image';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { ButtonLink } from '../../../shared/ui/button';
import { hasAccount, useSession } from '../../../shared/auth';
import { AccountRequired } from '../../cart/components/account-required';
import { AddToCart } from '../../cart/components/add-to-cart';
import { useProduct } from '../hooks/use-catalogue-queries';
import { stockState } from '../model/catalogue-query';

type Variant = components['schemas']['Variant'];

const variantLabel = (variant: Variant): string =>
  variant.attributes?.map((attribute) => attribute.value).join(' · ') || variant.sku;

function ProductNotFound() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('product.notFoundTitle')}
      text={t('product.notFoundText')}
      action={<ButtonLink to="/catalogue">{t('product.back')}</ButtonLink>}
    />
  );
}

/** Precio de la variante elegida, con su estado de existencias. */
function VariantSummary({ variant }: Readonly<{ variant: Variant }>) {
  const { t } = useTranslation();
  const available = variant.available;
  const state = available === undefined ? 'ok' : stockState(available);
  return (
    <div className="space-y-2">
      <p className="text-3xl text-stone-900">
        <Price amount={variant.price} />
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {state === 'soldOut' ? <Badge tone="danger">{t('product.soldOut')}</Badge> : null}
        {state === 'low' ? (
          <Badge tone="warning">{t('product.available', { count: available ?? 0 })}</Badge>
        ) : null}
        <span className="text-xs text-stone-500">{t('product.sku', { sku: variant.sku })}</span>
      </div>
    </div>
  );
}

/** Cuántos días de anticipación pide el producto. */
function LeadTimeNote({ days }: Readonly<{ days: number | undefined }>) {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-stone-600">
      {days === undefined || days === 0
        ? t('product.sameDayNote')
        : t('product.leadTimeNote', { count: days })}
    </p>
  );
}

/**
 * Comprar la variante elegida. Cualquiera puede, salvo los productos por encargo (los que piden días de anticipación):
 * esos requieren una cuenta. El servidor también lo exige; esto evita ofrecer lo que fallaría.
 */
function PurchaseSection({
  idProduct,
  leadTimeDays,
  variant,
}: Readonly<{ idProduct: number; leadTimeDays: number | undefined; variant: Variant }>) {
  const { t } = useTranslation();
  const session = useSession();
  const madeToOrder = (leadTimeDays ?? 0) > 0;

  if (madeToOrder && session.status === 'unknown') return null;
  if (madeToOrder && !hasAccount(session)) {
    return (
      <AccountRequired
        title={t('product.madeToOrderLocked.title')}
        text={t('product.madeToOrderLocked.text')}
        from={`/catalogue/${idProduct}`}
      />
    );
  }
  return (
    <AddToCart
      key={variant.idVariant}
      idVariant={variant.idVariant}
      available={variant.available}
    />
  );
}

export function ProductPage() {
  const { t } = useTranslation();
  const params = useParams();
  const parsed = /^\d{1,9}$/.test(params['id'] ?? '') ? Number(params['id']) : null;
  const product = useProduct(parsed);
  const [selected, setSelected] = useState<number | null>(null);

  // Al llegar el producto se preselecciona la primera variante que se puede comprar
  const variants = product.data?.variants;
  useEffect(() => {
    if (variants === undefined) return;
    const first = variants.find((variant) => (variant.available ?? 0) > 0) ?? variants[0];
    setSelected(first?.idVariant ?? null);
  }, [variants]);

  if (parsed === null) return <ProductNotFound />;
  if (product.isPending) return <LoadingSkeleton count={6} />;
  if (product.isError) {
    if (product.error instanceof ApiError && product.error.status === 404)
      return <ProductNotFound />;
    return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;
  }

  const item = product.data;
  const variant = item.variants.find((candidate) => candidate.idVariant === selected);
  const primary = item.images?.find((image) => image.isPrimary) ?? item.images?.[0];

  return (
    <article className="grid gap-8 md:grid-cols-2 md:gap-12">
      <div className="space-y-3">
        <Link to="/catalogue" className="text-sm text-stone-600 hover:text-accent">
          ← {t('product.back')}
        </Link>
        <ProductImage url={primary?.url} name={item.name} />
      </div>

      <div className="space-y-6">
        <header>
          {item.categoryName === undefined ? null : (
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500">
              {item.categoryName}
            </p>
          )}
          <h1 className="mt-1 text-4xl text-stone-900">{item.name}</h1>
          {item.description ? <p className="mt-3 text-stone-700">{item.description}</p> : null}
        </header>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-stone-800">{t('product.options')}</legend>
          {/* Radios nativos: el teclado (flechas) y los lectores de pantalla funcionan sin código extra */}
          <div className="flex flex-wrap gap-2">
            {item.variants.map((candidate) => (
              <label key={candidate.idVariant} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="variant"
                  value={candidate.idVariant}
                  checked={candidate.idVariant === selected}
                  onChange={() => {
                    setSelected(candidate.idVariant);
                  }}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-11 items-center rounded-control border border-stone-300 bg-white px-4 text-sm text-stone-800 hover:bg-stone-100 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {variantLabel(candidate)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {variant === undefined ? null : (
          <>
            <VariantSummary variant={variant} />
            <PurchaseSection
              idProduct={item.idProduct}
              leadTimeDays={item.leadTimeDays}
              variant={variant}
            />
          </>
        )}

        <LeadTimeNote days={item.leadTimeDays} />
      </div>
    </article>
  );
}
