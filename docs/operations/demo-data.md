# Demo data

`npm run up` (with `SEED_DEMO_DATA=true`, which `.env.example` sets) fills a new database with a small shop so that the API and the screens have something to show. It is created by the `db-migrate` service after the migrations, right after the [test accounts](test-accounts.md), and never in production or in a `_CI` database.

## What is created

| Data | Content |
|---|---|
| Categories | Pasteles, Cupcakes, Galletas, Pan dulce, Postres fríos and Temporada (the six of the design) | <!-- spelling-ignore -->
| Products | 60, with 98 variants and attributes `Tamaño` and `Sabor`; the four example products of the design keep their SKUs and prices (`PAS-3L-06` Q145.00, `PAS-CHO-12` Q275.00, `CUP-RV-06` Q90.00, `GAL-AVE-12` Q45.00) | <!-- spelling-ignore -->
| Stock | 6,070 units in total, entered through the inventory ledger. The bags of 6 and the dozens of the sweet bread (and the champurradas, by the dozen and by the bag of 6) are packagings that share one stock in units ([ADR-0031](../adr/0031-packagings-share-one-stock-measured-in-units.md)). Three variants are out of stock on purpose (`PAS-MOK-24`, `CUP-FRE-06`, `TEM-SVA-06`) to see that state |
| Coupons | `WELCOME10`, `CAKES25`, `SOLDOUT` and `EXPIRED` (see below) |
| Bank accounts | Two fictitious accounts, one checking and one savings, of "Banco de Ejemplo", marked in their instructions as not real | <!-- spelling-ignore -->

All names and descriptions are Spanish data. Everything goes in through the real stored procedures (`SP_Categories_Create`, `SP_Products_Create`, `SP_Variants_Create`, `SP_Inventory_RegisterEntry`, `SP_Coupons_Create`, `SP_BankAccounts_Save`), signed by the administrator, so the audit log has the entries and both reconciliation views return zero rows.

## The coupons and the message each one shows

| Code | Rule | How to see its message |
|---|---|---|
| `WELCOME10` | 10 % off the whole cart, minimum Q100.00, one use per customer | Apply it to a cart below Q100.00: `COUPON_MINIMUM_NOT_MET`. Use it in an order and apply it again with the same customer: `COUPON_ALREADY_USED` |
| `CAKES25` | Q25.00 off, only for the Pasteles category | A cart without a cake: no eligible items |
| `SOLDOUT` | 15 % off, **one use in total** | Confirm one order with it (customer 1). While that order is alive, customer 2 gets `COUPON_EXHAUSTED` |
| `EXPIRED` | Ended a month ago | Apply it: `COUPON_EXPIRED` |

`SOLDOUT` is not created already used up on purpose. The counter of uses of a coupon must always equal its real uses (`VW_Reconciliation_Amounts`), and a use needs an order, so a coupon that starts exhausted would leave a permanent discrepancy. If the order that holds the only use is cancelled or expires unpaid, the use is returned and the coupon can be used again.

The dates are counted from the moment of seeding: the valid coupons start the day before and last a year.

## Running it again

The step is idempotent. Each category, product, SKU, coupon and bank account is looked up before it is created, so running `npm run up` or `npm run seed` again changes nothing, never adds stock twice and completes only what is missing after an interrupted run. An existing item is never updated.

To start from scratch use `docker compose down --volumes` and `npm run up`. To create the data without migrating, `SEED_DEMO_DATA=true npm run seed` (it refuses `_CI` databases).

## Where it lives

- Data: `db/runner/src/demo-catalogue-data.ts` (Spanish, excluded from the spelling check like the other seed content).
- Logic and the SQL adapter: `db/runner/src/demo-catalogue.ts`.
- Tests: `db/runner/tests/demo-catalogue.test.ts` (shape of the data and idempotency, against an in-memory store).

Amounts travel to SQL Server as text and are converted to `DECIMAL(18,2)` there, never as a JavaScript `number`.
