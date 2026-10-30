# Stored procedure, view and function catalogue

Planned objects, grouped by module. Procedures marked **critical** need a tSQLt case and fail `npm run sql:coverage` without one. Status of every item is "planned" until the stage that builds it (see the [roadmap](../progress/ROADMAP.md)).

## Stored procedures

| Module | Procedures |
|---|---|
| Auth (RF-01) | **Built:** `SP_Users_Register`, `SP_Users_GetByEmail`, `SP_Users_GetById` (profile without the hash, added for the refresh flow), `SP_Users_SetStatus`, `SP_Users_List`, `SP_Users_RecordFailedAttempt`, `SP_Users_RecordSuccessfulLogin` (added: it resets the lockout counter), `SP_Tokens_Save`, `SP_Tokens_Rotate`, `SP_Tokens_RevokeFamily` |
| Catalogue (RF-02) | **Built:** `SP_Categories_Create/Update/Deactivate/List`, `SP_Products_Create/Update/Deactivate/Get/Search`, `SP_Variants_Create/Update`, `SP_Variants_ChangePrice`, `SP_Variants_SetAttributes` (internal), `SP_Addresses_List/Save` |
| Inventory (RF-03) | **Built:** `SP_Inventory_RegisterEntry`, `SP_Inventory_AdjustStock`, **`SP_Inventory_ReserveStock`**, `SP_Inventory_ReleaseCartReservation`, **`SP_Inventory_ReleaseExpiredReservations`**, `SP_Inventory_GetLedger` |
| Cart (RF-04) | **Built:** `SP_Cart_Get`, `SP_Cart_SetItemQuantity`, `SP_Cart_RemoveItem`, `SP_Cart_MergeGuest`, `SP_Cart_ApplyCoupon`, `SP_Cart_RemoveCoupon` |
| Coupons (RF-05) | **Built:** `SP_Coupons_Create/Update/Deactivate/List`, `SP_Coupons_Validate` |
| Checkout (RF-06) | **Built:** `SP_Idempotency_Begin/Complete/Fail/PurgeExpired`, **`SP_Orders_CreateOrder`** (built) |
| Payments | **Built (readers):** `SP_BankAccounts_List/Save` (the draft called the first one `ListActive`), `SP_Payments_GetMethodsAndWindow`, `SP_Payments_GetByOrder`, `SP_Payments_GetProof`, `SP_Payments_ListPendingDeposits`. Core: **`SP_Payments_ConfirmPayment`**, **`SP_Payments_RegisterProof`**, **`SP_Payments_ApproveDeposit`**, **`SP_Payments_RejectDeposit`**, **`SP_Payments_ExpirePending`**, `SP_Payments_RegisterOrphanPayment`, **Built:** `SP_Refunds_Mark`, `SP_Refunds_List` (refunds are opened by cancellations, returns and late payments, so there is no separate register procedure) |
| Payments, card (Phase 2) | `SP_Payments_RegisterExternalCheckout`, `SP_Payments_RegisterCreationFailure`, `SP_Payments_RegisterWebhookEvent`, `SP_Payments_ListPendingCardsToReconcile`, `SP_Webhooks_Purge` |
| Orders (RF-07) | **Built:** **`SP_Orders_ChangeStatus`**, **`SP_Orders_Cancel`**, **`SP_Returns_Register`**, `SP_Orders_List`, `SP_Orders_GetDetail` |
| Dashboard (RF-08) | **Built:** `SP_Dashboard_Summary`, `SP_Dashboard_SalesByPeriod`, `SP_Dashboard_SalesByCategory`, `SP_Dashboard_TopProducts` (the draft called it `TopTenProducts`; it takes a limit), `SP_Dashboard_AbandonedCarts` |
| Audit (RF-09) | `SP_Audit_Record` (built, internal use), `SP_Audit_Query` (built) |
| Jobs | **Built:** `SP_Jobs_ExpirePayments`, `SP_Jobs_PurgeExpired`, `SP_Jobs_ReconcileAmounts`, `SP_Reconciliation_List` |
| System | `SP_System_GetSchemaVersion` (built, `R0100`), `SP_System_ListObjectVersions` (built) |

## Views and functions

