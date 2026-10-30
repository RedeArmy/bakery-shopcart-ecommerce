import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow, toPage } from '../../../platform/http/serialise.js';
import type { Page, Row } from '../../../platform/http/serialise.js';
import type {
  CatalogueRepository,
  CategoryInput,
  ProductInput,
  ProductSearch,
  VariantInput,
} from '../application/catalogue-repository.js';

/** Adaptador SQL del catálogo: solo llama a SP_Categories_*, SP_Products_* y SP_Variants_*, con parámetros tipados. */
const attributesJson = (attributes: VariantInput['attributes']): string | null =>
  attributes === null ? null : JSON.stringify(attributes);

export function createSqlCatalogueRepository(execute: ProcedureExecutor): CatalogueRepository {
  return {
    async listCategories(includeInactive: boolean): Promise<Row[]> {
      const result = await execute<Row>('dbo.SP_Categories_List', [
        { name: 'IncludeInactive', type: sql.Bit, value: includeInactive },
      ]);
      return result.rows.map((row) => camelRow(row));
    },

    async createCategory(actor: number, input: CategoryInput): Promise<number> {
      const result = await execute(
        'dbo.SP_Categories_Create',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'Name', type: sql.NVarChar(80), value: input.name },
          { name: 'Description', type: sql.NVarChar(300), value: input.description },
          { name: 'IDParentCategory', type: sql.Int, value: input.parentId },
        ],
        [{ name: 'IDCategory', type: sql.Int }],
      );
      return result.output['IDCategory'] as number;
    },

    async updateCategory(actor: number, id: number, input: CategoryInput): Promise<void> {
      await execute('dbo.SP_Categories_Update', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDCategory', type: sql.Int, value: id },
        { name: 'Name', type: sql.NVarChar(80), value: input.name },
        { name: 'Description', type: sql.NVarChar(300), value: input.description },
        { name: 'IDParentCategory', type: sql.Int, value: input.parentId },
      ]);
    },

    async deactivateCategory(actor: number, id: number): Promise<void> {
      await execute('dbo.SP_Categories_Deactivate', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDCategory', type: sql.Int, value: id },
      ]);
    },

    async searchProducts(search: ProductSearch): Promise<Page<Row>> {
      const result = await execute<Row>('dbo.SP_Products_Search', [
        { name: 'Query', type: sql.NVarChar(100), value: search.query },
        { name: 'IDCategory', type: sql.Int, value: search.categoryId },
        { name: 'MinPrice', type: sql.Decimal(18, 2), value: search.minPrice },
        { name: 'MaxPrice', type: sql.Decimal(18, 2), value: search.maxPrice },
        { name: 'InStockOnly', type: sql.Bit, value: search.inStockOnly },
        { name: 'IncludeInactive', type: sql.Bit, value: search.includeInactive },
        { name: 'SortBy', type: sql.VarChar(20), value: search.sort },
        { name: 'PageNumber', type: sql.Int, value: search.page },
        { name: 'PageSize', type: sql.Int, value: search.size },
      ]);
      return toPage(result.rows, search.page, search.size);
    },

    async getProduct(id: number, includeInactive: boolean): Promise<Row> {
      const result = await execute<Row>('dbo.SP_Products_Get', [
        { name: 'IDProduct', type: sql.Int, value: id },
        { name: 'IncludeInactive', type: sql.Bit, value: includeInactive },
      ]);
      const row = result.rows[0];
      if (row === undefined) throw new TypeError('SP_Products_Get returned no row');
      return camelRow(row, ['Images', 'Variants']);
    },

    async createProduct(actor: number, input: ProductInput): Promise<number> {
      const result = await execute(
        'dbo.SP_Products_Create',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'IDCategory', type: sql.Int, value: input.categoryId },
          { name: 'Name', type: sql.NVarChar(150), value: input.name },
          { name: 'Description', type: sql.NVarChar(1000), value: input.description },
          { name: 'LeadTimeDays', type: sql.TinyInt, value: input.leadTimeDays },
        ],
        [{ name: 'IDProduct', type: sql.Int }],
      );
      return result.output['IDProduct'] as number;
    },

    async updateProduct(
      actor: number,
      id: number,
      input: ProductInput,
      rowVersion: Buffer | null,
    ): Promise<void> {
      await execute('dbo.SP_Products_Update', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDProduct', type: sql.Int, value: id },
        { name: 'IDCategory', type: sql.Int, value: input.categoryId },
        { name: 'Name', type: sql.NVarChar(150), value: input.name },
        { name: 'Description', type: sql.NVarChar(1000), value: input.description },
        { name: 'LeadTimeDays', type: sql.TinyInt, value: input.leadTimeDays },
        { name: 'RowVer', type: sql.VarBinary(8), value: rowVersion },
      ]);
    },

    async deactivateProduct(actor: number, id: number): Promise<void> {
      await execute('dbo.SP_Products_Deactivate', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDProduct', type: sql.Int, value: id },
      ]);
    },

    async createVariant(
      actor: number,
      productId: number,
      input: VariantInput & { price: string },
    ): Promise<number> {
      const result = await execute(
        'dbo.SP_Variants_Create',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'IDProduct', type: sql.Int, value: productId },
          { name: 'SKU', type: sql.NVarChar(40), value: input.sku },
          { name: 'Price', type: sql.Decimal(18, 2), value: input.price },
          {
            name: 'Attributes',
            type: sql.NVarChar(sql.MAX),
            value: attributesJson(input.attributes),
          },
        ],
        [{ name: 'IDVariant', type: sql.Int }],
      );
      return result.output['IDVariant'] as number;
    },

    async updateVariant(
      actor: number,
      id: number,
      input: VariantInput & { isActive: boolean },
    ): Promise<void> {
      await execute('dbo.SP_Variants_Update', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDVariant', type: sql.Int, value: id },
        { name: 'SKU', type: sql.NVarChar(40), value: input.sku },
        { name: 'IsActive', type: sql.Bit, value: input.isActive },
        {
          name: 'Attributes',
          type: sql.NVarChar(sql.MAX),
          value: attributesJson(input.attributes),
        },
      ]);
    },

    async changePrice(actor: number, id: number, newPrice: string): Promise<void> {
      await execute('dbo.SP_Variants_ChangePrice', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDVariant', type: sql.Int, value: id },
        { name: 'NewPrice', type: sql.Decimal(18, 2), value: newPrice },
      ]);
    },
  };
}
