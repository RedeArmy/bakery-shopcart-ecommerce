# Stored procedure, view and function catalogue

Planned objects, grouped by module. Procedures marked **critical** need a tSQLt case and fail `npm run sql:coverage` without one. Status of every item is "planned" until the stage that builds it (see the [roadmap](../progress/ROADMAP.md)).

## Stored procedures

| Module | Procedures |
|---|---|
| Auth (RF-01) | `SP_Users_Register`, `SP_Users_GetByEmail`, `SP_Users_SetStatus`, `SP_Users_List`, `SP_Users_RecordFailedAttempt`, `SP_Tokens_Save`, `SP_Tokens_Rotate`, `SP_Tokens_RevokeFamily` |
| Catalogue (RF-02) | `SP_Categories_Create/Update/Deactivate/List`, `SP_Products_Create/Update/Deactivate/Get/Search`, `SP_Variants_Create/Update`, `SP_Variants_ChangePrice`, `SP_Addresses_List/Save` |
| Inventory (RF-03) | `SP_Inventory_RegisterEntry`, `SP_Inventory_AdjustStock`, **`SP_Inventory_ReserveStock`**, `SP_Inventory_ReleaseCartReservation`, **`SP_Inventory_ReleaseExpiredReservations`**, `SP_Inventory_GetLedger` |
| Cart (RF-04) | `SP_Cart_Get`, `SP_Cart_SetItemQuantity`, `SP_Cart_RemoveItem`, `SP_Cart_MergeGuest`, `SP_Cart_ApplyCoupon`, `SP_Cart_RemoveCoupon` |
| Coupons (RF-05) | `SP_Coupons_Create/Update/Deactivate/List`, `SP_Coupons_Validate` |
| Checkout (RF-06) | `SP_Idempotency_Begin/Complete/Fail/PurgeExpired`, **`SP_Orders_CreateOrder`** |
| Payments | `SP_BankAccounts_ListActive/Save`, `SP_Payments_GetMethodsAndWindow`, `SP_Payments_GetByOrder`, **`SP_Payments_ConfirmPayment`**, **`SP_Payments_RegisterProof`**, `SP_Payments_GetProof`, `SP_Payments_ListPendingDeposits`, **`SP_Payments_ApproveDeposit`**, **`SP_Payments_RejectDeposit`**, **`SP_Payments_ExpirePending`**, `SP_Payments_RegisterOrphanPayment`, `SP_Refunds_Register/List/Mark` |
| Payments, card (Phase 2) | `SP_Payments_RegisterExternalCheckout`, `SP_Payments_RegisterCreationFailure`, `SP_Payments_RegisterWebhookEvent`, `SP_Payments_ListPendingCardsToReconcile`, `SP_Webhooks_Purge` |
| Orders (RF-07) | **`SP_Orders_ChangeStatus`**, **`SP_Orders_Cancel`**, `SP_Orders_List`, `SP_Orders_GetDetail`, **`SP_Returns_Register`** |
| Dashboard (RF-08) | `SP_Dashboard_SalesByPeriod`, `SP_Dashboard_SalesByCategory`, `SP_Dashboard_TopTenProducts`, `SP_Dashboard_AbandonedCarts` |
| Audit (RF-09) | `SP_Audit_Record` (internal use), `SP_Audit_Query` |
| System | `SP_System_GetSchemaVersion` (built, `R0100`), `SP_System_ListObjectVersions` |

## Views and functions

