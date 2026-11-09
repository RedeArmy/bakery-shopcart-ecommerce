// cspell:disable
import type sql from 'mssql';
import { describe, expect, it } from 'vitest';
import { DEMO_ADMIN_EMAIL, createSqlDemoStore } from '../src/demo-catalogue.js';
import { ATTRIBUTE_SIZE } from '../src/demo-catalogue-data.js';
import type { DemoCoupon, DemoProduct, DemoVariant } from '../src/demo-catalogue-data.js';

interface Recorded {
  kind: 'query' | 'execute';
  text: string;
  inputs: Record<string, unknown>;
  outputs: string[];
}
type Answer = { recordset?: unknown[]; output?: Record<string, unknown> };

/** Un pool que anota cada petición (texto o procedimiento, parámetros y salidas) y responde lo que se le diga. */
function fakePool(answer: (call: Recorded) => Answer = () => ({})) {
  const calls: Recorded[] = [];
  const pool = {
    request() {
      const call: Recorded = { kind: 'query', text: '', inputs: {}, outputs: [] };
      const builder = {
        input(name: string, _type: unknown, value: unknown) {
          call.inputs[name] = value;
          return builder;
        },
        output(name: string) {
          call.outputs.push(name);
          return builder;
        },
        query(text: string) {
          call.kind = 'query';
          call.text = text;
          calls.push(call);
          return Promise.resolve({ recordset: [], output: {}, ...answer(call) });
        },
        execute(name: string) {
          call.kind = 'execute';
          call.text = name;
          calls.push(call);
          return Promise.resolve({ recordset: [], output: {}, ...answer(call) });
        },
      };
      return builder;
    },
  };
  return { pool: pool as unknown as sql.ConnectionPool, calls };
}

const variant: DemoVariant = { sku: 'PAS-3L-06', size: '6 portions', price: '145.00', stock: 12 };
const product: DemoProduct = {
  name: 'Pastel',
  description: 'A description',
  leadTimeDays: 1,
  variants: [variant],
};
const coupon: DemoCoupon = {
  code: 'WELCOME10',
  type: 'Percentage',
  value: '10.00',
  minimumAmount: '100.00',
  startsInDays: -1,
  endsInDays: 365,
  totalUsageLimit: null,
  perCustomerUsageLimit: 1,
  category: null,
};
const window = {
  startsAt: new Date('2026-11-05T00:00:00Z'),
  endsAt: new Date('2027-11-06T00:00:00Z'),
};

