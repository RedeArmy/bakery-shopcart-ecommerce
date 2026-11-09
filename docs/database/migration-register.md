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
| V0010 | `V0010__add_foreign_key_indexes.sql` | Foreign key support indexes | Schema, additive | Low | Applied |
| V0011 | `V0011__add_one_active_reservation_per_cart.sql` | One active reservation per cart | Schema, additive | Low | Applied |
| V0012 | `V0012__add_retention_indexes_and_category_foreign_key.sql` | Operation and retention indexes, category foreign key | Schema, additive | Low | Draft |
| V0013 | `V0013__add_guest_accounts.sql` | Guest accounts | Schema, additive | Medium | Draft |
| V0014 | `V0014__add_normalised_email_key.sql` | Normalised email key for the coupon limit | Schema, additive | Low | Draft |
| V0015 | `V0015__add_branches_and_pickup.sql` | Branches and pickup | Schema, additive | Medium | Draft |
| V0016 | `V0016__add_delivery_notes.sql` | Delivery notes | Schema, additive | Low | Draft |
| V0017 | `V0017__payment_methods_maintenance.sql` | Payment methods maintenance | Schema, additive | Medium | Draft |
| V0018 | `V0018__remove_guest_recovery.sql` | Remove the guest recovery | Schema, contract | Low | Draft |
| V0019 | `V0019__add_packaging_units.sql` | Packagings share one stock in units | Schema, additive | High | Draft |

Risk is the impact of a defect in the migration, not of running it: all nine run on an empty database, take no meaningful locks and move no data. **High** marks the migrations that protect money (V0007) or that can block legitimate writes if wrong (V0009).

## 5. Entries

Each entry uses the template in section 7. Common fields for V0001 to V0009 (V0010 carries its own):

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

### V0010: Foreign key support indexes

