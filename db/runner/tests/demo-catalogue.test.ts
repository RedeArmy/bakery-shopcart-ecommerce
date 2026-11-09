// cspell:disable
import { describe, expect, it } from 'vitest';
import { seedDemoCatalogue, variantAttributes } from '../src/demo-catalogue.js';
import type { DemoStore } from '../src/demo-catalogue.js';
import { DEMO_BANK_ACCOUNTS, DEMO_CATEGORIES, DEMO_COUPONS } from '../src/demo-catalogue-data.js';
import type { DemoCoupon, DemoVariant } from '../src/demo-catalogue-data.js';

const NOW = new Date('2026-11-06T12:00:00Z');
const allVariants = DEMO_CATEGORIES.flatMap((category) =>
  category.products.flatMap((product) => product.variants),
);

/** Almacén en memoria: cuenta lo que se crea y lo que se registra en el libro, como lo haría la base de datos. */
class MemoryStore implements DemoStore {
  private sequence = 0;
  readonly categories = new Map<string, number>();
  readonly products = new Map<string, number>();
  readonly variants = new Map<string, number>();
  readonly coupons = new Map<
    string,
    { coupon: DemoCoupon; startsAt: Date; endsAt: Date; idCategory: number | null }
  >();
  readonly bankAccounts = new Set<string>();
  readonly branches = new Set<string>();
  readonly ledger: { idVariant: number; quantity: number; reason: string }[] = [];
  actors = new Set<number>();

  private next(): number {
    this.sequence += 1;
    return this.sequence;
  }
  adminId() {
    return Promise.resolve(99);
  }
  findCategory(name: string) {
    return Promise.resolve(this.categories.get(name) ?? null);
  }
  createCategory(actor: number, category: { name: string }) {
    this.actors.add(actor);
    const id = this.next();
    this.categories.set(category.name, id);
    return Promise.resolve(id);
  }
  findProduct(idCategory: number, name: string) {
    return Promise.resolve(this.products.get(`${idCategory}|${name}`) ?? null);
  }
  createProduct(actor: number, idCategory: number, product: { name: string }) {
    this.actors.add(actor);
    const id = this.next();
    this.products.set(`${idCategory}|${product.name}`, id);
    return Promise.resolve(id);
  }
  findVariant(sku: string) {
    return Promise.resolve(this.variants.get(sku) ?? null);
  }
  createVariant(actor: number, _idProduct: number, variant: DemoVariant) {
    this.actors.add(actor);
    const id = this.next();
    this.variants.set(variant.sku, id);
    return Promise.resolve(id);
  }
  registerStock(actor: number, idVariant: number, quantity: number, reason: string) {
    this.actors.add(actor);
    this.ledger.push({ idVariant, quantity, reason });
    return Promise.resolve();
  }
  findCoupon(code: string) {
    return Promise.resolve(this.coupons.has(code) ? 1 : null);
  }
  createCoupon(
    actor: number,
    coupon: DemoCoupon,
    window: { startsAt: Date; endsAt: Date },
    idCategory: number | null,
  ) {
    this.actors.add(actor);
    this.coupons.set(coupon.code, { coupon, ...window, idCategory });
    return Promise.resolve(this.next());
  }
  findBankAccount(bankName: string, accountNumber: string) {
    return Promise.resolve(this.bankAccounts.has(`${bankName}|${accountNumber}`) ? 1 : null);
  }
  findBranch(name: string) {
    return Promise.resolve(this.branches.has(name) ? 1 : null);
  }
  createBranch(actor: number, branch: { name: string }) {
    this.actors.add(actor);
    this.branches.add(branch.name);
    return Promise.resolve(this.next());
  }
  createBankAccount(actor: number, account: { bankName: string; accountNumber: string }) {
    this.actors.add(actor);
    this.bankAccounts.add(`${account.bankName}|${account.accountNumber}`);
    return Promise.resolve(this.next());
  }
}

