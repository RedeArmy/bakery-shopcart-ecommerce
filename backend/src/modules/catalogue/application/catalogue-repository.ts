import type { Page, Row } from '../../../platform/http/serialise.js';

export interface ProductSearch {
  query: string | null;
  categoryId: number | null;
  minPrice: string | null;
  maxPrice: string | null;
  inStockOnly: boolean;
  includeInactive: boolean;
  sort: 'name' | 'price_asc' | 'price_desc' | 'newest';
  page: number;
  size: number;
}

export interface CategoryInput {
  name: string;
  description: string | null;
  parentId: number | null;
}

export interface ProductInput {
  categoryId: number;
  name: string;
  description: string | null;
  leadTimeDays: number;
}

export interface VariantInput {
  sku: string;
  attributes: { name: string; value: string }[] | null;
}

/** Puerto de datos del catálogo; el adaptador SQL llama a SP_Categories_*, SP_Products_* y SP_Variants_*. */
export interface CatalogueRepository {
  listCategories(includeInactive: boolean): Promise<Row[]>;
  createCategory(actor: number, input: CategoryInput): Promise<number>;
  updateCategory(actor: number, id: number, input: CategoryInput): Promise<void>;
  deactivateCategory(actor: number, id: number): Promise<void>;
  searchProducts(search: ProductSearch): Promise<Page<Row>>;
  getProduct(id: number, includeInactive: boolean): Promise<Row>;
  createProduct(actor: number, input: ProductInput): Promise<number>;
  updateProduct(
    actor: number,
    id: number,
    input: ProductInput,
    rowVersion: Buffer | null,
  ): Promise<void>;
  deactivateProduct(actor: number, id: number): Promise<void>;
  createVariant(
    actor: number,
    productId: number,
    input: VariantInput & { price: string },
  ): Promise<number>;
  updateVariant(
    actor: number,
    id: number,
    input: VariantInput & { isActive: boolean },
  ): Promise<void>;
  changePrice(actor: number, id: number, newPrice: string): Promise<void>;
}
