# Database performance

The brief asks that the main lists and reports answer in under one second with the seed data. This page records what was measured, what was changed because of it, what was tried and rejected, and how to repeat the measurement.

## Method

`npm run sql:bench` creates a separate database, `ShopCart_Bench`, migrates it with the runner and loads volume with `db/tests/performance/bench-seed.sql`. It then runs each list and report twice (the first run compiles), counts the **logical reads** of the second one with `SET STATISTICS IO` and checks them against a limit. Reads are the stable number: they do not depend on the machine. Time is checked too, against the one second of the brief.

| Table | Rows loaded |
|---|---|
| Orders / OrderLines | 50,000 / 75,000 (88 % delivered, 7 % pending payment, 5 % cancelled, over one year) |
| Carts / CartItems | 20,300 guest carts, 20,300 lines |
| RefreshTokens | 200,000 in 8,000 families |
| AuditLog | 200,000 |
| InventoryMovements | 60,000 for one variant |
| Payments (approved deposits) | 20,000 |
| Users | 3,000 customers |

The volume is ten times the one the seed data of the delivery will have (about 5,000 orders), on purpose: a defect that is invisible at 5,000 rows shows at 50,000.

## What was found and fixed

Measured on 30 October 2026, SQL Server 2022 in Docker on a developer laptop. "Before" is the code of `main` at commit `4832e8f`.

| Operation | Before | After |
|---|---|---|
| `SP_Orders_List`, a customer's own orders | 375 reads when a customer built the cached plan, **231,226** when the staff did; 11 ms or **164 ms** | 486 reads, about 1.3 ms |
| `SP_Orders_List`, staff, first page | 135,519 to **483,437** reads; 252 ms | 767 reads, about 18 to 32 ms |
| `SP_Dashboard_AbandonedCarts` | **162,724** reads | 529 reads |
| `SP_Dashboard_Summary` | 42,814 reads | 264 reads |
| `SP_Audit_Query`, history of one order | 2,770 reads; 134 ms | 30 reads; 12 ms |
| `SP_Audit_Query`, no filters, 200,000 rows | **3,268 ms** (over the one second of the brief) | 38 ms |
| `SP_Inventory_GetLedger`, a variant with 60,000 movements | 713 ms | 29 ms |
| `SP_Payments_ListPendingDeposits`, history of 20,000 approved deposits | 281 ms | 26 ms |
| `SP_Users_List`, 3,000 accounts | 6,393 reads; 15.4 ms | 100 reads; 8.7 ms |

The causes, in order of impact:

1. **`COUNT(*) OVER ()` is a spool.** Seven paged lists computed the total with it. Without a partition and an order, SQL Server writes every row to a worktable in `tempdb` and reads it back: 100,778 logical reads in a `Worktable` against 1,288 in the table itself. The total is now a separate `COUNT(*)` and the page is built from the identifiers, so the joins and subqueries run only for the 20 rows shown.
2. **One cached plan for two audiences.** `WHERE (@AsStaff = 1 OR o.IDUser = @IDActor)` makes the first caller decide the plan for everybody. If the staff came first, every customer scanned the whole table to find their orders; if a customer came first, the staff searched for a customer that did not exist. `SP_Orders_List` now has a path per audience: the customer's has a stable plan on `IX_Orders_User` and pays no compilation; the staff's uses `RECOMPILE` and, because a `CHARINDEX(@Search, ...)` predicate is not folded even when `@Search` is null, a separate branch for the usual case of no search text. A text search forces `HASH JOIN` because it always has to scan.
3. **A non-sargable predicate and a lookup per cart.** The abandoned carts were selected with `DATEADD(HOUR, hours, LastActivityAt) <= @Now`, which cannot use an index, and valued with a `CROSS APPLY` that searched `CartItems` and `Variants` once per cart. The threshold is now a value (`FU_Carts_AbandonmentCutoff`) compared with `LastActivityAt` through `IX_Carts_LastActivity`, and the value is a set aggregation. The summary only counts them, so it no longer values them.
4. **Missing indexes** (V0012): the audit log by entity, the reservations that can expire, carts by last activity, token families by expiry, accounts by creation date, webhooks and DDL history by date. `ReturnLines` is looked up by `IDOrderLine` in the sold-lines view while its key starts with `IDReturn`; the benchmark has no returns, so it was not measured and no index was added without evidence.

## What was tried and rejected

A change that cannot be shown to help is not shipped.

| Change | Result | Decision |
|---|---|---|
| Same rewrite on `SP_Products_Search` | Reads fell from 10,852 to 358, but time rose from 49 to 54 ms (and from 26 to 42 ms with filters): the total needs the products and variants aggregated twice, and `RECOMPILE` adds compilation | Left as it was |
| Same rewrite on `SP_Coupons_List` | Tiny table, no gain | Left as it was |
| `RECOMPILE` on `SP_Payments_ListPendingDeposits` | The queue under review, the operators' frequent query, went from 25 to 70 ms because compiling eight tables costs more than running the query | Removed; the history still went from 281 to 26 ms |
| Constant UTC offset instead of `AT TIME ZONE` per row in `FU_Dashboard_SalesByPeriod` | In isolation 403 ms became 19 ms, but inside the function the plan got worse: 2,208 ms of CPU | Reverted |

## Known limits

- **`SP_Dashboard_SalesByPeriod` is linear in the paid orders.** It converts the time zone of each order (`AT TIME ZONE`, about 9 microseconds per row): 0.65 to 1.2 seconds with 44,000 paid orders in a year, about 70 ms with the 5,000 of the seed data. It stays under the second of the brief up to about 60,000 paid orders in the range. The next step, when the volume asks for it, is a stored local date per order, filled by `SP_Payments_ConfirmPayment`, which `AT TIME ZONE` cannot give as a computed column. The benchmark gives this report and `TopProducts` three seconds at ten times the seed volume.
- **Searching orders by text** (`CHARINDEX`) reads the whole table by nature: about 3,100 reads and 320 ms with 50,000 orders. A full-text index is the answer if the staff search becomes the bottleneck.
- The ledgers (`AuditLog`, `InventoryMovements`, `FinancialMovements`, the status histories) are append-only by design and are not purged. Archiving them is a business decision.

## Read isolation

`READ_COMMITTED_SNAPSHOT` is on. Readers see the last committed version of a row instead of waiting for the writer that holds it. The code already documented the consequence of not having it: a deadlock between a reader and the order insert in `SP_Orders_CreateOrder`. The runner applies it when it prepares the database (`ALTER DATABASE` cannot run inside the transaction of a migration), waits up to 30 seconds for the other sessions the first time, and `npm run db:verify` fails if a database lacks it. Query Store and `PAGE_VERIFY CHECKSUM` are applied the same way.

Every procedure that decides on data it just read takes `UPDLOCK` on it, and a locking hint reads the latest committed version even under snapshot isolation, so the guarantees did not change. The concurrency suite (`npm run sql:concurrency`) passed five consecutive runs with the option on, and a new scenario proves that a reader answers while a writer holds the row. With the option off that scenario fails: the reader waits.

## Repeating the measurement

```bash
npm run sql:test:up
```

```bash
npm run sql:bench
```

The first run loads the data (about 45 seconds); later runs only measure. To start again, drop `ShopCart_Bench`. Run it after any change to a list, a report or an index and compare with the limits in `db/tests/scripts/run-bench.ts`. A change in the object headers is not enough on a database that already has the previous version: drop it, or raise the version of the object as the runner requires.
