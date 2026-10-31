# Acceptance criteria map

The brief lists 21 acceptance criteria in RF-01 to RF-09 and says they will be verified in the evaluation. This page takes each one and says **where the system enforces it** and **which test proves it**, so that a reviewer can run the proof instead of reading the code.

How to read the evidence column:

- **tSQLt** is a test of the database (`db/tests/tsqlt/`, class and test name). Run with `npm run sql:test:up` and `npm run sql:test`.
- **Concurrency** is a scenario of `npm run sql:concurrency`: real connections racing against SQL Server.
- **Backend** is a unit or HTTP integration test (`backend/tests/`). `npm test` runs the unit ones; the integration ones need the test server (see [SQL testing](sql-testing-tsqlt.md)).
- **Postman** is a request of the [verification collection](../api/postman/README.md), with the folder number.

Everything below is verified in Phase 1 (database and backend). What needs a screen is listed at the end and belongs to Phase 2.

## RF-01 · Authentication and access control

| Criterion | Enforced in | Evidence |
|---|---|---|
| Changing the id of an order, cart or address in the URL or the body never exposes or changes another customer's data | Every procedure that reads or writes customer data receives the actor and filters by owner in the same query, so a foreign resource answers 404 (`@IDActor`, `@AsStaff`) | **tSQLt** `Test_Readers` (another customer reading the order is told it does not exist; a customer cannot widen the list by passing the staff flag; another customer cannot read the payments of an order; another customer opening the proof is told it does not exist), `Test_Addresses` (editing another customer's address answers not found and changes nothing), `Test_Cart` (one customer cannot remove a line from another customer's cart), `Test_Lifecycle` (another customer cannot cancel the order), `Test_Inventory`, `Test_Orders`, `Test_Coupons` (a coupon never touches another customer's cart). **Backend** integration: keeps every order, payment and proof away from another customer. **Postman** folder 7 |
| An expired token answers 401; a resource the role may not use answers 403 | `platform/security` verifies the JWT and `requireRole` checks the role, before any controller runs | **Backend** `security.test.ts` (rejects an expired token, a tampered token and garbage; answers 401 without a token and with an invalid one; answers 403 when the role is not enough), integration (refuses a missing token and a wrong role). **tSQLt** `Test_Auth` (an expired token is reported as expired and not rotated). **Postman** 1 and 2 |

Also covered, because RF-01 states them as rules: passwords are hashed with argon2id (`security.test.ts`), access tokens last 15 minutes and refresh tokens rotate with reuse detection (`auth.test.ts`: rotates the refresh token; answers 401 `REFRESH_TOKEN_REUSED`; **Postman** 9), accounts are deactivated and never deleted (`Test_Auth`: deactivating an account revokes its sessions and leaves an audit entry), and a locked account is refused (`Test_Auth`, `auth.test.ts`).

## RF-02 · Product catalogue

| Criterion | Enforced in | Evidence |
|---|---|---|
| A price change does not alter orders already placed | `OrderLines` keeps its own copy of SKU, name and price, and a trigger refuses to edit it | **tSQLt** `Test_Orders` (the order lines freeze the sku name and price that were sold), `Test_Triggers` (the price of an order line cannot change; the amounts of an order cannot change), `Test_Catalogue` (changing a price keeps both prices as text in the audit log) |

Also covered: a product with sales is deactivated and hidden from the store, never deleted (`Test_Catalogue`: deactivating a product also deactivates its variants; an inactive product answers not found to the public), search with text, category, price range, availability, sorting and paging on the server (`Test_Catalogue`), and the SKU is unique whatever its case.

## RF-03 · Inventory

