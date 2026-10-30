# Database migration register

| Field | Value |
|---|---|
| Document ID | DB-MIG-REG |
| Owner | Database owner of the ShopCart project |
| Classification | Internal |
| Status | Active, controlled document |
| Last reviewed | 30 October 2026 |
| Governing decisions | [ADR-0003](../adr/0003-own-forward-only-migration-runner-in-node.md), [ADR-0012](../adr/0012-versioning-of-sql-objects-and-expand-contract.md), [ADR-0023](../adr/0023-sql-tests-with-tsqlt-in-ci-only.md) |
| Related documents | [Versioning](versioning.md), [ER diagram](er-diagram.md), [Naming standard](naming-standard.md), [Runner README](../../db/runner/README.md) |

## 1. Purpose and scope

This register is the single, controlled record of every structural change applied to the ShopCart database through a versioned migration (`V####`). For each migration it states what changed, why, what it depends on, how it was verified, how it can be reversed and who approved it.

It complements, and does not replace, the machine records: the `SchemaVersion` table is the source of truth for what a given database has actually run, and `npm run db:verify` proves it still matches the repository. This document is the source of truth for **intent and approval**.

Programmable objects (`R####`) are versioned by the header of each file and recorded in `ObjectVersions`; seeds (`S####`) are recorded in `SchemaVersion`. Objects are out of scope here until they change a contract; seeds that load reference data are registered in section 5 (see also section 8).

## 2. Rules of the register

1. **One row per migration, added in the same pull request that adds the file.** A migration without a register entry is not merged.
2. **Migrations are immutable once applied** to any shared environment (CI counts only when the migration is merged to `main`). A mistake is corrected by a new migration (forward-only). While a migration exists only on an unmerged branch it may still be corrected, and the checksum in this register is updated in the same commit.
3. **Checksums are SHA-256 of the file after removing the byte order mark and normalising line endings to LF**, exactly as the runner computes them, so they are identical on Windows and Linux.
4. **Every entry states its rollback strategy.** The database has no automatic down migrations; the strategy is the compensating change, the restore point or the statement that the change is additive and needs none.
5. **Breaking changes follow expand and contract** ([versioning](versioning.md)): add the new structure, move the code, then remove the old structure in a later migration, each with its own entry.
6. **Every entry names the tests that prove it.** A constraint, unique index or trigger without a tSQLt case is not complete (see `db/CLAUDE.md`).
7. **Names follow the glossary and the naming standard**; comments in the SQL are Spanish and explain the reason.

## 3. Lifecycle and statuses

| Status | Meaning |
|---|---|
| Draft | Written on a branch, not yet reviewed |
| In review | Pull request open, checks running |
| Approved | Reviewed and merged to `main`; immutable from this point |
| Applied | Run by the pipeline or in an environment other than the author's machine, and recorded in `SchemaVersion`. The throwaway database of the CI job counts |
| Superseded | A later migration has replaced part of its effect (the row stays; the later entry references it) |

Environment states used in the register: **Verified** (run and checked), **Pending** (not run yet), **Not deployed** (no such environment exists yet).

## 4. Summary

| ID | File | Title | Type | Risk | Status |
|---|---|---|---|---|---|
| V0001 | `V0001__create_security_tables.sql` | Security tables | Schema, additive | Low | Applied |
| V0002 | `V0002__create_catalogue_tables.sql` | Catalogue and addresses | Schema, additive | Low | Applied |
| V0003 | `V0003__create_inventory_tables.sql` | Inventory ledger | Schema, additive | Low | Applied |
| V0004 | `V0004__create_cart_and_coupon_tables.sql` | Carts and coupons | Schema, additive | Low | Applied |
| V0005 | `V0005__create_order_tables.sql` | Orders, statuses and coupon usages | Schema, additive | Medium | Applied |
| V0006 | `V0006__create_reservation_tables.sql` | Stock reservations | Schema, additive | Low | Applied |
| V0007 | `V0007__create_payment_tables.sql` | Payments, returns and financial ledger | Schema, additive | High | Applied |
| V0008 | `V0008__create_platform_tables.sql` | Idempotency, audit, configuration, DDL history | Schema, additive | Low | Applied |
| V0009 | `V0009__create_triggers_and_permissions.sql` | Triggers and permissions | Schema, behaviour | High | Applied |

Risk is the impact of a defect in the migration, not of running it: all nine run on an empty database, take no meaningful locks and move no data. **High** marks the migrations that protect money (V0007) or that can block legitimate writes if wrong (V0009).

