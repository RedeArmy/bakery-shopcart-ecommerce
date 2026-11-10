import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PAGE_SIZE, PRODUCT_LIST_SIZE } from '../model/inventory';
import { productBody, variantBody } from '../model/new-product';
import type { NewProductValues, NewVariantValues } from '../model/new-product';
import { PACKAGING_ATTRIBUTE } from '../model/packaging';
import type { PackagingValues, Variant } from '../model/packaging';
import { toMoneyText } from '../../catalogue/model/catalogue-query';

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
      // Una variante tras otra, en el orden escrito: así quedan en ese orden y, si una falla, las anteriores ya están hechas
      // Con la existencia compartida, la primera variante la guarda y las demás toman sus unidades de ella
      const shared = input.values.sharedStock;
      const createVariant = async (index: number, variant: NewVariantValues): Promise<void> => {
        let idVariant = done.variants.get(index);
        if (idVariant === undefined) {
          const packaging = shared
            ? {
                unitsPerPack: Number(variant.unitsPerPack),
                stockVariantId: index === 0 ? null : (done.variants.get(0) ?? null),
              }
            : undefined;
          const created = unwrap(
            await api.POST('/api/v1/admin/variants', {
              params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
              body: variantBody(idProduct, variant, packaging),
            }),
          );
          idVariant = created.idVariant;
          done.variants.set(index, idVariant);
        }
        // Las unidades con las que empieza: una sola vez en la existencia compartida, o las de cada variante si no se comparte
        let startingUnits = variant.stock;
        if (shared) startingUnits = index === 0 ? input.values.initialUnits : '';
        if (startingUnits !== '' && !done.stocked.has(index)) {
          unwrap(
            await api.POST('/api/v1/admin/inventory/entries', {
              params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
              body: {
                idVariant,
                quantity: Number(startingUnits),
                reason: input.initialStockReason,
              },
            }),
          );
          done.stocked.add(index);
        }
      };
      await input.values.variants.reduce<Promise<void>>(async (previous, variant, index) => {
        await previous;
        await createVariant(index, variant);
      }, Promise.resolve());
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

/**
 * La ficha del producto para mover su inventario. El administrador la pide con las variantes desactivadas (para poder volver a
 * venderlas); el operador, como la ve la tienda. La clave lleva el rol y se invalida junto con las demás fichas.
 */
export function useInventoryProduct(idProduct: number) {
  const { user } = useSession();
  const isAdministrator = user?.role === 'Administrator';
  return useQuery({
    queryKey: ['product', 'inventory', isAdministrator, idProduct],
    enabled: user !== null,
    queryFn: async ({ signal }) =>
      unwrap(
        isAdministrator
          ? await api.GET('/api/v1/admin/products/{id}', {
              params: { path: { id: idProduct } },
              signal,
            })
          : await api.GET('/api/v1/products/{id}', { params: { path: { id: idProduct } }, signal }),
      ),
  });
}

/** Cambian las fichas y lo que ofrece el catálogo cuando se agrega, quita o vuelve a poner un empaque. */
function useRefreshCatalogue() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['product'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ]);
  };
}

/**
 * Agrega un empaque a una existencia compartida: una variante nueva del mismo producto con su código, su precio y las unidades
 * que trae, que toma las unidades de la variante que guarda la existencia. Lleva su llave de idempotencia, que solo se renueva
 * cuando se logró.
 */
export function useAddPackaging(idProduct: number) {
  const key = useIdempotencyKey();
  const refresh = useRefreshCatalogue();
  return useMutation({
    mutationFn: async (values: PackagingValues) => {
      const created = unwrap(
        await api.POST('/api/v1/admin/variants', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: {
            productId: idProduct,
            sku: values.sku,
            price: toMoneyText(values.price) ?? values.price,
            unitsPerPack: Number(values.unitsPerPack),
            stockVariantId: Number(values.stock),
            attributes: [{ name: PACKAGING_ATTRIBUTE, value: values.name }],
          },
        }),
      );
      key.renew();
      return created.idVariant;
    },
    onSuccess: refresh,
  });
}

/**
 * Deja de vender un empaque o lo vuelve a vender. Nunca se borra: los pedidos ya hechos lo citan y la existencia compartida sigue
 * donde está, aunque la variante que la guarda deje de venderse. Se envía lo que la variante ya tiene (código y atributos).
 */
function useVariantActive(variant: Variant, isActive: boolean) {
  const refresh = useRefreshCatalogue();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/api/v1/admin/variants/{id}', {
          params: { path: { id: variant.idVariant } },
          body: {
            sku: variant.sku,
            isActive,
            attributes: (variant.attributes ?? []).flatMap((attribute) =>
              attribute.name === undefined || attribute.value === undefined
                ? []
                : [{ name: attribute.name, value: attribute.value }],
            ),
          },
        }),
      ),
    onSuccess: refresh,
  });
}

export const useStopSelling = (variant: Variant) => useVariantActive(variant, false);
export const useResumeSelling = (variant: Variant) => useVariantActive(variant, true);