| Criterion | Enforced in | Evidence |
|---|---|---|
| The current stock equals the sum of the ledger movements | Every change of stock writes a movement with the resulting balance in the same transaction; `VW_Inventory_Reconciliation` compares both and a daily job audits any difference | **tSQLt** `Test_Ledger` (the reconciliation is empty after entries adjustments and a reservation; the reconciliation reports stock changed without a movement), `Test_Lifecycle` (the reconciliation is empty after paying, returning, cancelling and refunding). **Concurrency** `ledgerEntries`. **Postman** 3 |
| A manual adjustment needs a reason and cannot leave the stock negative | `SP_Inventory_AdjustStock` and `CK_Variants_OnHandStock` | **tSQLt** `Test_Ledger` (an adjustment needs a reason and a count of zero or more; the stock cannot be set below the reserved units), `Test_Constraints` (on-hand stock cannot be negative). **Postman** 3 (a stock adjustment needs a reason) |

The ledger is append-only: a trigger refuses to update or delete it (`Test_Triggers`).

## RF-04 · Cart

| Criterion | Enforced in | Evidence |
|---|---|---|
| More than the available stock cannot be added | `SP_Cart_SetItemQuantity` compares with the stock not held by others, counting the cart's own reservation; the merge of a guest cart clamps the same way | **tSQLt** `Test_Cart` (a quantity above the available stock is rejected; exactly the available stock is accepted; units reserved by another customer are not available; merging adds the quantities only up to the stock). **Backend** integration (refuses to put more units in the cart than the stock available). **Postman** 4 |
| The cart total has no rounding errors | Money is `DECIMAL(18,2)` in tables and `BIGINT` cents in every calculation, rounded half to even once in SQL; amounts reach the API as decimal strings | **tSQLt** `Test_Coupons` (ten quetzales over three equal lines give 3.34 3.33 and 3.33; the line discounts always add up to the total discount for every percentage), `Test_Money`. **Postman** 4 (exact decimal strings) |

## RF-05 · Coupons

| Criterion | Enforced in | Evidence |
|---|---|---|
| An expired, exhausted or below-minimum coupon is refused with a specific message | `FU_Coupons_Status` and `FU_Coupons_Rejection` give each reason its own error number and API code | **tSQLt** `Test_Coupons` (a coupon below its minimum is refused with the api code; an expired coupon is refused with the api code; an exhausted coupon answers a conflict; every rejection reason maps to its error number and a message with the api code). **Postman** 5 (`COUPON_MINIMUM_NOT_MET`, `COUPON_EXPIRED`) |
| The total use limit holds when several customers use the coupon at once | A conditional `UPDATE` of the counter inside the order transaction, with `CK_Coupons_UsageVsLimit` behind it | **Concurrency** `lastCouponUse`. **tSQLt** `Test_Orders` (a coupon that sold out after being applied stops the order with a conflict; a coupon with a single use keeps its own discount) |
| A discount never takes the order total below zero | The discount is capped to the eligible amount and `CK_Orders_Total` rejects a negative total | **tSQLt** `Test_Coupons` (a fixed amount never discounts more than the eligible total), `Test_Orders` (an order whose total would be zero is refused), `Test_Constraints` (an order total must match subtotal minus discount plus shipping) |

Also covered: one coupon per order, percentage or fixed amount, validity dates, minimum, total and per-customer limits, and a category restriction (`Test_Coupons`).

## RF-06 · Checkout and payment

| Criterion | Enforced in | Evidence |
|---|---|---|
| If two customers try to buy the last unit, only one succeeds and the other gets a clear message; there is never overselling | `SP_Inventory_ReserveStock` is one conditional `UPDATE` that either holds every unit or none, and `CK_Variants_ReservedVsOnHand` is the second line of defence | **Concurrency** `race` with one unit and with ten, `allOrNothing`, `crossingCarts`. **tSQLt** `Test_Inventory` (the last available units can be reserved; asking for more than the stock raises a conflict), `Test_Constraints` (reserved stock cannot exceed on-hand stock). **Postman** 4 and 6 |
| Repeating the same payment request creates neither two orders nor two charges | `Idempotency-Key` at two levels: a middleware over `SP_Idempotency_*`, and unique indexes on the payment | **Concurrency** `idempotencyRace`, `orderDoubleClick`. **tSQLt** `Test_Orders` (repeating the creation with the same key returns the same order and creates no second one; another key for a reservation that already has an order is a conflict). **Backend** integration (creates the order once even when the confirmation is repeated, and refuses the same key with another body). **Postman** 6 |
| Creating the order is atomic: order, lines, stock and coupon use are saved together or not at all | `SP_Orders_CreateOrder` runs in one transaction with `XACT_ABORT`; the reservation is the stock movement of that transaction | **Concurrency** `lastCouponUse` (the refused orders leave nothing behind: one order exists, the coupon counts exactly one use, one coupon usage is recorded and the stock of the refused orders stays reserved, untouched), `orderDoubleClick` (only one order and one payment exist and the units stay reserved once). **tSQLt** `Test_Orders` (a reservation past its expiry stops the order with the api code; the reservation moves to the order and the cart is converted without touching the stock; creating the order leaves the status histories and an audit entry). **Backend** integration (keeps the money and the stock reconciled after all the flows) |

