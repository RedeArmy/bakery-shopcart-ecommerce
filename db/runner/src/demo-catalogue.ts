// Paso de semilla del catálogo de demostración. Todo entra por los procedimientos reales (con su auditoría y su libro de
// inventario), nunca con INSERT directos: así la conciliación de existencias da cero filas y la tienda se comporta igual
// que con datos cargados por el administrador. Cada paso mira antes si el dato ya existe, así que repetirlo no cambia nada.
import sql from 'mssql';
import {
  ATTRIBUTE_FLAVOUR,
  ATTRIBUTE_SIZE,
  DEMO_BANK_ACCOUNTS,
  DEMO_BRANCHES,
  DEMO_CATEGORIES,
  DEMO_COUPONS,
  DEMO_STOCK_REASON,
} from './demo-catalogue-data.js';
import type {
  DemoBankAccount,
  DemoBranch,
  DemoCategory,
  DemoCoupon,
  DemoProduct,
  DemoVariant,
} from './demo-catalogue-data.js';
import { inSequence } from './sequence.js';

export const DEMO_ADMIN_EMAIL = 'admin@shopcart.test';

/** Puerto del almacenamiento: la semilla no sabe de SQL, así que se prueba con uno en memoria. */
export interface DemoStore {
  adminId(): Promise<number>;
  findCategory(name: string): Promise<number | null>;
  createCategory(actor: number, category: DemoCategory): Promise<number>;
  findProduct(idCategory: number, name: string): Promise<number | null>;
  createProduct(actor: number, idCategory: number, product: DemoProduct): Promise<number>;
  findVariant(sku: string): Promise<number | null>;
  createVariant(actor: number, idProduct: number, variant: DemoVariant): Promise<number>;
  registerStock(actor: number, idVariant: number, quantity: number, reason: string): Promise<void>;
  findCoupon(code: string): Promise<number | null>;
  createCoupon(
    actor: number,
    coupon: DemoCoupon,
    window: { startsAt: Date; endsAt: Date },
    idCategory: number | null,
  ): Promise<number>;
  findBankAccount(bankName: string, accountNumber: string): Promise<number | null>;
  createBankAccount(actor: number, account: DemoBankAccount): Promise<number>;
  findBranch(name: string): Promise<number | null>;
  createBranch(actor: number, branch: DemoBranch): Promise<number>;
}

export interface DemoSummary {
  categories: number;
  products: number;
  variants: number;
  units: number;
  coupons: number;
  bankAccounts: number;
  branches: number;
}

/** Atributos de una variante como el arreglo JSON que espera SP_Variants_SetAttributes. */
export function variantAttributes(variant: DemoVariant): string {
  const attributes = [{ name: ATTRIBUTE_SIZE, value: variant.size }];
  if (variant.flavour !== undefined) {
    attributes.push({ name: ATTRIBUTE_FLAVOUR, value: variant.flavour });
  }
  return JSON.stringify(attributes);
}

const DAY_MS = 24 * 3600 * 1000;
const inDays = (from: Date, days: number): Date => new Date(from.getTime() + days * DAY_MS);

/**
 * Crea lo que falte del catálogo, los cupones y las cuentas bancarias de demostración. Las existencias entran solo al
 * crear la variante: repetir el paso nunca suma unidades.
 */
export async function seedDemoCatalogue(store: DemoStore, now: Date): Promise<DemoSummary> {
  const summary: DemoSummary = {
    categories: 0,
    products: 0,
    variants: 0,
    units: 0,
    coupons: 0,
    bankAccounts: 0,
    branches: 0,
  };
  const actor = await store.adminId();
  const categoryIds = new Map<string, number>();

  await inSequence(DEMO_CATEGORIES, async (category) => {
    const existingCategory = await store.findCategory(category.name);
    const idCategory = existingCategory ?? (await store.createCategory(actor, category));
    if (existingCategory === null) summary.categories += 1;
    categoryIds.set(category.name, idCategory);

    await inSequence(category.products, async (product) => {
      const existingProduct = await store.findProduct(idCategory, product.name);
      const idProduct = existingProduct ?? (await store.createProduct(actor, idCategory, product));
      if (existingProduct === null) summary.products += 1;

      await inSequence(product.variants, async (variant) => {
        if ((await store.findVariant(variant.sku)) !== null) return;
        const idVariant = await store.createVariant(actor, idProduct, variant);
        summary.variants += 1;
        if (variant.stock > 0) {
          await store.registerStock(actor, idVariant, variant.stock, DEMO_STOCK_REASON);
          summary.units += variant.stock;
        }
      });
    });
  });

  await inSequence(DEMO_COUPONS, async (coupon) => {
    if ((await store.findCoupon(coupon.code)) === null) {
      const window = {
        startsAt: inDays(now, coupon.startsInDays),
        endsAt: inDays(now, coupon.endsInDays),
      };
      const idCategory =
        coupon.category === null ? null : (categoryIds.get(coupon.category) ?? null);
      await store.createCoupon(actor, coupon, window, idCategory);
      summary.coupons += 1;
    }
  });

  await inSequence(DEMO_BANK_ACCOUNTS, async (account) => {
    if ((await store.findBankAccount(account.bankName, account.accountNumber)) !== null) return;
    await store.createBankAccount(actor, account);
    summary.bankAccounts += 1;
  });

  await inSequence(DEMO_BRANCHES, async (branch) => {
    if ((await store.findBranch(branch.name)) !== null) return;
    await store.createBranch(actor, branch);
    summary.branches += 1;
  });

  return summary;
}