| Object | Purpose |
|---|---|
| `VW_Inventory_Availability` | Available stock per variant (`OnHandStock − ReservedStock`) |
| `VW_Inventory_Reconciliation` | `OnHandStock` against `SUM(Quantity)` of the ledger. Must return no differences |
| `VW_Orders_History` | Order with its status history |
| `VW_Payments_PendingDeposits` | Review queue with age in hours |
| `VW_Payments_CardReconciliation` | Open card payments past their nominal expiry (Phase 2) |
| `VW_Reconciliation_Amounts` | Money checks from [money handling](money-handling.md#conservation-and-reconciliation). Must return zero rows |
| `VW_Dashboard_SalesByCategory` | Sales per category net of returns |
| `VW_Dashboard_TopTenProducts` | Best sellers (filtered by period in the procedure) |
| `VW_Carts_Abandoned` | Active carts with items and activity older than the configured threshold |
| `FU_Catalogue_CurrentPrice(@IDVariant)` | Current price |
| `FU_Coupons_DiscountCalculation(@IDCart, @IDCoupon)` | Discount per line with largest-remainder allocation |
| `FU_Money_HalfEvenDivision(@N, @D)` | **The only rounding policy** (half-even) |
| `FU_Payments_DepositWindow(@DeliveryDate, @LeadTimeDays)` | Deposit deadline: `MIN(24 h, delivery − lead time)` and minutes available |
| `FU_Dashboard_SalesByPeriod(@From, @To, @Granularity)` | Sales by day, week or month in GTQ and order count, by `PaidAt` |
| `FU_Orders_RefundableAmount(@IDOrderLine, @Quantity)` | Proportional refund closing exactly on the last unit |

## Critical procedures in brief

### `SP_Inventory_ReserveStock`: anti-oversell

```sql
CREATE OR ALTER PROCEDURE dbo.SP_Inventory_ReserveStock
  @IDUser INT, @IDCart INT, @IDReservation INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @Minutes INT = (SELECT CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = 'ReservationMinutes');
  BEGIN TRAN;
    -- 1. Pertenencia (anti-IDOR dentro de la base de datos)
    IF NOT EXISTS (SELECT 1 FROM dbo.Carts WHERE IDCart = @IDCart AND IDUser = @IDUser AND Status = 'Active')
      THROW 50404, 'Cart not found.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.CartItems WHERE IDCart = @IDCart)
      THROW 50422, 'The cart is empty.', 1;

    -- 2. Libera una reserva previa del mismo carrito (reintento de checkout)
    EXEC dbo.SP_Inventory_ReleaseCartReservation @IDCart = @IDCart;

    -- 3. Un solo UPDATE condicional: o se aparta todo o nada.
    --    UPDLOCK serializa a quienes compiten por la misma variante; el segundo reevalúa con el valor ya actualizado.
    UPDATE v SET ReservedStock = v.ReservedStock + ci.Quantity
    FROM dbo.Variants v WITH (UPDLOCK, ROWLOCK)
    JOIN dbo.CartItems ci ON ci.IDVariant = v.IDVariant
    WHERE ci.IDCart = @IDCart AND v.IsActive = 1
      AND (v.OnHandStock - v.ReservedStock) >= ci.Quantity;

    IF @@ROWCOUNT <> (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @IDCart)
      THROW 50409, 'One or more units are no longer available.', 1;   -- rollback total

    INSERT dbo.Reservations (IDCart, IDUser, Status, ExpiresAt)
      VALUES (@IDCart, @IDUser, 'Active', DATEADD(MINUTE, @Minutes, SYSUTCDATETIME()));
    SET @IDReservation = SCOPE_IDENTITY();
    INSERT dbo.ReservationLines (IDReservation, IDVariant, Quantity)
      SELECT @IDReservation, IDVariant, Quantity FROM dbo.CartItems WHERE IDCart = @IDCart;
  COMMIT;
END;
```

The `CK_Variants_ReservedVsOnHand` check is the safety net if a future procedure is faulty. Deadlocks between multi-item carts are mitigated by the set-based update and by the backend retry on error 1205.

### `SP_Orders_CreateOrder`: atomic, born as `PendingPayment`

One transaction (`XACT_ABORT ON`):

1. Validate the reservation is `Active`, not expired and owned by the user (409 if expired).
2. Validate the address is the user's and `RequestedDeliveryDate >= today + MAX(LeadTimeDays)` of the products.
3. Recompute amounts from `FU_Catalogue_CurrentPrice` and `FU_Coupons_DiscountCalculation` in integer cents. **The backend sends no amounts.**
4. **Concurrent coupon:** conditional `UPDATE` of `UsageCount` (`WHERE UsageCount < TotalUsageLimit`); zero rows affected raises 409. The per-customer limit is validated with `sp_getapplock('Coupon:<id>:<user>')` and a `COUNT` over `CouponUsages WHERE IsVoided = 0`.
5. Insert `Orders` in `PendingPayment` with total `MAX(0, …) + shipping`, and `OrderLines` with snapshots and largest-remainder discount allocation.
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

### Expiry (job every 60 s with `sp_getapplock`)

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