The reservation lasts 15 minutes (`Configuration.ReservationMinutes`), checked in **Postman** 6 and `Test_Inventory` (reserving a cart holds its units and sets the expiry from the configured window).

One interpretation to defend: the stock is held by the reservation when the order is created, in the same transaction, and the exit movement is written in the ledger when the payment is approved (ADR-0007, ADR-0014). An abandoned order therefore leaves no noise in the ledger, and no unit is ever counted twice.

## RF-07 · Orders and returns

| Criterion | Enforced in | Evidence |
|---|---|---|
| A forbidden state transition is refused in the backend and in the database | The allowed transitions are rows of `OrderStatusTransitions`; a trigger checks them on every update and the procedures check them first | **tSQLt** `Test_Triggers` (a forbidden order transition is rejected), `Test_Lifecycle` (an order cannot skip a step; a customer cannot change the status of an order), `Test_Seeds` (cancelled and returned orders have no way out). **Postman** 8 (`INVALID_STATE_TRANSITION`) |
| Cancelling or returning puts the stock back through ledger movements and shows in the reports | `SP_Orders_Cancel` and `SP_Returns_Register` write the movement and a refund in one transaction | **tSQLt** `Test_Lifecycle` (cancelling a paid order restores the stock through the ledger; a partial return refunds the proportional amount and restores the stock), `Test_Dashboard` (returned units are subtracted from the sale). **Backend** integration (takes the order through preparation, dispatch and delivery, then returns one unit and refunds it) |
| An expired reservation releases the stock without manual action | The `expirePayments` job runs every 60 seconds; each pass cancels the orders whose payment elapsed and returns the units | **tSQLt** `Test_Jobs` (the expiry job cancels the order whose payment elapsed and releases the cart reservation without an order), `Test_Inventory` (the expiry releases only expired reservations that have no order). **Concurrency** `expireRace`, `jobLock`. **Backend** integration (expires an unpaid order with the job runner against the database) |
| No more can be returned than was sold on each line | `CK_OrderLines_ReturnedQuantity` and the pending quantity checked inside the procedure | **tSQLt** `Test_Constraints` (a line cannot return more than it sold), `Test_Lifecycle` (returning more units than were sold is refused and changes nothing). **Concurrency** `returnRace` |
| Every state change records user, date and time, previous state and new state | `OrderStatusHistory` (append-only, written in the same transaction) and the audit log | **tSQLt** `Test_Orders` (creating the order leaves the status histories and an audit entry), `Test_Lifecycle` (an operator moves a paid order through preparation, dispatch and delivery with its history), `Test_Triggers` (the order status history cannot be updated). **Postman** 8 (the history keeps the previous state; the audit log says who changed the status) |

Several partial returns per order are allowed, as the evaluator confirmed: `Test_Lifecycle` (a second partial return keeps the order partially returned; returning the rest completes the order). The history that a customer sees shows the states and the times; the user who made each change is in the audit log, which administrators read.

## RF-08 · Dashboard and reports