## 5. Entries

Each entry uses the template in section 7. Common fields for all nine entries:

| Field | Value |
|---|---|
| Author | Eder Yafeth Garcia Quiroa |
| Created | 30 October 2026 |
| Pull request | [#18](https://github.com/RedeArmy/bakery-shopcart-ecommerce/pull/18), squash-merged to `main` on 30 October 2026 |
| Reviewer | Repository owner. The ruleset requires no approving review while the project has a single maintainer; the approval is the merge with all required checks green |
| Execution model | One transaction per script, applied by `npm run db:migrate` |
| Data migration | None: the database is empty when these run |
| Online impact | None: no existing data, no application connected yet |
| Local environment | Verified on 30 October 2026 (SQL Server 2022 container, applied twice, `db:verify` clean) |
| CI environment | Verified on 30 October 2026 (`sql-tests` job of pull request #18: 9 scripts applied, `db:verify` clean, 52 tests passed) |
| Production | Not deployed |

### V0001: Security tables

| Field | Value |
|---|---|
| File | `db/migrations/V0001__create_security_tables.sql` |
| SHA-256 | `69807e2f600c01f30c539b43f0ef782a71a20c64f3b1c364915d9b0bc8fb2bd6` |
| Description | Creates the identity model: roles, users and the refresh tokens that keep a session alive. Users are deactivated, never deleted, because orders and the audit log reference them. |
| Objects created | Tables `Roles`, `Users`, `RefreshTokens`; indexes `IX_RefreshTokens_User`, `IX_RefreshTokens_Family` |
| Key rules | Unique e-mail; role identifiers are fixed values, not `IDENTITY`; only the hash of a refresh token is stored; a token family can be revoked as a chain |
| Depends on | None (first migration) |
| Rollback | Additive. Compensating change: a later migration drops the tables in reverse order. Never needed before the first deployment |
| Tests | `Test_Schema` (existence, types) |
| Related decisions | ADR-0002 |

### V0002: Catalogue and addresses

| Field | Value |
|---|---|
| File | `db/migrations/V0002__create_catalogue_tables.sql` |
| SHA-256 | `b344124fb7368e39af64f42e7665bd28390433b11cd37b7908af6b6343401905` |
| Description | Creates the catalogue of products for sale: categories (with a parent), products with lead time, images, attributes, variants (SKU, price, stock) and customer delivery addresses. |
| Objects created | Tables `Categories`, `Products`, `ProductImages`, `Attributes`, `Variants`, `VariantAttributes`, `Addresses`; indexes `IX_Products_Category`, `UX_ProductImages_OnePrimary`, `IX_Variants_Product`, `IX_Addresses_User` |
| Key rules | Price includes VAT and is positive; `ReservedStock <= OnHandStock` as the anti-oversell safety net; one primary image per product; `ROWVERSION` for optimistic concurrency |
| Depends on | V0001 (`Users` for addresses) |
| Rollback | Additive. Compensating change: drop in reverse order |
| Tests | `Test_Constraints` (stock, price), `Test_Schema` |
| Related decisions | ADR-0007, ADR-0008 |

### V0003: Inventory ledger

| Field | Value |
|---|---|
| File | `db/migrations/V0003__create_inventory_tables.sql` |
| SHA-256 | `6289ee4a31742740385a63c6bfc795b6283c381809d8474f3991e7c482b122d1` |
| Description | Creates the stock ledger: every physical movement of a variant, with a signed quantity and the resulting balance. Reservations are not recorded here. |
| Objects created | Tables `InventoryMovementTypes`, `InventoryMovements`; indexes `IX_InventoryMovements_Variant_CreatedAt`, `UX_InventoryMovements_OneExitPerOrder` |
| Key rules | Quantity is never zero and the balance never negative; at most one exit per order and variant. The foreign key to `Orders` is added in V0005 |
| Depends on | V0001, V0002 |
| Rollback | Additive. Compensating change: drop the foreign key added by V0005, then the tables |
| Tests | `Test_Constraints` (one exit per order), `Test_Triggers` (append-only) |
| Related decisions | ADR-0007 |

### V0004: Carts and coupons

| Field | Value |
|---|---|
| File | `db/migrations/V0004__create_cart_and_coupon_tables.sql` |
| SHA-256 | `4d917db61dc90aa29462296249e3285352d36cf4f43c5bdfe31eb792ee1b7f36` |
| Description | Creates the shopping cart (for signed-in customers and guests), its lines and the coupon definitions. |
| Objects created | Tables `Carts`, `CartItems`, `Coupons`; indexes `UX_Carts_GuestToken`, `UX_Carts_OneActivePerUser`; foreign key `FK_Carts_Coupons` |
| Key rules | A cart has a user or a guest token; one active cart per user; quantities are absolute, between 1 and 99; the cart stores no price; percentage coupons cap at 100; usage count never passes the limit |
| Depends on | V0001, V0002 |
| Design deviation | `GuestToken` is unique through a **filtered unique index**, not a `UNIQUE` constraint. SQL Server treats `NULL` values as equal in a constraint, so the design's version would have allowed one signed-in cart in the whole table. Found by the constraint tests; recorded in the decision log |
| Rollback | Additive. Compensating change: drop `FK_Carts_Coupons`, then the tables |
| Tests | `Test_Constraints` (owner, active cart, guest token, coupon rules) |
| Related decisions | ADR-0013 |

### V0005: Orders, statuses and coupon usages

| Field | Value |
|---|---|
| File | `db/migrations/V0005__create_order_tables.sql` |
| SHA-256 | `dedb7808cecd07f9758b83b06df5b1d59a2e747d8cfccfcbe9e78cffb324cec5` |
| Description | Creates the order aggregate: status catalogue and allowed transitions (as data), the order with frozen amounts and address, its lines with product snapshots, the status history and the coupon usages. Adds the deferred foreign key from the inventory ledger. |
| Objects created | Tables `OrderStatuses`, `OrderStatusTransitions`, `Orders`, `OrderLines`, `OrderStatusHistory`, `CouponUsages`; six indexes; foreign key `FK_InventoryMovements_Orders` |
| Key rules | `Total = max(Subtotal - Discount, 0) + Shipping`; `TaxableBase + Vat = Total`; a paid order has a payment date; a line total equals quantity times price minus discount; returned quantity never exceeds sold quantity; one coupon per order |
| Depends on | V0001 to V0004 |
| Rollback | Additive. Compensating change: drop `FK_InventoryMovements_Orders`, then the tables in reverse order |
| Tests | `Test_Constraints` (totals, VAT, payment date, lines), `Test_Triggers` (transitions, frozen amounts) |
| Related decisions | ADR-0006, ADR-0008, ADR-0009, ADR-0014, ADR-0019 |

### V0006: Stock reservations

| Field | Value |
|---|---|
| File | `db/migrations/V0006__create_reservation_tables.sql` |
| SHA-256 | `fa2fe5de2276b90be1a0613014c88a01502dd2397f9a1493ee8db3e87065d0d4` |
| Description | Creates the expiring stock reservation that holds units for a cart and, once checkout is confirmed, for an order. |
| Objects created | Tables `Reservations`, `ReservationLines`; indexes `IX_Reservations_Expiry`, `IX_Reservations_Order` |
| Key rules | Status is one of Active, Consumed, Released, Expired; quantity positive; one line per reservation and variant |
| Depends on | V0002, V0004, V0005 |
| Rollback | Additive. Compensating change: drop the two tables |
| Tests | `Test_Schema` (existence, types) |
| Related decisions | ADR-0007 |

### V0007: Payments, returns and financial ledger

| Field | Value |
|---|---|
| File | `db/migrations/V0007__create_payment_tables.sql` |
| SHA-256 | `fc083398d1dd6d0c8da6861aec49daa88b1adba8662dbf23e0ca281eef95d9e2` |
| Description | Creates the money model: payment methods, statuses and transitions, bank accounts, payments, their history, deposit details and proofs, received webhooks, returns, refunds and the append-only financial ledger. |
| Objects created | 13 tables (`PaymentMethods`, `PaymentStatuses`, `PaymentStatusTransitions`, `BankAccounts`, `Payments`, `PaymentStatusHistory`, `PaymentDeposits`, `PaymentProofs`, `ReceivedWebhooks`, `Returns`, `ReturnLines`, `Refunds`, `FinancialMovements`) and 12 indexes |
| Key rules | One open attempt and one approved payment per order, enforced by filtered unique indexes (double charge is impossible in data); amounts positive and in GTQ; an external reference only for card payments; accepted proof types and a 5 MiB limit; ledger sign rule (charge positive, refund and fee negative); one charge per payment; webhook payload must be valid JSON and unique per provider message |
| Depends on | V0001, V0005 |
| Risk note | High because a defect here can double charge or hide a refund. Mitigated by the constraint tests listed below |
| Rollback | Additive. Compensating change: drop the tables in reverse order. After the first real payment a rollback is never a drop: money data is corrected only by compensating ledger movements |
| Tests | `Test_Constraints` (open and approved payment, amount, external reference, proof type, ledger sign, one charge), `Test_Triggers` |
| Related decisions | ADR-0004, ADR-0005, ADR-0015, ADR-0018, ADR-0021 |

### V0008: Idempotency, audit, configuration and DDL history

| Field | Value |
|---|---|
| File | `db/migrations/V0008__create_platform_tables.sql` |
| SHA-256 | `60a26c1ae8083c810b4bf174fb0d14c1e892a921ecc3087a0c833018d7f6022d` |
| Description | Creates the cross-cutting tables: stored responses for idempotent requests, the audit log, runtime configuration and the history of schema changes captured by a database trigger. |
| Objects created | Tables `IdempotentRequests`, `AuditLog`, `Configuration`, `DdlHistory`; indexes `IX_IdempotentRequests_Expiry`, `IX_AuditLog_Module_CreatedAt`, `IX_DdlHistory_Object` |
| Key rules | Unique key per scope, method, route and idempotency key; audit action limited to Create, Update, Deactivate, StatusChange and values must be JSON |
| Depends on | None structural |
| Note | `SchemaVersion` and `ObjectVersions` are not created here: the runner creates them before V0001 so that it can record V0001 itself. The design lists them in this migration; the difference is recorded in [versioning](versioning.md) |
| Rollback | Additive. Compensating change: drop the tables. The audit log is never dropped once it holds data |
| Tests | `Test_Constraints` (idempotency key, audit JSON and action), `Test_Schema` |
| Related decisions | ADR-0003, ADR-0004, ADR-0012 |

### V0009: Triggers and permissions

| Field | Value |
|---|---|
| File | `db/migrations/V0009__create_triggers_and_permissions.sql` |
| SHA-256 | `a803655fdcf0533d876ec780741c36f06418a14bf48854bd9e7892e85cbec04a` |
| Description | Adds the second line of defence behind the stored procedures: append-only tables, valid state transitions, frozen amounts, capture of schema changes, and the permissions of the application login. |
| Objects created | 11 triggers: `TR_AuditLog_Immutable`, `TR_FinancialMovements_Immutable`, `TR_InventoryMovements_Immutable`, `TR_OrderStatusHistory_Immutable`, `TR_PaymentStatusHistory_Immutable`, `TR_Orders_ValidateTransition`, `TR_Payments_ValidateTransition`, `TR_Orders_AmountsImmutable`, `TR_OrderLines_PricesImmutable`, `TR_Payments_AmountImmutable` and the database trigger `TR_Database_CaptureDdl`; grants for `shopcart_app` when that user exists |
| Key rules | Updates and deletes on the audit log and ledgers raise error 50422; a status change must exist in the transitions table; order, line and payment amounts cannot be updated (only `ReturnedQuantity` can); DDL on procedures, views and functions in `dbo` is recorded |
| Depends on | V0001 to V0008 |
| Risk note | High because a wrong trigger blocks legitimate writes. Mitigated by tests for each trigger in both directions (rejected and accepted) |
| Deployment note | The grants only apply when `shopcart_app` exists; the container initialisation creates it. It does not exist in CI, where there is nothing to grant |
| Rollback | Compensating change: a new migration drops or alters a trigger. Dropping an immutability trigger is a security decision and needs its own ADR or decision-log line |
| Tests | `Test_Triggers` (all triggers), `Test_Schema` (DDL capture) |
| Related decisions | ADR-0002, ADR-0006, ADR-0021 |

### Reference seeds

Seeds are idempotent `MERGE` scripts applied after the migrations. They are registered because the code, the API and the tests assume exactly these values. The common fields are the same as above, except the pull request, which is the one that adds them (see the revision history), and the rollback, which is to correct the seed and let the runner apply the new version.

| ID | File | SHA-256 | Content | Re-run behaviour |
|---|---|---|---|---|
| S0001 | `S0001__seed_roles.sql` | `d5bd6005e962e2cce6652f2412bfa0acc44cc2204570f3bdd3cdd2f27b0d8914` | Roles Customer (1), Operator (2), Administrator (3) | Names are corrected if they differ |
| S0002 | `S0002__seed_order_statuses.sql` | `580c22e5fa106b5aaa0c7fee092837c10e1960fc4cc4b7fe6ffc69d1e0bb93c2` | Eight order states and the eleven allowed transitions | Transitions are made equal to the declared set (a removed transition is deleted) |
| S0003 | `S0003__seed_payment_reference_data.sql` | `de3d5b7c00c36e11c0dafe6cab47b93aafa44840679566143b889285cb962148` | Payment methods `CARD` and `BANK_DEPOSIT`, eight payment states and nine transitions | Same as S0002 |
| S0004 | `S0004__seed_inventory_movement_types.sql` | `c374071314d410942a1d22410f5985f8a722d6abe1bf9e656dd73a8ed197a7e4` | Entry (1), Exit (2), Adjustment (3), Return (4) | Names are corrected if they differ |
| S0005 | `S0005__seed_configuration.sql` | `430c3a4b144d71ed846491d9dd4066f7b997d7e92fb57a505d91fc7980f805ff` | Ten business settings with their defaults (reservation minutes, deposit hours, shipping cost, VAT rate and others) | Inserts only missing keys and never overwrites a tuned value |

Tests: `Test_Seeds` compares every table with the expected rows and checks that Cancelled and Returned orders have no way out, that a dispatched order cannot be cancelled and that a payment under review cannot expire.

## 6. Verification evidence

| Check | Command | Result on 30 October 2026 |
|---|---|---|
| Apply from scratch | `npm run db:migrate` | 9 migrations and 5 seeds applied |
| Idempotent re-run | `npm run db:migrate` | "up to date", nothing applied |
| Drift check | `npm run db:verify` | Matches the repository |
| Constraint, trigger, schema and seed tests | `npm run sql:test` | 65 tests, 0 failures |
| File names and vendored files | `npm run sql:lint` | OK |

## 7. Template for a new entry

Copy this block under section 5, add the row to section 4 and update the checksum with the value the runner computes (LF-normalised SHA-256).

```markdown
### V00NN: Short title

| Field | Value |
|---|---|
| File | `db/migrations/V00NN__descriptor.sql` |
| SHA-256 | `<64 hexadecimal characters>` |
| Description | What changes and why, in two or three sentences |
| Objects created, altered or dropped | Exact object names |
| Key rules | Constraints, indexes and invariants introduced |
| Depends on | Migrations and objects required first |
| Data migration | None, or the backfill and how it is made safe |
| Online impact | Locks taken, expected duration, effect on running traffic |
| Compatibility | Whether the previous application version keeps working (expand and contract) |
| Rollback | Compensating change, restore point, or "additive, none needed" |
| Tests | tSQLt classes and cases that prove it |
| Related decisions | ADRs and decision-log lines |
| Author, reviewer, date | Names and dates; the reviewer is the approver of the pull request |
| Environments | Local, CI, staging, production, each Verified, Pending or Not deployed |
```

## 8. Review checklist

A reviewer approves a migration only when every item holds.

1. The file name matches `V####__snake_case.sql` and the number follows the last one on `main`.
2. The header comment explains the purpose; every non-obvious rule has a Spanish comment saying why.
3. Table and column names follow the glossary; keys are `ID<Entity>`; timestamps are `DATETIME2(3)` and end in `At`; money is `DECIMAL(18,2)`; no `FLOAT`, `REAL` or `MONEY`.
4. Constraints and indexes have explicit names with the `PK_ FK_ UQ_ UX_ CK_ DF_ IX_` prefixes.
5. A `UNIQUE` constraint is never placed on a nullable column that can hold several `NULL` values (use a filtered unique index).
6. The change is safe to run on a populated database: no long table scans under lock, backfills in batches, nullable first when adding a column to a large table.
7. The previous application version still works after the migration (expand and contract).
8. Each new constraint, index or trigger has a tSQLt case that proves it rejects the invalid input and accepts the valid one.
9. The register entry is complete and its checksum matches the file.
10. `npm run lint`, `npm run db:migrate`, `npm run db:verify` and `npm run sql:test` pass.

Programmable objects and seeds: a change to an `R####` object needs only the version bump in its header; it is added to this register only when it changes a contract (parameters or result shape) that the backend or the OpenAPI document depends on. Seeds are added when they load reference data that other migrations or tests rely on.

## 9. Revision history

| Date | Change | Author |
|---|---|---|
| 30 October 2026 | First issue: entries for V0001 to V0009 | Eder Yafeth Garcia Quiroa |
| 30 October 2026 | V0001 to V0009 set to Applied after pull request #18; reference seeds S0001 to S0005 added | Eder Yafeth Garcia Quiroa |