| Object | Purpose |
|---|---|
| `VW_Inventory_Availability` | Built. Available stock per variant (`OnHandStock − ReservedStock`) |
| `VW_Inventory_Reconciliation` | Built. Two checks, one row per discrepancy with its cause in `Issue`: `OnHandStock` against `SUM(Quantity)` of the ledger (`OnHandVsLedger`) and `ReservedStock` against the lines of the active reservations (`ReservedVsReservations`). Must return no rows |
| `VW_Orders_History` | Order with its status history |
| `VW_Payments_PendingDeposits` | Review queue with age in hours |
| `VW_Payments_CardReconciliation` | Open card payments past their nominal expiry (Phase 2) |
| `VW_Reconciliation_Amounts` | Built. Money checks from [money handling](money-handling.md#conservation-and-reconciliation). Must return zero rows |
| `VW_Dashboard_SoldOrders` | Built. One row per order that counts as a sale (`PaidAt` set, not cancelled), with the returned amount and the net, in integer cents |
| `VW_Dashboard_SoldLines` | Built. One row per line of those orders, with the category frozen on the line, the returned units and the net. It replaces the draft views `VW_Dashboard_SalesByCategory` and `VW_Dashboard_TopTenProducts`: a row per line with `PaidAt` can be filtered by period and grouped by whoever reads it |
| `VW_Carts_Abandoned` | Built. Active carts with items, their estimated value and `AbandonedAt` (last activity plus `AbandonedCartHours`); the procedure compares it with its own clock |
| `FU_Catalogue_CurrentPrice(@IDVariant)` | Built. Current price in integer cents and whether the variant can be bought (variant and product active) |
| `FU_Coupons_DiscountCalculation(@IDCart, @IDCoupon)` | Built. Discount per cart line with largest-remainder allocation; the lines add up to the total exactly. Does not check validity |
| `FU_Coupons_Status(@IDCoupon, @IDUser, @EligibleCents, @Now)` | Built. Why a coupon can or cannot be applied: `Valid`, `NotFound`, `Inactive`, `NotStarted`, `Expired`, `Exhausted`, `PerCustomerLimit`, `NoEligibleItems`, `BelowMinimum`, in that order of precedence |
| `FU_Coupons_Rejection(@Reason)` | Built. The error number and the message (starting with the stable API code) for each rejection reason; no row for `Valid` |
| `FU_Cart_Totals(@IDCart, @Now)` | Built. Subtotal, discount, total, VAT and taxable base in integer cents, plus the coupon reason. There is no shipping: the brief does not ask for it. `SP_Orders_CreateOrder` will reuse it, so the cart preview and the order can never disagree |
| `FU_Money_CentsToText(@Cents)` | Built. The only conversion from cents to the two-decimal text that amounts use in the API (ADR-0020) |
| `FU_Money_HalfEvenDivision(@N, @D)` | **The only rounding policy** (half-even). `NULL` outside its domain (`@N >= 0`, `@D > 0`) |
| `FU_Users_ActiveAdministrator(@IDUser)` | One row when the account is an active administrator; the second line of defence behind the role middleware for every catalogue write |
| `FU_Money_VatIncluded(@TotalCents, @VatRate)` | VAT included in a total (`VatCents`) and the taxable base (`BaseCents` by subtraction, so base + VAT = total) |
| `FU_Payments_DepositWindow(@DeliveryDate, @LeadTimeDays, @Now)` | Built. Deposit deadline `MIN(DepositReservationHours, delivery − lead time)` with the delivery read at 00:00 Guatemala time, and the minutes available (negative when it is already too late) |
| `FU_Dashboard_SalesByPeriod(@From, @To, @Granularity)` | Built. Orders, gross, returned, net and average ticket per day, week or month, with the empty periods as zeros, by `PaidAt` in Guatemala time. Helpers: `FU_Dashboard_PeriodStart` (Monday weeks) and `FU_Dashboard_Range` (defaults and UTC bounds) |
| `FU_Orders_RefundableAmount(@IDOrderLine, @Quantity)` | Built. Refund in cents for N units of a line, half to even, closing exactly on the last unit; NULL when the quantity is not valid |

## Critical procedures in brief

### Order creation (built)

Source: `R0300` (`SP_Orders_CreateOrder`) and `R0058` (`FU_Payments_DepositWindow`). 35 tSQLt tests in `Test_Orders`, plus two races in `npm run sql:concurrency`.

`SP_Orders_CreateOrder(@IDUser, @IDReservation, @IDAddress, @RequestedDeliveryDate, @IDPaymentMethod, @IdempotencyKey, @IDBankAccount, @Now, outputs)` creates the order, its lines, its payment and the links in one transaction, from an active reservation. **The backend sends no amounts**: the subtotal, the discount per line, the total, the VAT and the taxable base are recalculated from `FU_Cart_Totals` in integer cents.

- **Reservation.** It is locked and must belong to the user (another customer's reservation answers 404), be `Active` and not past its expiry, and match the cart line for line; otherwise `409 RESERVATION_EXPIRED`. A variant withdrawn after reserving gives `409 INSUFFICIENT_STOCK`.
- **Address and date.** The address must be the customer's and active. The delivery date cannot be earlier than today (Guatemala) plus the longest lead time among the lines: `422 DELIVERY_DATE_TOO_SOON`.
- **Payment deadline.** A card payment lasts `ReservationMinutes`. A deposit lasts until the earlier of `DepositReservationHours` and the delivery date minus the lead time; with fewer than `MinDepositHours` left it answers `422 DEPOSIT_UNAVAILABLE_FOR_DATE` (ADR-0016). A deposit needs an active bank account; a card takes none.
- **Coupon.** A coupon that stopped being valid after it was applied (expired, sold out, already used by the customer) **stops the order** with its code instead of charging more in silence. The per-customer limit is checked under an application lock on customer and coupon. The total limit is enforced by a conditional `UPDATE`, which is atomic, so two orders cannot take the last use. The totals and the split of the discount are computed **before** the use is counted: counting first would turn a single-use coupon into "exhausted" and take away its own discount.
- **Frozen data.** The order keeps a copy of the address, the coupon code and, per line, the SKU, name, attributes, price and discount. Shipping is written as zero: the brief does not ask for it. The order number is `PED-YYYY-NNNNNN` from the identifier.
- **Effects.** The payment is born `Pending` for the order total; the reservation is linked to the order and takes the payment's expiry; the cart becomes `Converted`; both status histories and an audit entry are written. There is **no inventory movement and no drop of the physical stock**: that happens when the payment is confirmed, so an abandoned order leaves no noise in the ledger. The expiry job never releases a reservation that has an order.
- **Idempotency.** Repeating the call with the same key and reservation returns the same order and does not count the coupon twice. Another key for a reservation that already has an order, and a key already used for another order, answer `409` (the latter with `IDEMPOTENCY_KEY_IN_USE`, which is not the middleware's `IDEMPOTENCY_KEY_REUSED`). The repeat check uses local variables because an output parameter can arrive with the value of an earlier call.
- A total of zero (a coupon covering the whole cart) is refused, because a payment of zero does not exist.

### Deposit payments (built)

Sources: `R0301` (`SP_Orders_CancelPending`) and `R0310` to `R0316` (`SP_Payments_*`). 45 tSQLt tests in `Test_Payments` (399 in the whole suite), plus two races in `npm run sql:concurrency`.

- **`SP_Payments_ConfirmPayment`** is the single door through which money is recognised. It locks the payment row, so two confirmations serialise, and answers in `@Outcome` instead of raising when the result is an expected one: `Approved`, `AlreadyApproved` (a repeat is a no-op) or `Orphan` (the payment arrived for an order that can no longer take it, so a refund is registered). A different amount raises `422 AMOUNT_MISMATCH` and approves nothing. On approval, in one transaction: payment `Approved`, order `Paid`, variants locked in ascending order, physical stock decremented with an `InventoryMovements` exit (type 2) that stores the resulting balance, reservation `Consumed`, and the financial ledger gets the charge and the provider fee.
- **`SP_Payments_RegisterProof`** takes the customer's file data (the file lives outside the database: only its opaque key and SHA-256 hash arrive). Ownership is checked in the same query that locks the payment, so another customer's payment answers 404. It refuses a bank reference that backs another live payment (`REFERENCE_ALREADY_USED`), a file already backing a payment under review or approved (`PAYMENT_PROOF_REUSED`) and an order with no attempts left (`DEPOSIT_ATTEMPTS_EXCEEDED`). The payment moves to `UnderReview`.
- **`SP_Payments_ApproveDeposit`** and **`SP_Payments_RejectDeposit`** are for operators and administrators. Approving a deposit whose amount differs from the order rejects it with that reason (`RejectedAmountMismatch`); there are no partial approvals. Rejecting needs a reason, frees the bank reference (`IsCurrent = 0`) and extends the reservation to at least `now + RejectionGraceHours`. When `MaxDepositAttempts` rejections are reached the order is cancelled and everything is released (`RejectedOrderCancelled`).
- **`SP_Payments_CreateDepositAttempt`** opens a new pending payment for an order whose deposit was rejected: a rejected payment is terminal, so retrying creates another one, never reopens it. Only one open attempt per order, and it lives as long as the reservation.
- **`SP_Orders_CancelPending`** (internal) cancels an order that was never paid: it closes its open payments, returns the reservation to the stock, voids the coupon use and writes the histories. It is shared by the maximum-attempts rule, by expiry and, later, by the customer's cancellation. Cancelling twice is a no-op.
- **`SP_Payments_ExpirePending`** expires pending payments past their deadline and the orders left with no open payment whose reservation ran out. A payment under review never expires. The job that calls it is still pending (D-06).
- **`SP_Payments_RegisterOrphanPayment`** registers the refund for a payment that cannot be applied; repeating it changes nothing.
- **Concurrency, proven with real connections.** Twenty simultaneous confirmations of one payment decrement the stock once and write one charge. An operator approving while another rejects the same deposit ends in exactly one outcome. This race found a real deadlock: the two procedures reached the `Payments` row through different indexes and took their locks in opposite order. Both now enter through the primary key with no join. Reads of "the payments of this order" force `IX_Payments_Order` for the same reason (a tiny table makes the optimiser scan the status index and collide with other orders' uncommitted rows).

### Order lifecycle and returns (built)

Sources: `R0059` (`FU_Orders_RefundableAmount`), `R0062` (`VW_Reconciliation_Amounts`), `R0302` to `R0304` and `R0320`, `R0321`. 43 tSQLt tests in `Test_Lifecycle` (442 in the whole suite), plus two races in `npm run sql:concurrency`.

- **`SP_Orders_ChangeStatus`** is for operators and administrators and only sets `InPreparation`, `Dispatched` and `Delivered`. It locks the order, so two operators asking for the same step get `422 INVALID_STATE_TRANSITION` the second time; the transition must exist in `OrderStatusTransitions`. Payment, cancellation and returns have their own procedures because they move money or stock.
- **`SP_Orders_Cancel`** is for the customer (own order only; another customer's order answers 404) or staff. A pending order goes through `SP_Orders_CancelPending`. A paid or in-preparation order is cancelled in one transaction: the units go back to the physical stock with a `Return` movement that stores the resulting balance, and a **pending refund for the whole payment** is opened. From `Dispatched` on it answers `422 INVALID_STATE_TRANSITION`. Cancelling twice is a no-op, so a double click opens one refund. The coupon use of a paid order is not voided.
- **`SP_Returns_Register`** is for operators and administrators, on a `Delivered` or `PartiallyReturned` order. Lines come as a JSON array `[{"idOrderLine":1,"quantity":2}]` and a line cannot repeat. Each line's refund comes from `FU_Orders_RefundableAmount`: a unit is worth `LineTotal / Quantity` rounded half to even, and **the last pending unit refunds what is missing from the line total**, so a line of Q100.00 and 3 units refunds 33.33, 33.33 and 33.34. Asking for more units than are pending answers `422 RETURN_QUANTITY_EXCEEDED` and changes nothing. The return restores the stock through the ledger, opens one pending refund and moves the order to `PartiallyReturned`, or to `Returned` when no unit is left.
- **`SP_Refunds_Mark`** is for administrators. Marking a refund `Processed` needs the reference of the transfer and writes the money ledger (`Refund`, negative). When the processed refunds equal what was charged, the payment moves to `Refunded`. A late payment that arrived after the order was cancelled never reached the ledger, so its `Charge` is written first and the refund subtracts from it. Repeating the same result is a no-op; a `Failed` refund can be processed later; a processed one cannot change. `SP_Refunds_List` feeds the administrator panel, oldest first, with the amount as text.
- **`VW_Reconciliation_Amounts`** returns one row per discrepancy and must be empty. It checks the order subtotal and discount against the lines, the approved payment against the order total, the ledger charge and fee against each payment, refunds against what was charged, the ledger refunds against the processed ones, each return against its lines, the returned units against the return lines, a fully returned line against its exact total, and the coupon counters. `npm run sql:concurrency` asserts it is empty after every payment, return and cancellation scenario.
- **Concurrency, proven with real connections.** Twenty simultaneous returns of one unit from a line of five accept exactly five, refuse fifteen with a 422, leave the stock at its starting level and refund exactly the line total. Ten simultaneous cancellations of one paid order cancel it once, restore the stock once and open one refund. All procedures take the order lock first and then the variants in ascending order.

### Readers for the API (built)

Sources: `R0101`, `R0122`, `R0305`, `R0306`, `R0330` to `R0335`. 29 tSQLt tests in `Test_Readers`.

- **Ownership is decided inside the procedure.** `SP_Orders_List`, `SP_Orders_GetDetail`, `SP_Payments_GetByOrder` and `SP_Payments_GetProof` take `@IDActor` (always the `IDUser` of the verified token) and `@AsStaff`. A customer only sees what is theirs; anything else answers `50404`, the same as a missing row. The order list ignores the search text for a customer, so a customer cannot find another customer's order by number.
- **Order detail** returns one row with `Lines` and `History` as JSON arrays and every amount as text. **Payment view** returns one row per attempt (newest first) with the bank, the deposit data, the rejection reason, the proofs as JSON and the attempts used against `MaxDepositAttempts`.
- **Review queue** (`SP_Payments_ListPendingDeposits`) lists deposits under review oldest first, with their age in hours; with another status it works as a history, newest first. The design's `VW_Payments_PendingDeposits` view was dropped in favour of this procedure, which takes the status filter.
- **Deposit window** (`SP_Payments_GetMethodsAndWindow`) takes the longest lead time of the customer's active cart and says whether the delivery date is allowed and whether a deposit still fits before it. The card is decided by the backend (it depends on the provider credentials).
- **Bank accounts** (`SP_BankAccounts_List` and `Save`): only an administrator saves; the change is audited.
- **Audit and versions**: `SP_Audit_Query` pages the immutable log newest first; `SP_System_ListObjectVersions` returns the current version of every programmable object.
- `SP_Returns_Register` 1.1.0 also returns `@RefundAmountText`, the refund as text with two decimals, so the API never passes an amount through a floating-point number.

### Jobs (built)

Sources: `R0340` to `R0343`. 9 tSQLt tests in `Test_Jobs`, plus two scenarios in `npm run sql:concurrency`.

- **One lock per job.** `SP_Jobs_ExpirePayments`, `SP_Jobs_PurgeExpired` and `SP_Jobs_ReconcileAmounts` take `sp_getapplock` (`Job:<Name>`, `Exclusive`, owner `Session`, timeout 0). Whoever does not get it returns `@Outcome = 'Skipped'` without waiting; whoever does returns `'Ran'` with the counts. A failure releases the lock in the `CATCH` and is raised unchanged. The design draft used a *transaction* lock; a session lock was chosen because `SP_Payments_ExpirePending` handles each order in its own transaction (see the [backend design](../architecture/03-backend-lld.md#jobs)).
- **Reconciliation.** `SP_Jobs_ReconcileAmounts` counts the discrepancies of the money and inventory views. If there is any, it writes an audit entry (module `Reconciliation`) with the counts and the first 20 rows of each view as JSON. `SP_Reconciliation_List` returns the current discrepancies for the administrator panel, because the application login cannot read the views.
- `SP_Inventory_ReleaseExpiredReservations` 1.1.0 also returns its count in `@Released`, so the job procedure does not have to capture a result set.

### Dashboard (built)

Sources: `R0063` to `R0065` (views), `R0066` to `R0068` (functions) and `R0350` to `R0354` (procedures). 23 tSQLt tests in `Test_Dashboard`.

- **What counts as a sale** ([ADR-0009](../adr/0009-definition-of-completed-order-for-reports.md)). An order with `PaidAt` set that is not `Cancelled`; a `PendingPayment` order never counts. Returns are subtracted from the order they belong to (the sum of `Returns.RefundAmount`), so an order returned in full is still a sale with a net of zero. Everything is grouped by `PaidAt`.
- **Guatemala days.** The range and the periods are days of Guatemala (UTC-6): a sale paid at 23:30 local belongs to that day even if it is already the next one in UTC. The range is converted to UTC bounds and compared with `PaidAt` directly, so `IX_Orders_PaidAt` is used. Weeks start on Monday and do not depend on `DATEFIRST`.
- **Defaults and limits.** Without dates the reports cover the last 30 days up to today in Guatemala, decided in SQL. The series accepts at most 400 periods; the other reports accept at most ten years.
- **Series.** `SP_Dashboard_SalesByPeriod` returns one row per period, oldest first, with the periods without sales as zeros so the chart is continuous.
- **Average ticket.** The net sale divided by the paid orders, rounded half to even once with `FU_Money_HalfEvenDivision` (so 100.225 is 100.22 and not 100.23).
- **Categories and best sellers.** Read the category frozen on each order line. Units are the units sold minus the returned ones; the nets of all the categories add up to the net sale of the period, which a test checks against the summary. Best sellers group by product (two sizes of the same cake add up) and sort by units, then net amount, then product, so the result is always the same; a product with every unit returned does not appear. The limit goes from 1 to 50 (10 by default).
- **Summary.** One row with the sales of the range and three counters of the present moment that do not depend on it: orders waiting for payment, deposits under review and abandoned carts.
- **Abandoned carts.** Active, with items and a last activity older than `AbandonedCartHours` (24). Most valuable first (current prices, no coupon), paged, with the customer's name and email; a visitor appears without them.
- Amounts leave as text with two decimals; the backend adds nothing up.

### Idempotency (built)

Sources: `R0220` to `R0223`. 22 tSQLt tests in `Test_Idempotency`, plus a race in `npm run sql:concurrency`. This is the first level of ADR-0004; the unique indexes of each table are the second.

- **`SP_Idempotency_Begin(@Scope, @Method, @Route, @IdempotencyKey, @RequestHash, @Now, @AbandonedAfterSeconds = 60)`** returns one row with the `Outcome` the middleware acts on:

  | Outcome | Meaning | The middleware answers |
  |---|---|---|
  | `New` | A new key, an expired key not yet purged, or a key whose earlier attempt failed | Executes the operation |
  | `TakenOver` | The request was in progress for 60 seconds or more: its instance probably died | Executes the operation |
  | `Replay` | Completed with the same body | The stored status and body, with `Idempotent-Replayed: true` |
  | `InProgress` | Running, with `RetryAfterSeconds` left before it counts as abandoned | 409 with `Retry-After` |
  | `Mismatch` | The same key with another body, in any state | 422 `IDEMPOTENCY_KEY_REUSED` |

- **Atomic by lock, not by luck.** The lookup uses `UPDLOCK, HOLDLOCK`, which takes a range lock on the key whether or not the row exists, so two simultaneous requests cannot both see "no row". Without `HOLDLOCK` the second one hits the unique index and fails; the concurrency check (20 keys, 5 simultaneous requests each) catches that.
- **`SP_Idempotency_Complete`** stores the status and the body of a 2xx or a deterministic 4xx. A 5xx is refused with 50400: it must stay retryable. The body must be valid JSON or absent (a `204`). Completing twice keeps the first response and returns `@Stored = 0`, so a slow instance cannot overwrite the answer another instance already gave. An unknown key is 50404.
- **`SP_Idempotency_Fail`** marks an in-progress request as `Failed`, so the same key and body can be retried at once instead of waiting 60 seconds. It never touches a completed request and is harmless when repeated or for an unknown key.
- **`SP_Idempotency_PurgeExpired`** deletes expired keys in batches (default 1000, at most 100 batches per run), each batch its own transaction so requests keep passing between them. It also removes requests that were left in progress: after 24 hours they are abandoned beyond doubt. The daily job that calls it is still pending (D-06).
- The scope is `U:<IDUser>` or `G:<GuestToken>` and is compared exactly (a lowercase prefix is refused), so one customer's key never collides with another's. Retention comes from the `IdempotencyKeyHours` setting (24 when absent).

### Cart and coupons (built)

Sources: `R0048`, `R0053` to `R0057` (functions), `R0200` to `R0205` (cart) and `R0210` to `R0214` (coupons). 63 tSQLt tests in `Test_Cart` and `Test_Coupons`, plus the helper class `Test_Shop` (a sample shop with the prices of the design's numeric example).

- **The cart stores no price and no total.** `SP_Cart_Get` computes everything from `FU_Cart_Totals` and returns one row with `Lines` as a JSON array and every amount as two-decimal text. With no cart it returns a row with a `NULL` `IDCart` and zero totals, and creates nothing, so visitors who only look do not fill the table with empty carts.
- **Absolute quantities (ADR-0013).** `SP_Cart_SetItemQuantity` sets a quantity from 1 to 99 and creates the cart if needed; repeating a request leaves the same state. A customer is identified by the account and a visitor by the guest token, never both. First-cart creation is serialised with an application lock, because a unique-index violation inside the transaction would make it unusable.
- **Stock limit (RF-04).** `SP_Cart_SetItemQuantity` rejects a quantity above the stock available with `50409 INSUFFICIENT_STOCK: Only N units are available.`. Available is `OnHandStock - ReservedStock` plus the units the cart's own active reservation already holds for that variant, so a customer who reserved 3 of 3 can still repeat 3. It is checked before the cart is created, so a rejection leaves no empty cart. Lowering a quantity below the stock is always allowed. The reservation of the checkout remains the guarantee against overselling; merging a guest cart does not check stock (the cart flags the line with `HasUnavailableLines`).
- **Editing the cart releases its active reservation.** A reservation describes the cart as it was; if the customer changes it, the units are returned, so stock is neither held for something the customer no longer wants nor left unreserved for what they added. The procedures take the same row lock on the cart as `SP_Inventory_ReserveStock`.
- **Merging a guest cart** (`SP_Cart_MergeGuest`) gives the guest cart to a customer who had none, or adds the quantities (capped at 99, the customer's inscription wins) and discards the guest cart. It is idempotent.
- **No shipping.** The brief does not mention it, so the cart total is the subtotal minus the discount. **VAT** is separated from that total with `FU_Money_VatIncluded`. `Orders.Shipping` and the `ShippingCost` and `FreeShippingFrom` settings stay in the schema for when shipping is added; `SP_Orders_CreateOrder` will write zero.
- **Coupons.** The discount is a single half-even division over the eligible amount (percentage) or the fixed value capped at the eligible amount, then split across the eligible lines by largest remainder. A category coupon covers the category and its subcategories. The minimum amount is compared with the **eligible** subtotal, not the whole cart. The design example is a test: 10 % of Q245.45 is Q24.54 (a tie that goes to the even cent) split as 14.50, 4.50 and 5.54, for a total of Q220.91 with VAT Q23.67.
- **A coupon only discounts while it is applicable today, and the cart says why when it is not.** One that expires, sells out or is used by the customer after being applied stops discounting, but the cart keeps it and reports the reason in `CouponReason` (`Expired`, `Exhausted`, `PerCustomerLimit`...), so the panel can show "this coupon has expired" or "you already used this coupon" instead of silently changing the total.
- **Rejections carry the API code**, including `COUPON_ALREADY_USED` when the customer has spent the coupon and `COUPON_EXPIRED` when it is out of date. `SP_Cart_ApplyCoupon` raises 50422 (409 for an exhausted coupon, 404 for an unknown one) with a message that starts with `COUPON_EXPIRED:`, `COUPON_MINIMUM_NOT_MET:` and so on. `SP_Coupons_Validate` does not raise: it returns the reason and the discount that would apply, because an invalid code is the usual case while the customer types.
- **Usage counting is not here yet.** `UsageCount` and `CouponUsages` are written by `SP_Orders_CreateOrder` (next block); the status function already reads them.

### Stock ledger (built)

Sources: `R0113` (`SP_Inventory_RegisterEntry`), `R0114` (`SP_Inventory_AdjustStock`), `R0115` (`SP_Inventory_GetLedger`), `R0060` and `R0061` (the views). 21 tSQLt tests in `Test_Ledger`.

- Stock changes **only** through the ledger: a variant is born with zero units, and an entry or an adjustment updates `OnHandStock` and inserts its `InventoryMovements` row in the same transaction, under a lock on the variant. Concurrent entries therefore read the balance the previous one left, so `ResultingBalance` is always consecutive and no unit is lost.
- `SP_Inventory_RegisterEntry(@IDActor, @IDVariant, @Quantity, @Reason, @Now, @IDMovement OUT)` adds units. The quantity must be positive and the reason is mandatory; an entry that would overflow the stored `INT` is refused with 50422.
- `SP_Inventory_AdjustStock(@IDActor, @IDVariant, @NewOnHand, @Reason, @Now, @IDMovement OUT)` takes the **counted** stock, not an increment, and writes a signed compensating movement of type `Adjustment`. A count equal to the stock writes nothing. A count below the reserved units is refused with 50422: those units are promised to customers.
- Both need an active administrator and write `SP_Audit_Record` (module `Stock`).
- `SP_Inventory_GetLedger(@IDVariant, @From, @To, @PageNumber, @PageSize)` lists the movements newest first, ordered by identifier and not by date because two movements can share a millisecond. `@To` is exclusive.
- `npm run sql:concurrency` now puts the initial stock through `SP_Inventory_RegisterEntry`, checks that `VW_Inventory_Reconciliation` is empty after every scenario, and races 50 simultaneous entries (all succeed, 50 different balances, the ledger adds up to the stock).

### Authentication and catalogue (built)

Sources: `R0120` (audit), `R0130` to `R0138` (accounts and tokens), `R0140` to `R0143` (categories), `R0150` to `R0154` (products), `R0159` to `R0162` (variants), `R0170` and `R0171` (addresses), `R0052` (administrator check). 112 tSQLt tests in `Test_Audit`, `Test_Auth`, `Test_Catalogue` and `Test_Addresses`.

- **Accounts.** `SP_Users_Register` only creates customers: no role parameter, so a backend bug cannot make a privileged account from a public form. `SP_Users_GetByEmail` returns no rows for an unknown email instead of raising an error, so the login answers the same whether the account exists. The lockout lives in the database (it works with several replicas): from the fifth consecutive failure the account is locked for 1 minute, doubling with each further failure up to 60 minutes, decided by a single `UPDATE`. `SP_Users_SetStatus` needs an active administrator, refuses self-deactivation, revokes every refresh token when it deactivates, and writes an audit entry.
- **Tokens.** Only the SHA-256 hash is stored. `SP_Tokens_Rotate` is atomic and detects reuse: presenting a token that was already rotated revokes the whole family. The outcome (`Rotated`, `NotFound`, `Expired`, `UserInactive`, `ReuseDetected`) is returned in an output parameter, never raised: under `XACT_ABORT` a `THROW` would roll back the very revocation that must be kept. Two tabs refreshing with the same token at once count as reuse and close the session; that is the price of detecting theft.
- **Catalogue.** Every write needs an active administrator (`FU_Users_ActiveAdministrator`) and writes `SP_Audit_Record` in the same transaction; saving identical data leaves no entry. Categories cannot form cycles and cannot be deactivated while they hold active products or subcategories. A product update accepts the `RowVer` the panel read and answers 409 if it changed. Deactivating a product deactivates its variants, so `SP_Inventory_ReserveStock` stops reserving them. A variant is created without stock: units only enter through the inventory ledger, so the counter and the ledger never disagree. Prices travel as two-decimal text and are audited as text (module `Prices`).
- **Reading.** `SP_Products_Get` returns one row with `Images` and `Variants` as JSON arrays. `SP_Products_Search` searches with `CHARINDEX` (a `%` typed by the user is text, not a wildcard), includes subcategories when filtering by category, and chooses the order among four fixed expressions, never a dynamic `ORDER BY`.
- **Addresses.** The ownership condition is part of the `UPDATE` itself, so another customer's address answers 404 and is never modified, even under a race.

### `SP_Inventory_ReserveStock`: anti-oversell (built)

Source: `db/objects/procedures/R0111__SP_Inventory_ReserveStock.sql`, with `R0110` (`SP_Inventory_ReleaseCartReservation`) and `R0112` (`SP_Inventory_ReleaseExpiredReservations`).

`SP_Inventory_ReserveStock(@IDUser, @IDCart, @Now = NULL, @IDReservation OUTPUT, @ExpiresAt OUTPUT)` reserves every line of the cart or none of them:

1. Validates the parameters (`50400`), the reservation window in `Configuration` (`50422`), the cart belongs to the user and is `Active` (`50404`, the same answer as a missing cart) and is not empty (`50422`).
2. Takes `UPDLOCK` on the cart row, so two requests for the same cart (double click, retry) are serialised. `UX_Reservations_OneActivePerCart` (V0011) is the second line of defence in the data.
3. Locks the variants it will touch **in ascending `IDVariant` order**. Without that order, two carts holding the same variants in a different order wait for each other in a circle: 60 crossing carts lost 44 deadlocks even with five retries. With it, none do.
4. Releases the previous reservation of the cart (a checkout retry), then runs one conditional `UPDATE` that adds the quantities to `ReservedStock` where `OnHandStock - ReservedStock >= Quantity` and the variant is active. If it touches fewer rows than the cart has lines, it raises `50409` and `XACT_ABORT` rolls everything back.
5. Inserts the `Active` reservation with `ExpiresAt = @Now + ReservationMinutes` and its lines.

The clock enters as `@Now` so tests are deterministic. `CK_Variants_ReservedVsOnHand` remains the last safety net.

`SP_Inventory_ReleaseCartReservation(@IDUser, @IDCart)` returns the units of the cart's `Active` reservation that has no order and marks it `Released`; it takes the user because it is callable on its own and must not release another customer's cart. `SP_Inventory_ReleaseExpiredReservations(@Now = NULL)` does the same for every reservation without an order whose `ExpiresAt` has passed (status `Expired`) and returns `ReleasedReservations`; the job runner that calls it every 60 seconds is still pending (D-06). Both claim the reservation with a single `UPDATE` so concurrent runs never return the same units twice, and a reservation linked to an order is never touched (its window follows the payment).

Proof: 18 tSQLt tests (`Test_Inventory`) and `npm run sql:concurrency`, which runs in CI against a real SQL Server: 100 buyers for 1 unit give exactly 1 success; 100 for 10 give exactly 10; 20 simultaneous requests for one cart hold the units once; a cart with one unavailable line holds nothing; 60 crossing carts reserve exactly the 40 that fit with no deadlock.

### `SP_Orders_CreateOrder`: atomic, born as `PendingPayment`

One transaction (`XACT_ABORT ON`):

1. Validate the reservation is `Active`, not expired and owned by the user (409 if expired).
2. Validate the address is the user's and `RequestedDeliveryDate >= today + MAX(LeadTimeDays)` of the products.
3. Recompute amounts from `FU_Catalogue_CurrentPrice` and `FU_Coupons_DiscountCalculation` in integer cents. **The backend sends no amounts.**
4. **Concurrent coupon:** conditional `UPDATE` of `UsageCount` (`WHERE UsageCount < TotalUsageLimit`); zero rows affected raises 409. The per-customer limit is validated with `sp_getapplock('Coupon:<id>:<user>')` and a `COUNT` over `CouponUsages WHERE IsVoided = 0`.
5. Insert `Orders` in `PendingPayment` with total `MAX(0, …)` (no shipping: `Shipping` is written as zero), and `OrderLines` with snapshots and largest-remainder discount allocation.
6. Payment deadline: **card** `now + ReservationMinutes`; **deposit** `FU_Payments_DepositWindow`. If `MinutesAvailable < MinDepositHours × 60`, raise `422 DEPOSIT_UNAVAILABLE_FOR_DATE`.
7. Insert `Payments` (`Pending`, with `IdempotencyKey`) and, for a deposit, `PaymentDeposits` with the chosen account.
8. Link the reservation to the order and set its `ExpiresAt` equal to the payment's. **No ledger movement and no physical stock decrement.**
9. Cart becomes `Converted`; write `OrderStatusHistory`, `PaymentStatusHistory` and `SP_Audit_Record`.
10. `COMMIT`. Any earlier `THROW` rolls everything back.

### `SP_Payments_ConfirmPayment`: idempotent core

```sql
CREATE OR ALTER PROCEDURE dbo.SP_Payments_ConfirmPayment
  @IDPayment INT, @ReceivedAmount DECIMAL(18,2), @Source NVARCHAR(20),
  @IDUser INT = NULL, @ProviderFee DECIMAL(18,2) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;
    DECLARE @IDOrder INT, @Status TINYINT, @Amount DECIMAL(18,2);
    -- 1. Bloquea el pago: dos confirmaciones simultáneas se serializan aquí
    SELECT @IDOrder = IDOrder, @Status = IDPaymentStatus, @Amount = Amount
    FROM dbo.Payments WITH (UPDLOCK, ROWLOCK) WHERE IDPayment = @IDPayment;
    IF @IDOrder IS NULL THROW 50404, 'Payment not found.', 1;

    -- 2. Idempotencia natural: ya aprobado => no hace nada y no falla
    IF @Status = 3 BEGIN COMMIT; RETURN; END;

    -- 3. Cobro sobre un pedido cancelado o expirado => se registra para reembolso, no se resucita el pedido
    IF @Status IN (6, 8) OR (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder) = 6
    BEGIN
      EXEC dbo.SP_Payments_RegisterOrphanPayment @IDPayment = @IDPayment, @ReceivedAmount = @ReceivedAmount;
      COMMIT; THROW 50409, 'The order was no longer valid; a pending refund was recorded.', 1;
    END;
    IF @Status NOT IN (1, 2) THROW 50422, 'The payment is not in a state that allows approval.', 1;

    -- 4. El monto recibido debe ser exactamente el del pedido
    IF @ReceivedAmount <> @Amount THROW 50422, 'The received amount does not match the order total.', 1;

    -- 5. Cobro aprobado y pedido pagado (los triggers validan ambas transiciones)
    UPDATE dbo.Payments SET IDPaymentStatus = 3, ResolvedAt = SYSUTCDATETIME(), ProviderFee = @ProviderFee WHERE IDPayment = @IDPayment;
    UPDATE dbo.Orders SET IDOrderStatus = 2, PaidAt = SYSUTCDATETIME() WHERE IDOrder = @IDOrder;

    -- 6. Descuenta existencia física y reservada; movimiento de Salida con saldo resultante
    UPDATE v SET OnHandStock = v.OnHandStock - l.Quantity, ReservedStock = v.ReservedStock - l.Quantity
    FROM dbo.Variants v WITH (UPDLOCK, ROWLOCK)
    JOIN dbo.OrderLines l ON l.IDVariant = v.IDVariant WHERE l.IDOrder = @IDOrder;
    -- INSERT dbo.InventoryMovements (Exit, ResultingBalance = OnHandStock posterior) por línea

    UPDATE dbo.Reservations SET Status = 'Consumed' WHERE IDOrder = @IDOrder AND Status = 'Active';

    -- 7. Libro de dinero: el cobro y, si existe, la comisión del proveedor (solo se anexa)
    INSERT dbo.FinancialMovements (IDOrder, IDPayment, Type, Amount, IDUser) VALUES (@IDOrder, @IDPayment, 'Charge', @Amount, @IDUser);
    IF @ProviderFee > 0
      INSERT dbo.FinancialMovements (IDOrder, IDPayment, Type, Amount, IDUser) VALUES (@IDOrder, @IDPayment, 'Fee', -@ProviderFee, @IDUser);

    -- 8. INSERT PaymentStatusHistory, OrderStatusHistory; EXEC SP_Audit_Record
  COMMIT;
END;
```

Properties defended: a repeated webhook or approval is a no-op; a concurrent confirmation serialises with `UPDLOCK`; a different amount never approves; `UX_Payments_OneApproved` blocks two approved payments even with a bug; `UX_FinancialMovements_OneChargePerPayment` blocks two accounting charges.

### Deposit: proof, approve, reject

- **`SP_Payments_RegisterProof`** (one transaction): the payment belongs to the user (404 otherwise); status `Pending`; the bank reference is not used by another live payment (409); the file hash is not in another `UnderReview` or `Approved` payment (422 `PAYMENT_PROOF_REUSED`); previous attempts `< MaxDepositAttempts`. It inserts `PaymentProofs`, completes `PaymentDeposits`, moves the payment to `UnderReview` and **suspends reservation expiry**.
- **`SP_Payments_ApproveDeposit`**: Operator or Administrator, payment `UnderReview`, `DepositedAmount = Amount`. If the amount differs it rejects with a reason; there are no partial approvals. It calls `SP_Payments_ConfirmPayment` with source `Operator`. With two operators approving at once, the second gets the idempotent no-op (or 422 if it was rejected).
- **`SP_Payments_RejectDeposit`**: requires `@Reason`. Payment becomes `Rejected`, `PaymentDeposits.IsCurrent = 0` (frees the reference), the order stays `PendingPayment`, and the reservation window resumes with `MAX(current, now + RejectionGraceHours)`. If `MaxDepositAttempts` is reached, the order is cancelled and everything is released.

### Cancel and returns

- **`SP_Orders_Cancel`** (Customer on their own order, in `PendingPayment`, `Paid` or `InPreparation`): see [state machines](../architecture/04-state-machines.md).
- **`SP_Returns_Register`**: per line validates `Quantity <= Quantity − ReturnedQuantity`. The refund uses `FU_Orders_RefundableAmount`; on the last pending unit it refunds `LineTotal − previously refunded`, so the sum closes to the cent. It restores stock through the ledger, moves the order to `PartiallyReturned` or `Returned` and creates a pending `Refund`.

### Expiry (job every 60 s with `sp_getapplock`, built)

`SP_Jobs_ExpirePayments(@Now, @BatchSize, outputs @Outcome, @ExpiredOrders, @ReleasedReservations)` takes the session lock `Job:ExpirePayments` and runs the two procedures below; see [Jobs](#jobs-built).

1. **`SP_Payments_ExpirePending`:** `Pending` payments past `ExpiresAt` become `Expired`; their `PendingPayment` order becomes `Cancelled`; the reservation is released and the coupon voided. `UnderReview` payments **never** expire.
2. **Card (Phase 2):** before expiring, the backend queries `GET /api/checkouts/:id`; if Recurrente says `paid`, it confirms instead of expiring. Two minutes of grace after the deadline.
3. **`SP_Inventory_ReleaseExpiredReservations`:** releases reservations **without an order** (carts that started but never confirmed).

### Edge cases covered

| Case | Handling |
|---|---|
| Duplicate webhook or approval | Idempotent `ConfirmPayment`; `UNIQUE (Provider, MessageID)` |
| Different amount or currency | Does not approve; anomaly in the audit log and, if money was taken, a `Refund` |
| Late payment (order already expired) | `RegisterOrphanPayment` creates a pending refund visible to the Administrator |
| Customer pays by card and also uploads a deposit | One open attempt per order; the second charge becomes an orphan payment |
| `payment_intent.failed` | Only recorded; it does **not** end the payment: the customer may retry on the Recurrente page until it expires |
| Recurrente checkout creation fails | Payment `Failed`; the order stays `PendingPayment` and the customer may cancel and buy again |
| Database failure after saving the file | The service deletes the file (compensation); a job removes orphan files |
| File with a misleading extension | Validated by magic bytes, not by name or client content type |
| Deposit close to the delivery date | `FU_Payments_DepositWindow` caps it or does not offer it |