| Criterion | Enforced in | Evidence |
|---|---|---|
| Lists use server-side paging and filters | Every list procedure pages with `OFFSET`/`FETCH` and returns the total | **tSQLt** `Test_Readers` (the order list is paged and reports the total; staff lists every order and can filter by status and search by number or email), `Test_Catalogue`, `Test_Ledger`. Cost with 50,000 orders: `npm run sql:bench`, see [performance](../operations/performance.md) |
| Reports count only completed orders, exclude cancelled ones and subtract returns | `VW_Dashboard_SoldOrders` and `VW_Dashboard_SoldLines` (ADR-0009): paid, not cancelled, by payment date in Guatemala time, net of returns | **tSQLt** `Test_Dashboard` (only paid orders that are not cancelled count as a sale; returned units are subtracted from the sale; the sales by category are net of returns, ordered by amount, and add up to the net sale; the day is the Guatemala day and not the UTC day). **Backend** integration (serves the dashboard consistent across its reports) |

The requested reports exist: sales by day, week and month with quetzales and orders (`Test_Dashboard`: the daily series, the weekly series starts on Monday, the monthly series), sales by category, the 10 best sellers of a period (the best sellers rank by units then by amount and respect the limit) and the order list. The charts are Phase 2.

## RF-09 · Audit log

| Criterion | Enforced in | Evidence |
|---|---|---|
| The log cannot be modified or deleted | `INSTEAD OF UPDATE, DELETE` trigger; the application login has no write permission on tables | **tSQLt** `Test_Triggers` (the audit log cannot be updated; the audit log cannot be deleted from). The API has no endpoint that writes it |

Also covered: user, date and time, entity, action, previous value and new value on every entry (`Test_Audit`), administrators read it filtered by module (`Test_Readers`: the audit query filters by module and pages the newest first; **Postman** 8), and every create, change or deactivation of products, prices, stock, coupons and order states writes an entry in the same transaction as the change.

## Technical and non-functional requirements

| Requirement of the brief | Evidence |
|---|---|
| Database: normalised, keys, `UNIQUE`, `NOT NULL`, `CHECK`; `DECIMAL` for money, no `FLOAT` or `REAL` | [Migrations V0001 to V0012](../database/migration-register.md); `Test_Schema` (no column uses a floating point or money type; every decimal column is `DECIMAL(18,2)`), `Test_Constraints` |
| Versioned, numbered scripts that create the database, its objects and the seed data reproducibly | `db/migrations` (V), `db/objects` (R), `db/seed` (S) and the runner with checksums and drift detection (`npm run db:migrate`, `npm run db:verify`) |
| All data access through stored procedures | The application login has `EXECUTE` and is denied `SELECT`, `INSERT`, `UPDATE` and `DELETE`; only `infrastructure/` reaches `execute-procedure.ts` (`npm run arch:check`) |
| Express with TypeScript `strict`, layers, validation, centralised errors, `.env.example` | `backend/` ([architecture](../architecture/03-backend-lld.md)); zod at every boundary; one error shape; `npm run typecheck` |
| No SQL injection: typed parameters, no concatenation, `sp_executesql` with parameters for dynamic SQL | Typed `ProcedureParam` on every call; `sql:lint`; the only dynamic SQL is in the runner and uses `QUOTENAME` and parameters |
| Performance: lists and reports under one second with the seed data | `npm run sql:bench` at ten times the seed volume, [performance](../operations/performance.md) |
| Security: no credentials in the repository, CORS, security headers, hashed passwords | gitleaks in CI; Helmet and strict CORS in `platform/http`; argon2id; test passwords generated into the local `.env` |
| Integrity: nothing left half done, critical rules also protected in the database | One transaction per procedure with `XACT_ABORT`; triggers and `CHECK` constraints (`Test_Triggers`, `Test_Constraints`) |
| Concurrency: checkout, coupons and stock without overselling | `npm run sql:concurrency` (16 scenarios) |
| Portability: runs on a clean machine following only the README | `npm run up` from empty volumes; CI builds the three images and validates the compose file |

## What belongs to Phase 2

The frontend requirements of the brief are not started: protected routes and menus by role, forms with validation, tables with server-side paging, charts in the dashboard, loading, empty and error states in every view, transparent renewal of the token, and a responsive interface. The backend already offers everything they need (73 operations in [OpenAPI](../api/openapi/openapi.yaml)).