| Field | Value |
|---|---|
| File | `db/migrations/V0010__add_foreign_key_indexes.sql` |
| SHA-256 | `06f597c2f15578c9ad27d6d0a59c87bd77d3d68a208164e7ada69a1a828f35d2` |
| Description | Adds the indexes that back real queries on foreign key columns. A catalogue audit of V0001 to V0009 found 41 foreign keys with no index starting with their column; only seven back a query the system will run, and the rest point to tiny reference tables where an index would never be used. |
| Objects created | Indexes `IX_Payments_Order`, `IX_ProductImages_Product`, `IX_OrderLines_Variant`, `IX_ReservationLines_Variant`, `IX_Reservations_Cart`, `IX_InventoryMovements_Order` (filtered), `IX_FinancialMovements_Payment` (filtered) |
| Key rules | None: no constraint or data changes |
| Depends on | V0002, V0003, V0005, V0006, V0007 |
| Data migration | None |
| Online impact | Index builds on empty tables; on a populated database use `ONLINE = ON` where the edition allows it |
| Compatibility | Fully compatible: indexes do not change behaviour |
| Rollback | Additive. Compensating change: `DROP INDEX` of any of the seven |
| Tests | `Test_Schema` (the seven indexes exist) |
| Author, date | Eder Yafeth Garcia Quiroa, 30 October 2026 |
| Pull request | [#20](https://github.com/RedeArmy/bakery-shopcart-ecommerce/pull/20), squash-merged to `main` on 30 October 2026 |
| Reviewer | Repository owner. The ruleset requires no approving review while the project has a single maintainer; the approval is the merge with all required checks green |
| Environments | Local Verified (applied, `db:verify` clean, 66 tests passed); CI Verified (`sql-tests` job of pull request #20, green at merge); Production Not deployed |

### V0011: One active reservation per cart

| Field | Value |
|---|---|
| File | `db/migrations/V0011__add_one_active_reservation_per_cart.sql` |
| SHA-256 | `085283cb69fc0ca0342247b1d6ab1ec28bd7ce6fdba5e00f5a4b019be6c16c01` |
| Description | Adds the rule "a cart never holds stock twice" to the data. `SP_Inventory_ReserveStock` already serialises the requests of one cart with a lock; this index is the second line of defence if a future procedure forgets it. |
| Objects created | Filtered unique index `UX_Reservations_OneActivePerCart` on `Reservations (IDCart)` where `Status = 'Active' AND IDOrder IS NULL` |
| Key rules | A reservation linked to an order no longer counts: the cart is converted and the order keeps the stock |
| Depends on | V0006 |
| Data migration | None. On a populated database, a cart with two active reservations without an order would make the index fail: release the duplicates first |
| Online impact | Index build on a small table; use `ONLINE = ON` where the edition allows it |
| Compatibility | Fully compatible with `SP_Inventory_ReserveStock`, which releases the previous reservation before inserting |
| Rollback | Additive. Compensating change: `DROP INDEX UX_Reservations_OneActivePerCart` |
| Tests | `Test_Inventory` (the data refuse a second active reservation) and `npm run sql:concurrency` (20 simultaneous requests leave one) |
| Author, date | Eder Yafeth Garcia Quiroa, 30 October 2026 |
| Pull request | [#28](https://github.com/RedeArmy/bakery-shopcart-ecommerce/pull/28), squash-merged to `main` on 30 October 2026 |
| Reviewer | Repository owner. The ruleset requires no approving review while the project has a single maintainer; the approval is the merge with all required checks green |
| Environments | Local Verified (applied, `db:verify` clean, 101 tests passed, concurrency checks passed five times); CI Verified (`sql-tests` job of pull request #28: 213 tests passed and the concurrency checks held); Production Not deployed |

### V0012: Operation and retention indexes, category foreign key

| Field | Value |
|---|---|
| File | `db/migrations/V0012__add_retention_indexes_and_category_foreign_key.sql` |
| SHA-256 | `da63209a0fc57a29429cafd3f7327a90c45c26e706ea472b5d50e3ff0ec9148d` |
| Description | Seven indexes that back real queries and purges, the replacement of `IX_RefreshTokens_Family`, and the foreign key `OrderLines.IDCategory`. A review with 50,000 orders, 20,000 carts, 200,000 refresh tokens and 200,000 audit rows found queries that read whole tables for lack of an index. |
| Objects created | `IX_AuditLog_Entity (Module, EntityKey)`; filtered `IX_Reservations_ActiveExpiry (ExpiresAt)` where `Status = 'Active' AND IDOrder IS NULL`; `IX_Carts_LastActivity (LastActivityAt) INCLUDE (Status, IDUser)`; `IX_RefreshTokens_Family_Expiry (IDFamily, ExpiresAt)`; `IX_Users_CreatedAt (CreatedAt DESC, IDUser DESC)`; `IX_ReceivedWebhooks_ReceivedAt`; `IX_DdlHistory_CreatedAt`; constraint `FK_OrderLines_Categories` |
| Objects dropped | `IX_RefreshTokens_Family`: the new index starts with the same column, so no lookup by family is lost |
| Key rules | An order line can no longer carry a category that does not exist. Categories are deactivated, never deleted, so the key never gets in the way |
| Depends on | V0001, V0002, V0004, V0005, V0006, V0007, V0008 |
| Data migration | None. `WITH CHECK` validates the existing order lines: a line with an unknown category would make the migration fail, and none can exist because the category comes from the product at the moment of the sale |
| Online impact | Index builds on populated tables. On an edition that allows it use `ONLINE = ON`; the largest table (`AuditLog`) builds a narrow two-column index |
| Compatibility | Fully compatible with the previous application version: nothing was renamed and no column changed |
| Rollback | Additive. Compensating changes: `DROP INDEX` for each new index, `CREATE INDEX IX_RefreshTokens_Family ON dbo.RefreshTokens (IDFamily)` and `ALTER TABLE dbo.OrderLines DROP CONSTRAINT FK_OrderLines_Categories` |
| Tests | `Test_Retention` (the purge procedure that the token, webhook, DDL and cart indexes serve), `Test_Readers` and `Test_Dashboard` (the lists and reports that the audit, cart and user indexes serve) and the benchmark in `db/tests/performance` |
| Author, date | Eder Yafeth Garcia Quiroa, 30 October 2026 |
| Pull request | Pending |
| Reviewer | Repository owner |
| Environments | Local Verified (applied on an empty database and on one with 50,000 orders; `db:verify` clean; 533 tSQLt tests and the concurrency checks passed); CI Pending; Production Not deployed |

### V0013: Guest accounts

| Field | Value |
|---|---|
| File | `db/migrations/V0013__add_guest_accounts.sql` |
| SHA-256 | `e1de8a98fad204cb3dab8257e140add6d223b6a1e220a95d9ef1c6e78b7658a9` |
| Description | Lets a shopper buy without registering. A guest is a row of `Users` flagged `IsGuest`, with an invented email, no password and its own session, so the cart, reservation, order, payment and address keep hanging from an `IDUser` and every ownership rule (a customer only sees what is theirs) holds for guests as it does for customers |
| Objects created | Columns `Users.IsGuest` (default 0) and `Users.GuestRecoveryHash` (SHA-256 of the code a guest uses to recover an order); check `CK_Users_GuestIsCustomer`; unique filtered index `UX_Users_Email_Accounts (Email) WHERE IsGuest = 0`; filtered index `IX_Users_Email_Guests (Email) WHERE IsGuest = 1` |
| Objects dropped | `UQ_Users_Email`: the email stays unique among real accounts through the filtered index, but several guests may buy with the same email |
| Key rules | A guest can only be a customer. An email of a registered account cannot be taken by a guest (`EMAIL_BELONGS_TO_ACCOUNT`). Someone can register with the email they used as a guest. Guests never log in by email and never appear in the user list. Personalisation, made-to-order products (`LeadTimeDays > 0`) and coupons need a real account |
| Depends on | V0001, V0002, V0004 |
| Data migration | None: every existing user keeps `IsGuest = 0` |
| Online impact | Metadata change for the columns; the new indexes are built on `Users`, a small table |
| Compatibility | Existing calls keep working. `SP_Users_GetById` returns one more column (`IsGuest`) at the end |
| Rollback | Compensating migration: delete the guest rows once their orders are handled, drop the two indexes and the check, recreate `UQ_Users_Email` and drop the columns |
| Tests | `Test_Guests` and `Test_GuestOrders` (new), plus `Test_Constraints` and `Test_Auth` adjusted to the new index and column |
| Author, date | Eder Yafeth Garcia Quiroa, 6 November 2026 |
| Pull request | Pending |
| Reviewer | Repository owner |
| Environments | Local Pending; CI Pending; Production Not deployed |

### V0014: Normalised email key

| Field | Value |
|---|---|
| File | `db/migrations/V0014__add_normalised_email_key.sql` |
| SHA-256 | `0dcfbf699c5addc7830b771a6cfd2e4ab95d8da9d0caf47ec88396f392cfa943` |
| Description | A persisted computed column `Users.EmailKey` that gives the same value to the emails of one person: lower case, without the `+tag` of the local part and, for gmail.com and googlemail.com, without the dots and with the domain gmail.com. The coupon limit per customer counts the usages of every account with the same key, so opening another account with `ana+2@...` or `a.na@gmail.com` does not restart a limit of one use per customer. |
| Objects created | Computed persisted column `Users.EmailKey` (deterministic functions only); index `IX_Users_EmailKey (EmailKey)` |
| Key rules | The email stays unique among real accounts: a person may register their aliases, but a coupon counts them as one. Dots count in every other domain (`a.b@x.com` and `ab@x.com` can be different people). A leading `+` is not a tag. Guest placeholder emails are unique, so they never share a key |
| Depends on | V0001, V0013 |
| Data migration | None: the column is computed from the existing emails |
| Online impact | A persisted computed column on `Users` is materialised once and the index is built on a small table |
| Compatibility | Existing calls keep working. `FU_Coupons_Status` and `SP_Orders_CreateOrder` use the key |
| Rollback | Compensating migration: drop the index and the column; the coupon limit would return to counting by account |
| Tests | `Test_EmailKey` (new: the normalisation rules and the coupon limit across aliases, also through the order flow) and the concurrency scenario "10 accounts of the same person compete for a coupon of one use per customer" |
| Author, date | Eder Yafeth Garcia Quiroa, 6 November 2026 |
| Pull request | Pending |
| Reviewer | Repository owner |
| Environments | Local Verified (applied, 577 tSQLt tests and the concurrency checks passed); CI Pending; Production Not deployed |

### V0015: Branches and pickup

| Field | Value |
|---|---|
| File | `db/migrations/V0015__add_branches_and_pickup.sql` |
| SHA-256 | `0dfc4cfb2fbbf751fcd394aac6859ecc4848422c206dbe8a79aa9ebaf4e612e1` |
| Description | The table `Branches` (name, address, phone, opening hours, active flag) and the fields of an order that is picked up in a branch instead of delivered: `Orders.FulfilmentType` (`Delivery` or `Pickup`), `IDBranch` and a frozen copy of the branch name and address. The five delivery address columns of `Orders` become nullable, because a pickup has no address. |
| Objects created | Table `Branches`; unique index `UX_Branches_Name_Active (Name) WHERE IsActive = 1`; columns `Orders.FulfilmentType`, `IDBranch`, `PickupBranchName`, `PickupBranchAddress`; constraint `CK_Orders_Fulfilment`; index `IX_Orders_Branch` |
| Key rules | An order is either a delivery with its complete address and no branch, or a pickup with its branch and no address, never a mix (`CK_Orders_Fulfilment`). A branch is never deleted: "removing" it deactivates it, and a branch with orders still waiting (pending payment, paid, in preparation or dispatched) cannot be deactivated. A deactivated branch frees its name |
| Depends on | V0005 |
| Data migration | None: every existing order keeps its address and takes the default `FulfilmentType = 'Delivery'` |
| Online impact | Relaxing five columns to NULL and adding a constrained column with a default on `Orders` rewrites little data on the current volume; the new constraint is checked against the existing rows |
| Compatibility | Existing calls keep working: `SP_Orders_CreateOrder` defaults to a delivery and still accepts an address and a date |
| Rollback | Compensating migration: only possible while no pickup order exists (restore the NOT NULL columns, drop the constraint, the columns and `Branches`) |
| Tests | `Test_Branches` and `Test_PickupOrders` (the maintenance rules, the estimated date, the pickup order and its frozen copy, the constraint) and an HTTP flow |
| Author, date | Eder Yafeth Garcia Quiroa, 7 November 2026 |
| Pull request | Pending |
| Reviewer | Repository owner |

### V0016: Delivery notes

| Field | Value |
|---|---|
| File | `db/migrations/V0016__add_delivery_notes.sql` |
| SHA-256 | `983adc35c64a324573d48cbaa925eb36187d672320d8eea3e092d8c66b4439b0` |
| Description | The optional column `Orders.DeliveryNotes` (up to 300 characters): the customer's instructions for whoever delivers the order. |
| Objects created | Column `Orders.DeliveryNotes NVARCHAR(300) NULL` |
| Key rules | The notes are trimmed and an empty text is stored as NULL. They apply to a delivery only: a pickup order refuses them (50400) |
| Depends on | V0015 |
| Data migration | None: every existing order has no notes |
| Online impact | Adding a nullable column is a metadata change |
| Compatibility | `SP_Orders_CreateOrder` takes a new optional parameter and `SP_Orders_GetDetail` returns one more column; existing calls keep working |
| Rollback | Compensating migration: drop the column (the notes are lost) |
| Tests | `Test_PickupOrders` (the trimmed notes of a delivery and the refusal on a pickup) |
| Author, date | Eder Yafeth Garcia Quiroa, 7 November 2026 |
| Pull request | Pending |
| Reviewer | Repository owner |

### V0017: Payment methods maintenance

| Field | Value |
|---|---|
| File | `db/migrations/V0017__payment_methods_maintenance.sql` |
| SHA-256 | `4f5f7ff3dd1d3d903e6bec1fc290f25e61b039c14866f2ef2b7301b0674de5b4` |
| Description | The payment methods become data an administrator maintains: each one has a kind (`Card`, `Deposit` or `Cash`), the title and description the customer reads, an active flag and whether it is offered for a delivery, a pickup or both. The bank account of a deposit becomes optional: the accounts are shown as information and the deposit does not record which one was used. |
| Objects created | Columns `PaymentMethods.Kind`, `Title`, `Description`, `AppliesToDelivery`, `AppliesToPickup`, `IsActive`, `UpdatedAt`; constraints `CK_PaymentMethods_Kind`, `CK_PaymentMethods_Applies`, `CK_PaymentMethods_CashPickupOnly`; `PaymentDeposits.IDBankAccount` allows NULL |
| Key rules | Cash is collected in the branch, so it is offered for pickups only (`CK_PaymentMethods_CashPickupOnly`). A method is never deleted: "removing" it deactivates it, and the payments already made keep following their course. The reference of a current deposit stays unique because in a unique index the NULL accounts count as equal |
| Depends on | V0007 |
| Data migration | None in the migration: the seed `S0007` sets the kind and the texts of the two existing methods and adds the cash method |
| Online impact | Adding columns with defaults and relaxing a column to NULL on small tables |
| Compatibility | `SP_Orders_CreateOrder` reads the kind, the active flag and the places from `PaymentMethods` and no longer requires a bank account; the deposit procedures recognise a deposit by its kind and not by the identifier 2. Existing calls keep working |
| Rollback | Compensating migration: only possible while no deposit without an account and no cash payment exists |
| Tests | `Test_PaymentMethods` (maintenance, cash for pickups only, the cash order and its confirmation, a deposit with no account) and an HTTP flow |
| Author, date | Eder Yafeth Garcia Quiroa, 7 November 2026 |
| Pull request | Pending |
| Reviewer | Repository owner |
| Environments | Local Verified (applied, tSQLt and the HTTP flows passed); CI Pending; Production Not deployed |

### V0018: Remove the guest recovery

| Field | Value |
|---|---|
| File | `db/migrations/V0018__remove_guest_recovery.sql` |
| SHA-256 | `5535d8b5ca1f87bc480c70d1b29198d5c9e489b34cc66d87f6dfdc0fa6014ea3` |
| Description | Retires the recovery of a guest's orders with an email and a code. The checkout no longer issues the code and anyone, with or without an account, follows an order with its number and email (`SP_Orders_Track`), so nobody is left to use it. |
| Objects removed | Procedures `SP_Users_SetRecoveryCode` and `SP_Users_FindGuestsByEmail`; column `Users.GuestRecoveryHash` |
| Key rules | Orders, guest accounts and their emails do not change. The dropped hashes were of codes nobody can present any more |
| Depends on | V0013 |
| Data migration | None: the column only held hashes of recovery codes |
| Online impact | Dropping a nullable column of `Users` and two procedures; no application code reads them after this change |
| Compatibility | `POST /auth/guest/recovery-code` and `POST /auth/guest/recover` are removed from the contract in the same pull request, which is the only caller |
| Rollback | Compensating migration that adds the column and the procedures again; the dropped hashes cannot be recovered, and the codes they came from were shown once and never stored |
| Tests | `Test_Guests` checks that the procedures and the column no longer exist; the HTTP flow of the guest no longer issues a code |
| Author, date | Eder Yafeth Garcia Quiroa, 8 November 2026 |
| Pull request | Pending |
| Reviewer | Repository owner |

### V0019: Packagings share one stock in units

| Field | Value |
|---|---|
| File | `db/migrations/V0019__add_packaging_units.sql` |
| SHA-256 | `224d48bfbee08acf5c83ac34fcfcb073a1dc957696dbf20b0aa200f0a45e3272` |
| Description | The variants of a product can draw from one stock measured in units. `UnitsPerPack` is how many units a pack holds and `IDStockVariant` is the variant that holds the stock this one draws from (NULL: it holds its own). `IDStockHolder` is the persisted, indexed `COALESCE(IDStockVariant, IDVariant)` that every stock procedure joins ([ADR-0031](../adr/0031-packagings-share-one-stock-measured-in-units.md)). |
| Objects changed | Table `Variants` (three columns, five constraints, two indexes); procedures `SP_Inventory_ReserveStock`, `SP_Inventory_ReleaseCartReservation`, `SP_Inventory_ReleaseExpiredReservations`, `SP_Inventory_RegisterEntry`, `SP_Inventory_AdjustStock`, `SP_Inventory_GetLedger`, `SP_Products_Get`, `SP_Products_Search`, `SP_Variants_Create`, `SP_Cart_Get`, `SP_Orders_CancelPending`, `SP_Orders_Cancel`, `SP_Returns_Register`, `SP_Payments_ConfirmPayment`; function `FU_Cart_AvailableStock`; views `VW_Inventory_Availability` and `VW_Inventory_Reconciliation` |
| Key rules | Quantities of carts, reservations and orders are packs; the stock, the ledger and the reservations of a holder are units. A variant that draws from another holds no stock or reservation of its own. Packs are the free units divided by `UnitsPerPack`, rounded down. Locks are taken on the holder rows in ascending order |
| Depends on | V0002, V0003, V0011 |
| Data migration | None: every existing variant gets `UnitsPerPack = 1` and no `IDStockVariant`, so it behaves exactly as before |
| Online impact | Adding a column with a default to `Variants` is a metadata change on SQL Server 2022; the computed column is persisted, so it is written once per row. The table is small and the index builds in a moment |
| Compatibility | Additive for the contract: new fields in the variant and two optional fields in the creation request. `available` of a variant that shares stock is now packs, which for a variant of one unit is the same number as before |
| Rollback | Compensating migration that drops the constraints, the indexes and the columns after moving every shared stock back to its own variants; not written, because rolling back after a packaging was sold needs a business decision on the units |
| Tests | `Test_Packaging` (24 tests: pool sharing, 54 and 50 units, mixed packs in a cart, released and expired reservations, a paid order, a cancellation, a return, the reconciliation view); the rest of the suite passes unchanged; the real-concurrency suite and an HTTP flow |
| Author, date | Eder Yafeth Garcia Quiroa, 9 November 2026 |
| Pull request | Pending |
| Reviewer | Repository owner |

### Reference seeds

Seeds are idempotent `MERGE` scripts applied after the migrations. They are registered because the code, the API and the tests assume exactly these values. The common fields are the same as above, except the pull request, which is the one that adds them (see the revision history), and the rollback, which is to correct the seed and let the runner apply the new version.

| ID | File | SHA-256 | Content | Re-run behaviour |
|---|---|---|---|---|
| S0001 | `S0001__seed_roles.sql` | `d5bd6005e962e2cce6652f2412bfa0acc44cc2204570f3bdd3cdd2f27b0d8914` | Roles Customer (1), Operator (2), Administrator (3) | Names are corrected if they differ |
| S0002 | `S0002__seed_order_statuses.sql` | `c3e638c14df8863a9e600097af4f56aa9c2afa29c979e51c316746b7d5c5048a` | Eight order states and the twelve allowed transitions | Transitions are made equal to the declared set (a removed transition is deleted) |
| S0003 | `S0003__seed_payment_reference_data.sql` | `de3d5b7c00c36e11c0dafe6cab47b93aafa44840679566143b889285cb962148` | Payment methods `CARD` and `BANK_DEPOSIT`, eight payment states and nine transitions | Same as S0002 |
| S0004 | `S0004__seed_inventory_movement_types.sql` | `c374071314d410942a1d22410f5985f8a722d6abe1bf9e656dd73a8ed197a7e4` | Entry (1), Exit (2), Adjustment (3), Return (4) | Names are corrected if they differ |
| S0005 | `S0005__seed_configuration.sql` | `430c3a4b144d71ed846491d9dd4066f7b997d7e92fb57a505d91fc7980f805ff` | Ten business settings with their defaults (reservation minutes, deposit hours, shipping cost, VAT rate and others) | Inserts only missing keys and never overwrites a tuned value |
| S0006 | `S0006__seed_retention_configuration.sql` | `4381bd06a18054df61f5f34f6054289dcb4370800b67e36e4a055cdace7c39df` | Five retention settings: refresh token families 30 days, webhooks 90, guest carts 30, released or expired reservations 90 and DDL history 365 | Inserts only missing keys and never overwrites a value an administrator changed |
| S0007 | `S0007__seed_payment_methods.sql` | `ddfa86ed8c8dd9c2f659a3b8d535fdac7c8ceb20a798fb386c23df34be476440` | The kind and the texts of the card and the deposit, and the cash method for pickups | Only fills what is missing and never overwrites a text or a setting an administrator changed |

Tests: `Test_Seeds` compares every table with the expected rows and checks that Cancelled and Returned orders have no way out, that a dispatched order cannot be cancelled and that a payment under review cannot expire.

## 6. Verification evidence

| Check | Command | Result on 30 October 2026 |
|---|---|---|
| Apply from scratch | `npm run db:migrate` | 11 migrations, 5 seeds and 32 programmable objects applied |
| Idempotent re-run | `npm run db:migrate` | "up to date", nothing applied |
| Drift check | `npm run db:verify` | Matches the repository |
| Constraint, trigger, schema and seed tests | `npm run sql:test` | 213 tests, 0 failures (66 before the Stage 3 objects) |
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
| 30 October 2026 | V0010 added after the technical audit | Eder Yafeth Garcia Quiroa |
| 30 October 2026 | V0011 added with the stock reservation; V0010 and V0011 set to Applied after pull requests #20 and #28 | Eder Yafeth Garcia Quiroa |
| 30 October 2026 | V0012 and S0006 added with the database review: operation and retention indexes, the category foreign key and the retention settings | Eder Yafeth Garcia Quiroa |
| 6 November 2026 | V0013 added: guest accounts | Eder Yafeth Garcia Quiroa |
| 6 November 2026 | V0014 added: normalised email key for the coupon limit | Eder Yafeth Garcia Quiroa |
| 7 November 2026 | V0015 added: branches and pickup | Eder Yafeth Garcia Quiroa |
| 7 November 2026 | V0016 added: delivery notes | Eder Yafeth Garcia Quiroa |
| 7 November 2026 | V0017 and S0007 added: payment methods maintenance | Eder Yafeth Garcia Quiroa |
| 8 November 2026 | V0018 added: the guest recovery is removed | Eder Yafeth Garcia Quiroa |
| 9 November 2026 | V0019 added: packagings share one stock measured in units | Eder Yafeth Garcia Quiroa |