describe('createSqlDemoStore: lookups', () => {
  it('finds the administrator by the documented e-mail and stops with a clear message when it does not exist', async () => {
    const found = fakePool(() => ({ recordset: [{ Id: 7 }] }));
    expect(await createSqlDemoStore(found.pool).adminId()).toBe(7);
    expect(found.calls[0]?.text).toContain('dbo.Users');
    expect(found.calls[0]?.inputs['email']).toBe(DEMO_ADMIN_EMAIL);

    const missing = fakePool();
    await expect(createSqlDemoStore(missing.pool).adminId()).rejects.toThrow(DEMO_ADMIN_EMAIL);
  });

  it.each([
    [
      'category',
      (s: ReturnType<typeof createSqlDemoStore>) => s.findCategory('Pasteles'),
      'dbo.Categories',
    ],
    [
      'product',
      (s: ReturnType<typeof createSqlDemoStore>) => s.findProduct(3, 'Pastel'),
      'dbo.Products',
    ],
    [
      'variant',
      (s: ReturnType<typeof createSqlDemoStore>) => s.findVariant('PAS-3L-06'),
      'dbo.Variants',
    ],
    [
      'coupon',
      (s: ReturnType<typeof createSqlDemoStore>) => s.findCoupon('WELCOME10'),
      'dbo.Coupons',
    ],
    [
      'bank account',
      (s: ReturnType<typeof createSqlDemoStore>) => s.findBankAccount('Banco', '1'),
      'dbo.BankAccounts',
    ],
    [
      'branch',
      (s: ReturnType<typeof createSqlDemoStore>) => s.findBranch('Central Branch'),
      'dbo.Branches',
    ],
  ])(
    'looks a %s up in its table with parameters and answers null when it is not there',
    async (_name, lookup, table) => {
      const empty = fakePool();
      expect(await lookup(createSqlDemoStore(empty.pool))).toBeNull();
      expect(empty.calls[0]?.text).toContain(table);
      expect(empty.calls[0]?.text).not.toMatch(/'[^@]*\b(Pasteles|WELCOME10|PAS-3L-06)\b/);

      const present = fakePool(() => ({ recordset: [{ Id: 42 }] }));
      expect(await lookup(createSqlDemoStore(present.pool))).toBe(42);
    },
  );
});

describe('createSqlDemoStore: creation through the real procedures', () => {
  it('creates a category with SP_Categories_Create and returns its output identifier', async () => {
    const { pool, calls } = fakePool(() => ({ output: { IDCategory: 5 } }));
    const id = await createSqlDemoStore(pool).createCategory(1, {
      name: 'Pasteles',
      description: 'For parties',
      products: [],
    });
    expect(id).toBe(5);
    expect(calls[0]).toMatchObject({
      kind: 'execute',
      text: 'dbo.SP_Categories_Create',
      outputs: ['IDCategory'],
    });
    expect(calls[0]?.inputs).toMatchObject({
      IDActor: 1,
      Name: 'Pasteles',
      Description: 'For parties',
    });
  });

  it('creates a product with SP_Products_Create and its lead time', async () => {
    const { pool, calls } = fakePool(() => ({ output: { IDProduct: 9 } }));
    expect(await createSqlDemoStore(pool).createProduct(1, 5, product)).toBe(9);
    expect(calls[0]).toMatchObject({ kind: 'execute', text: 'dbo.SP_Products_Create' });
    expect(calls[0]?.inputs).toMatchObject({ IDCategory: 5, Name: 'Pastel', LeadTimeDays: 1 });
  });

  it('creates a packaging that draws its units from the variant that holds the stock', async () => {
    const { pool, calls } = fakePool(() => ({ recordset: [{ Id: 12 }] }));
    const bag: DemoVariant = {
      sku: 'PAN-CHA-06',
      size: 'Bolsa de 6',
      price: '19.00',
      stock: 0,
      unitsPerPack: 6,
      sharesStockWith: 'PAN-CHA-12',
    };
    expect(await createSqlDemoStore(pool).createVariant(1, 9, bag)).toBe(12);
    const call = calls[0];
    expect(call?.text).toContain('@UnitsPerPack = @UnitsPerPack');
    expect(call?.text).toContain('@IDStockVariant = @IDStockVariant');
    expect(call?.inputs).toMatchObject({ UnitsPerPack: 6, StockSku: 'PAN-CHA-12' });
  });

  it('creates a variant with one unit per pack and no shared stock by default', async () => {
    const { pool, calls } = fakePool(() => ({ recordset: [{ Id: 11 }] }));
    await createSqlDemoStore(pool).createVariant(1, 9, variant);
    expect(calls[0]?.inputs).toMatchObject({ UnitsPerPack: 1, StockSku: null });
  });

  it('creates a variant sending the price as text that SQL converts to DECIMAL(18,2), never as a number', async () => {
    const { pool, calls } = fakePool(() => ({ recordset: [{ Id: 11 }] }));
    expect(await createSqlDemoStore(pool).createVariant(1, 9, variant)).toBe(11);
    const call = calls[0];
    expect(call?.text).toContain('dbo.SP_Variants_Create');
    expect(call?.text).toContain('CAST(@PriceText AS DECIMAL(18,2))');
    expect(call?.inputs['PriceText']).toBe('145.00');
    expect(typeof call?.inputs['PriceText']).toBe('string');
    expect(JSON.parse(call?.inputs['Attributes'] as string)).toEqual([
      { name: ATTRIBUTE_SIZE, value: '6 portions' },
    ]);
  });

  it('enters the stock through the inventory ledger procedure', async () => {
    const { pool, calls } = fakePool();
    await createSqlDemoStore(pool).registerStock(1, 11, 12, 'Opening stock');
    expect(calls[0]).toMatchObject({
      kind: 'execute',
      text: 'dbo.SP_Inventory_RegisterEntry',
      outputs: ['IDMovement'],
    });
    expect(calls[0]?.inputs).toMatchObject({ IDVariant: 11, Quantity: 12 });
  });

  it('creates a coupon with text amounts converted in SQL and the limits as null when there are none', async () => {
    const { pool, calls } = fakePool(() => ({ recordset: [{ Id: 3 }] }));
    expect(await createSqlDemoStore(pool).createCoupon(1, coupon, window, null)).toBe(3);
    const call = calls[0];
    expect(call?.text).toContain('dbo.SP_Coupons_Create');
    expect(call?.text).toContain('CAST(@ValueText AS DECIMAL(18,2))');
    expect(call?.text).toContain('CAST(@MinimumText AS DECIMAL(18,2))');
    expect(call?.inputs).toMatchObject({
      Code: 'WELCOME10',
      ValueText: '10.00',
      MinimumText: '100.00',
      TotalUsageLimit: null,
      PerCustomerUsageLimit: 1,
      IDCategory: null,
      StartsAt: window.startsAt,
      EndsAt: window.endsAt,
    });
  });

  it('creates a branch with SP_Branches_Create and returns its output identifier', async () => {
    const { pool, calls } = fakePool(() => ({ output: { IDBranch: 4 } }));
    const id = await createSqlDemoStore(pool).createBranch(1, {
      name: 'Central Branch',
      line1: '6th Avenue',
      municipality: 'Guatemala',
      department: 'Guatemala',
      phone: '2222-1111',
      openingHours: 'Monday to Saturday',
    });
    expect(id).toBe(4);
    expect(calls[0]).toMatchObject({
      kind: 'execute',
      text: 'dbo.SP_Branches_Create',
      outputs: ['IDBranch'],
    });
    expect(calls[0]?.inputs).toMatchObject({ Name: 'Central Branch', Phone: '2222-1111' });
  });

  it('saves a bank account with SP_BankAccounts_Save and returns the saved identifier', async () => {
    const { pool, calls } = fakePool(() => ({ output: { IDSaved: 2 } }));
    const id = await createSqlDemoStore(pool).createBankAccount(1, {
      bankName: 'Example Bank',
      accountType: 'Checking',
      accountNumber: '0000-000001-1',
      holderName: 'Pastelería',
      instructions: 'A fictitious account',
    });
    expect(id).toBe(2);
    expect(calls[0]).toMatchObject({
      kind: 'execute',
      text: 'dbo.SP_BankAccounts_Save',
      outputs: ['IDSaved'],
    });
    expect(calls[0]?.inputs).toMatchObject({ AccountType: 'Checking', HolderName: 'Pastelería' });
  });
});