describe('demo catalogue data', () => {
  it('has the six categories of the design and about sixty products', () => {
    expect(DEMO_CATEGORIES).toHaveLength(6);
    const products = DEMO_CATEGORIES.flatMap((category) => category.products);
    expect(products.length).toBeGreaterThanOrEqual(58);
    expect(products.length).toBeLessThanOrEqual(62);
  });

  it('keeps the four example products of the design with their SKUs and prices', () => {
    const bySku = new Map(allVariants.map((variant) => [variant.sku, variant.price]));
    expect(bySku.get('PAS-3L-06')).toBe('145.00');
    expect(bySku.get('PAS-3L-12')).toBe('260.00');
    expect(bySku.get('PAS-CHO-12')).toBe('275.00');
    expect(bySku.get('PAS-CHO-24')).toBe('480.00');
    expect(bySku.get('CUP-RV-06')).toBe('90.00');
    expect(bySku.get('GAL-AVE-12')).toBe('45.00');
  });

  it('has unique SKUs that fit the column and unique product names inside a category', () => {
    const skuList = allVariants.map((variant) => variant.sku);
    expect(new Set(skuList).size).toBe(skuList.length);
    for (const sku of skuList) {
      expect(sku.length).toBeLessThanOrEqual(40);
      expect(sku).toMatch(/^[A-Z]{3}-[A-Z0-9]{2,4}-[A-Z0-9]{2,3}$/);
    }
    for (const category of DEMO_CATEGORIES) {
      const names = category.products.map((product) => product.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('writes every price as a decimal string with two digits, never as a number', () => {
    for (const variant of allVariants) {
      expect(typeof variant.price).toBe('string');
      expect(variant.price).toMatch(/^[1-9]\d*\.\d{2}$/);
    }
  });

  it('fits the lengths of the columns and uses whole, non-negative stock', () => {
    for (const category of DEMO_CATEGORIES) {
      expect(category.name.length).toBeLessThanOrEqual(80);
      for (const product of category.products) {
        expect(product.name.length).toBeLessThanOrEqual(150);
        expect(product.description.length).toBeLessThanOrEqual(1000);
        expect(Number.isInteger(product.leadTimeDays)).toBe(true);
        expect(product.leadTimeDays).toBeGreaterThanOrEqual(0);
      }
    }
    for (const variant of allVariants) {
      expect(Number.isInteger(variant.stock)).toBe(true);
      expect(variant.stock).toBeGreaterThanOrEqual(0);
      expect(variant.size.length).toBeLessThanOrEqual(60);
    }
  });

  it('leaves a few variants out of stock on purpose, to see that state in the shop', () => {
    const soldOut = allVariants.filter((variant) => variant.stock === 0);
    expect(soldOut.length).toBeGreaterThanOrEqual(2);
    expect(soldOut.length).toBeLessThan(allVariants.length / 10);
  });

  it('shares the stock of the packagings of a product: the one that draws has none of its own and comes after the one that holds it', () => {
    for (const category of DEMO_CATEGORIES) {
      for (const product of category.products) {
        const seen = new Map<string, DemoVariant>();
        for (const variant of product.variants) {
          if (variant.sharesStockWith !== undefined) {
            const holder = seen.get(variant.sharesStockWith);
            expect(holder, `${variant.sku} draws from ${variant.sharesStockWith}`).toBeDefined();
            expect(holder?.sharesStockWith).toBeUndefined();
            expect(variant.stock).toBe(0);
            expect(variant.unitsPerPack).toBeGreaterThan(0);
          }
          seen.set(variant.sku, variant);
        }
      }
    }
  });

  it('sells the champurradas by the dozen and by the bag of 6 from the same 600 units', () => {
    const champurradas = DEMO_CATEGORIES.flatMap((category) => category.products).find(
      (product) => product.name === 'Champurradas',
    );
    expect(champurradas?.variants).toEqual([
      expect.objectContaining({ sku: 'PAN-CHA-12', unitsPerPack: 12, stock: 600 }),
      expect.objectContaining({
        sku: 'PAN-CHA-06',
        unitsPerPack: 6,
        sharesStockWith: 'PAN-CHA-12',
        stock: 0,
      }),
    ]);
  });

  it('has the four documented coupons, one for each message of RF-05', () => {
    expect(DEMO_COUPONS.map((coupon) => coupon.code)).toEqual([
      'WELCOME10',
      'CAKES25',
      'SOLDOUT',
      'EXPIRED',
    ]);
    const welcome = DEMO_COUPONS[0];
    expect(welcome).toMatchObject({
      type: 'Percentage',
      value: '10.00',
      minimumAmount: '100.00',
      perCustomerUsageLimit: 1,
    });
    const cakes = DEMO_COUPONS[1];
    expect(cakes).toMatchObject({ type: 'FixedAmount', value: '25.00', category: 'Pasteles' });
    expect(DEMO_CATEGORIES.map((category) => category.name)).toContain('Pasteles');
    expect(DEMO_COUPONS[2]).toMatchObject({ code: 'SOLDOUT', totalUsageLimit: 1 });
  });

  it('has two example bank accounts of different types, marked as not real', () => {
    expect(DEMO_BANK_ACCOUNTS.map((account) => account.accountType).sort()).toEqual([
      'Checking',
      'Savings',
    ]);
    expect(new Set(DEMO_BANK_ACCOUNTS.map((account) => account.accountNumber)).size).toBe(2);
    for (const account of DEMO_BANK_ACCOUNTS)
      expect(account.instructions.length).toBeGreaterThan(10);
  });
});

describe('variantAttributes', () => {
  it('always carries the size and carries the flavour only when the variant has one', () => {
    const plain = JSON.parse(
      variantAttributes({ sku: 'X', size: 'Single', price: '1.00', stock: 1 }),
    ) as { name: string; value: string }[];
    expect(plain).toHaveLength(1);
    expect(plain[0]?.value).toBe('Single');
    const flavoured = JSON.parse(
      variantAttributes({ sku: 'X', size: 'Single', price: '1.00', stock: 1, flavour: 'Coco' }),
    ) as { name: string; value: string }[];
    expect(flavoured.map((attribute) => attribute.value)).toEqual(['Single', 'Coco']);
  });
});

describe('seedDemoCatalogue', () => {
  it('creates everything on an empty database, signed by the administrator', async () => {
    const store = new MemoryStore();
    const summary = await seedDemoCatalogue(store, NOW);
    expect(summary.categories).toBe(DEMO_CATEGORIES.length);
    expect(summary.products).toBe(DEMO_CATEGORIES.flatMap((category) => category.products).length);
    expect(summary.variants).toBe(allVariants.length);
    expect(summary.coupons).toBe(4);
    expect(summary.bankAccounts).toBe(2);
    expect(summary.branches).toBe(2);
    expect([...store.actors]).toEqual([99]);
  });

  it('enters the stock only through the ledger, once per variant that has stock', async () => {
    const store = new MemoryStore();
    const summary = await seedDemoCatalogue(store, NOW);
    const withStock = allVariants.filter((variant) => variant.stock > 0);
    expect(store.ledger).toHaveLength(withStock.length);
    expect(store.ledger.reduce((total, entry) => total + entry.quantity, 0)).toBe(summary.units);
    expect(summary.units).toBe(withStock.reduce((total, variant) => total + variant.stock, 0));
    expect(store.ledger.every((entry) => entry.reason.length > 0)).toBe(true);
  });

  it('changes nothing when it runs again and never adds units twice', async () => {
    const store = new MemoryStore();
    await seedDemoCatalogue(store, NOW);
    const entries = store.ledger.length;
    const again = await seedDemoCatalogue(store, NOW);
    expect(again).toEqual({
      categories: 0,
      products: 0,
      variants: 0,
      units: 0,
      coupons: 0,
      bankAccounts: 0,
      branches: 0,
    });
    expect(store.ledger).toHaveLength(entries);
  });

  it('completes only what is missing after an interrupted run', async () => {
    const store = new MemoryStore();
    await seedDemoCatalogue(store, NOW);
    store.variants.delete('PAS-3L-06');
    store.coupons.delete('EXPIRED');
    const again = await seedDemoCatalogue(store, NOW);
    expect(again).toMatchObject({ categories: 0, products: 0, variants: 1, coupons: 1, units: 12 });
  });

  it('dates the coupons from the moment of seeding: valid ones around now and the expired one in the past', async () => {
    const store = new MemoryStore();
    await seedDemoCatalogue(store, NOW);
    const welcome = store.coupons.get('WELCOME10');
    expect(welcome?.startsAt.getTime()).toBeLessThan(NOW.getTime());
    expect(welcome?.endsAt.getTime()).toBeGreaterThan(NOW.getTime());
    const expired = store.coupons.get('EXPIRED');
    expect(expired?.endsAt.getTime()).toBeLessThan(NOW.getTime());
    expect(expired?.startsAt.getTime()).toBeLessThan(expired?.endsAt.getTime() ?? 0);
  });

  it('links CAKES25 to the category Pasteles and leaves the others open to the whole cart', async () => {
    const store = new MemoryStore();
    await seedDemoCatalogue(store, NOW);
    expect(store.coupons.get('CAKES25')?.idCategory).toBe(store.categories.get('Pasteles'));
    expect(store.coupons.get('WELCOME10')?.idCategory).toBeNull();
  });

  it('gives SOLDOUT a single use and never writes a usage counter by hand', async () => {
    const store = new MemoryStore();
    await seedDemoCatalogue(store, NOW);
    expect(store.coupons.get('SOLDOUT')?.coupon.totalUsageLimit).toBe(1);
    expect(Object.keys(store)).not.toContain('exhausted');
  });

  it('stops with the error of the store, for example when the administrator account does not exist', async () => {
    const store = new MemoryStore();
    store.adminId = () => Promise.reject(new Error('needs the account'));
    await expect(seedDemoCatalogue(store, NOW)).rejects.toThrow('needs the account');
    expect(store.categories.size).toBe(0);
  });
});