/**
 * Almacenamiento sobre SQL Server con el login del runner. Los importes viajan como texto y se convierten en SQL a
 * DECIMAL(18,2): pasarlos como number los haría pasar por coma flotante, que el proyecto nunca usa para dinero.
 */
export function createSqlDemoStore(pool: sql.ConnectionPool): DemoStore {
  const lookup = async (
    text: string,
    bind: (request: sql.Request) => sql.Request,
  ): Promise<number | null> => {
    const result = await bind(pool.request()).query<{ Id: number }>(text);
    return result.recordset[0]?.Id ?? null;
  };

  return {
    async adminId() {
      const id = await lookup('SELECT IDUser AS Id FROM dbo.Users WHERE Email = @email;', (r) =>
        r.input('email', sql.NVarChar(256), DEMO_ADMIN_EMAIL),
      );
      if (id === null) {
        throw new Error(
          `The demo catalogue needs the account ${DEMO_ADMIN_EMAIL}: create the demo accounts first.`,
        );
      }
      return id;
    },
    findCategory: (name) =>
      lookup('SELECT IDCategory AS Id FROM dbo.Categories WHERE Name = @name;', (r) =>
        r.input('name', sql.NVarChar(80), name),
      ),
    async createCategory(actor, category) {
      const result = await pool
        .request()
        .input('IDActor', sql.Int, actor)
        .input('Name', sql.NVarChar(80), category.name)
        .input('Description', sql.NVarChar(300), category.description)
        .output('IDCategory', sql.Int)
        .execute('dbo.SP_Categories_Create');
      return result.output['IDCategory'] as number;
    },
    findProduct: (idCategory, name) =>
      lookup(
        'SELECT IDProduct AS Id FROM dbo.Products WHERE IDCategory = @category AND Name = @name;',
        (r) => r.input('category', sql.Int, idCategory).input('name', sql.NVarChar(150), name),
      ),
    async createProduct(actor, idCategory, product) {
      const result = await pool
        .request()
        .input('IDActor', sql.Int, actor)
        .input('IDCategory', sql.Int, idCategory)
        .input('Name', sql.NVarChar(150), product.name)
        .input('Description', sql.NVarChar(1000), product.description)
        .input('LeadTimeDays', sql.TinyInt, product.leadTimeDays)
        .output('IDProduct', sql.Int)
        .execute('dbo.SP_Products_Create');
      return result.output['IDProduct'] as number;
    },
    findVariant: (sku) =>
      lookup('SELECT IDVariant AS Id FROM dbo.Variants WHERE SKU = @sku;', (r) =>
        r.input('sku', sql.NVarChar(40), sku),
      ),
    async createVariant(actor, idProduct, variant) {
      const result = await pool
        .request()
        .input('IDActor', sql.Int, actor)
        .input('IDProduct', sql.Int, idProduct)
        .input('SKU', sql.NVarChar(40), variant.sku)
        .input('PriceText', sql.VarChar(20), variant.price)
        .input('Attributes', sql.NVarChar(sql.MAX), variantAttributes(variant)).query<{
        Id: number;
      }>(`
          DECLARE @IDVariant INT, @Price DECIMAL(18,2) = CAST(@PriceText AS DECIMAL(18,2));
          EXEC dbo.SP_Variants_Create @IDActor = @IDActor, @IDProduct = @IDProduct, @SKU = @SKU, @Price = @Price,
                                      @Attributes = @Attributes, @IDVariant = @IDVariant OUTPUT;
          SELECT @IDVariant AS Id;`);
      return result.recordset[0]?.Id as number;
    },
    async registerStock(actor, idVariant, quantity, reason) {
      await pool
        .request()
        .input('IDActor', sql.Int, actor)
        .input('IDVariant', sql.Int, idVariant)
        .input('Quantity', sql.Int, quantity)
        .input('Reason', sql.NVarChar(250), reason)
        .output('IDMovement', sql.BigInt)
        .execute('dbo.SP_Inventory_RegisterEntry');
    },
    findCoupon: (code) =>
      lookup('SELECT IDCoupon AS Id FROM dbo.Coupons WHERE Code = @code;', (r) =>
        r.input('code', sql.NVarChar(30), code),
      ),
    async createCoupon(actor, coupon, window, idCategory) {
      const result = await pool
        .request()
        .input('IDActor', sql.Int, actor)
        .input('Code', sql.NVarChar(30), coupon.code)
        .input('Type', sql.NVarChar(12), coupon.type)
        .input('ValueText', sql.VarChar(20), coupon.value)
        .input('MinimumText', sql.VarChar(20), coupon.minimumAmount)
        .input('StartsAt', sql.DateTime2(3), window.startsAt)
        .input('EndsAt', sql.DateTime2(3), window.endsAt)
        .input('TotalUsageLimit', sql.Int, coupon.totalUsageLimit)
        .input('PerCustomerUsageLimit', sql.Int, coupon.perCustomerUsageLimit)
        .input('IDCategory', sql.Int, idCategory).query<{ Id: number }>(`
          DECLARE @IDCoupon INT, @Value DECIMAL(18,2) = CAST(@ValueText AS DECIMAL(18,2)),
                  @Minimum DECIMAL(18,2) = CAST(@MinimumText AS DECIMAL(18,2));
          EXEC dbo.SP_Coupons_Create @IDActor = @IDActor, @Code = @Code, @Type = @Type, @Value = @Value,
                                     @MinimumAmount = @Minimum, @StartsAt = @StartsAt, @EndsAt = @EndsAt,
                                     @TotalUsageLimit = @TotalUsageLimit, @PerCustomerUsageLimit = @PerCustomerUsageLimit,
                                     @IDCategory = @IDCategory, @IDCoupon = @IDCoupon OUTPUT;
          SELECT @IDCoupon AS Id;`);
      return result.recordset[0]?.Id as number;
    },
    findBankAccount: (bankName, accountNumber) =>
      lookup(
        'SELECT IDBankAccount AS Id FROM dbo.BankAccounts WHERE BankName = @bank AND AccountNumber = @number;',
        (r) =>
          r
            .input('bank', sql.NVarChar(80), bankName)
            .input('number', sql.NVarChar(30), accountNumber),
      ),
    findBranch: (name) =>
      lookup('SELECT IDBranch AS Id FROM dbo.Branches WHERE Name = @name AND IsActive = 1;', (r) =>
        r.input('name', sql.NVarChar(80), name),
      ),
    async createBranch(actor, branch) {
      const result = await pool
        .request()
        .input('IDActor', sql.Int, actor)
        .input('Name', sql.NVarChar(80), branch.name)
        .input('Line1', sql.NVarChar(200), branch.line1)
        .input('Municipality', sql.NVarChar(80), branch.municipality)
        .input('Department', sql.NVarChar(80), branch.department)
        .input('Phone', sql.NVarChar(20), branch.phone)
        .input('OpeningHours', sql.NVarChar(200), branch.openingHours)
        .output('IDBranch', sql.Int)
        .execute('dbo.SP_Branches_Create');
      return result.output['IDBranch'] as number;
    },
    async createBankAccount(actor, account) {
      const result = await pool
        .request()
        .input('IDActor', sql.Int, actor)
        .input('BankName', sql.NVarChar(80), account.bankName)
        .input('AccountType', sql.NVarChar(12), account.accountType)
        .input('AccountNumber', sql.NVarChar(30), account.accountNumber)
        .input('HolderName', sql.NVarChar(120), account.holderName)
        .input('Instructions', sql.NVarChar(300), account.instructions)
        .output('IDSaved', sql.Int)
        .execute('dbo.SP_BankAccounts_Save');
      return result.output['IDSaved'] as number;
    },
  };
}
