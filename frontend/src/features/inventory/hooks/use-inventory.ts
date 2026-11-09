import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PAGE_SIZE, PRODUCT_LIST_SIZE } from '../model/inventory';
import { productBody, variantBody } from '../model/new-product';
import type { NewProductValues } from '../model/new-product';

/** Una página del libro de movimientos de la variante, el más reciente primero. La clave lleva la sesión. */
export function useLedger(idVariant: number | null, page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['ledger', user?.idUser ?? null, idVariant, page],
    enabled: user !== null && idVariant !== null,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/inventory/ledger', {
          params: { query: { variant: idVariant ?? 0, page, size: PAGE_SIZE } },
          signal,
        }),
      ),
  });
}

/** Tras mover el stock cambian el libro, las existencias del producto y lo que el catálogo ofrece. */
function useRefreshStock() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      queryClient.invalidateQueries({ queryKey: ['product'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ]);
  };
}

/** Registra unidades que llegaron. Lleva su llave de idempotencia, que solo se renueva cuando el movimiento se logró. */
export function useRegisterEntry(idVariant: number) {
  const key = useIdempotencyKey();
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: async (values: { quantity: number; reason: string }) => {
      const result = unwrap(
        await api.POST('/api/v1/admin/inventory/entries', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: { idVariant, ...values },
        }),
      );
      key.renew();
      return result;
    },
    onSuccess: refresh,
  });
}

/** Deja el stock físico en el valor contado. Si ya valía eso, el servidor no anota nada. */
export function useAdjustStock(idVariant: number) {
  const key = useIdempotencyKey();
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: async (values: { newOnHand: number; reason: string }) => {
      const result = unwrap(
        await api.POST('/api/v1/admin/inventory/adjustments', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: { idVariant, ...values },
        }),
      );
      key.renew();
      return result;
    },
    onSuccess: refresh,
  });
}

/** Los productos de una categoría, por orden alfabético, para elegir cuál mover. Sin categoría no se pide nada. */
export function useCategoryProducts(category: number | null, page: number) {
  return useQuery({
    queryKey: ['products', 'inventory', category, page],
    enabled: category !== null,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/products', {
          params: {
            query: { category: category ?? 0, sort: 'name', page, size: PRODUCT_LIST_SIZE },
          },
          signal,
        }),
      ),
  });
}

/** Lo que ya se logró al crear un producto, para no repetirlo si hay que reintentar. */
interface Progress {
  productId: number | null;
  variants: Map<number, number>;
  stocked: Set<number>;
}

/**
 * Crea un producto completo en pasos: el producto, cada una de sus variantes y, si se pidió, el stock con el que empieza. Si un
 * paso falla (un código repetido, un corte), lo ya creado se recuerda y el reintento sigue desde donde quedó, sin duplicar nada.
 * Cada llamada lleva su propia llave de idempotencia.
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();
  const progress = useRef<Progress>({ productId: null, variants: new Map(), stocked: new Set() });
  const [createdProduct, setCreatedProduct] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: async (input: { values: NewProductValues; initialStockReason: string }) => {
      const done = progress.current;
      if (done.productId === null) {
        const created = unwrap(
          await api.POST('/api/v1/admin/products', {
            params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
            body: productBody(input.values),
          }),
        );
        done.productId = created.idProduct;
        setCreatedProduct(created.idProduct);
      }
      const idProduct = done.productId;
      for (const [index, variant] of input.values.variants.entries()) {
        let idVariant = done.variants.get(index);
        if (idVariant === undefined) {
          const created = unwrap(
            await api.POST('/api/v1/admin/variants', {
              params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
              body: variantBody(idProduct, variant),
            }),
          );
          idVariant = created.idVariant;
          done.variants.set(index, idVariant);
        }
        if (variant.stock !== '' && !done.stocked.has(index)) {
          unwrap(
            await api.POST('/api/v1/admin/inventory/entries', {
              params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
              body: {
                idVariant,
                quantity: Number(variant.stock),
                reason: input.initialStockReason,
              },
            }),
          );
          done.stocked.add(index);
        }
      }
      return idProduct;
    },
    // También si falla a medias: el producto ya existe y la lista debe mostrarlo
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['product'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      ]);
    },
  });
  return { ...mutation, createdProduct };
}
