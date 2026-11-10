import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { toMoneyText } from '../../catalogue/model/catalogue-query';
import { useIdempotencyKey } from '../../checkout/hooks/use-checkout';
import { PRODUCT_PAGE_SIZE, categoryBody, productBody } from '../model/maintenance';
import type { CategoryValues, PriceValues, ProductValues } from '../model/maintenance';

/** Todas las categorías, también las desactivadas, en una lista plana. La clave lleva la sesión. */
export function useAdminCategories() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['categories', 'admin', user?.idUser ?? null],
    enabled: user?.role === 'Administrator',
    queryFn: async ({ signal }) => unwrap(await api.GET('/api/v1/admin/categories', { signal })),
  });
}

/** Cambian las categorías (y, con ellas, lo que ofrece el catálogo y las pantallas que las eligen). */
function useRefreshCategories() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ]);
  };
}

/** Crea una categoría. Con la misma llave, repetir el envío no la crea dos veces; la llave se renueva solo si se logró. */
export function useCreateCategory() {
  const key = useIdempotencyKey();
  const refresh = useRefreshCategories();
  return useMutation({
    mutationFn: async (values: CategoryValues) => {
      const created = unwrap(
        await api.POST('/api/v1/admin/categories', {
          params: { header: { 'Idempotency-Key': key.current() } },
          body: categoryBody(values),
        }),
      );
      key.renew();
      return created.idCategory;
    },
    onSuccess: refresh,
  });
}

/** Edita una categoría: su nombre, su descripción y de cuál cuelga. El servidor impide los ciclos. */
export function useUpdateCategory(idCategory: number) {
  const refresh = useRefreshCategories();
  return useMutation({
    mutationFn: async (values: CategoryValues) =>
      unwrap(
        await api.PUT('/api/v1/admin/categories/{id}', {
          params: { path: { id: idCategory } },
          body: categoryBody(values),
        }),
      ),
    onSuccess: refresh,
  });
}

/** "Quitar" una categoría es desactivarla; el servidor no deja si todavía tiene productos activos o subcategorías. */
export function useDeactivateCategory(idCategory: number) {
  const refresh = useRefreshCategories();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/api/v1/admin/categories/{id}', { params: { path: { id: idCategory } } }),
      ),
    onSuccess: refresh,
  });
}

/** Una página de los productos de una categoría, por nombre, también los desactivados. Sin categoría no se pide nada. */
export function useAdminProducts(category: number | null, page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['products', 'admin', user?.idUser ?? null, category, page],
    enabled: user?.role === 'Administrator' && category !== null,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/admin/products', {
          params: {
            query: { category: category ?? 0, sort: 'name', page, size: PRODUCT_PAGE_SIZE },
          },
          signal,
        }),
      ),
  });
}

/** Cambian las fichas y lo que ofrece el catálogo. */
function useRefreshProducts() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['product'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
    ]);
  };
}

/** Edita un producto: su categoría, su nombre, su descripción y los días de preparación. */
export function useUpdateProduct(idProduct: number) {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: async (values: ProductValues) =>
      unwrap(
        await api.PUT('/api/v1/admin/products/{id}', {
          params: { path: { id: idProduct } },
          body: productBody(values),
        }),
      ),
    onSuccess: refresh,
  });
}

/** "Quitar" un producto es desactivarlo: los pedidos ya hechos lo citan. */
export function useDeactivateProduct(idProduct: number) {
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/api/v1/admin/products/{id}', { params: { path: { id: idProduct } } }),
      ),
    onSuccess: refresh,
  });
}

/**
 * Cambia el precio de una variante. Los pedidos ya hechos conservan el precio al que se hicieron. Lleva su llave de idempotencia,
 * que solo se renueva cuando el cambio se logró.
 */
export function useChangePrice(idVariant: number) {
  const key = useIdempotencyKey();
  const refresh = useRefreshProducts();
  return useMutation({
    mutationFn: async (values: PriceValues) => {
      const result = unwrap(
        await api.PATCH('/api/v1/admin/variants/{id}/price', {
          params: { path: { id: idVariant }, header: { 'Idempotency-Key': key.current() } },
          body: { price: toMoneyText(values.price) ?? values.price },
        }),
      );
      key.renew();
      return result;
    },
    onSuccess: refresh,
  });
}
