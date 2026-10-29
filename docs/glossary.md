# Glossary: Spanish design terms ↔ British English code

The design document (`docs/design/source/DISENO_SHOPCART_v3.md`) is written in Spanish. Code, database objects, API paths and documents use the British English names in the right-hand column (ADR-0024). Extend this table whenever you meet a new term.

## Domain terms

| Spanish (design v3) | British English (code, DB, API) |
|---|---|
| Pedido / PedidoDetalle | Order / OrderLine |
| Carrito / CarritoItem | Cart / CartItem |
| Producto / Variante / Categoría / Atributo | Product / Variant / Category / Attribute |
| Existencia / ExistenciaReservada | OnHandStock / ReservedStock |
| Reserva / ReservaDetalle | Reservation / ReservationLine |
| Kardex / Movimiento de inventario | InventoryMovement |
| Cupón / CuponUsos | Coupon / CouponUsages |
| Dirección | Address |
| Pago / Intento de pago | Payment / PaymentAttempt |
| Depósito bancario | BankDeposit (method code `BANK_DEPOSIT`) |
| Tarjeta | Card (method code `CARD`) |
| Comprobante | PaymentProof |
| Cuenta bancaria | BankAccount |
| Devolución / Reembolso | Return / Refund |
| Libro de movimientos financieros | FinancialMovements (the financial ledger) |
| Conciliación | Reconciliation |
| Bitácora | AuditLog |
| Solicitud idempotente | IdempotentRequest |
| Configuración | Configuration |
| Cliente / Administrador / Operador | Customer / Administrator / Operator |
| Días de anticipación | LeadTimeDays |
| Ventana de depósito | DepositWindow |
| División half-even | HalfEvenDivision |
| Mayor resto | LargestRemainder |
| Centavos | Cents |

## Order states

| Spanish | British English |
|---|---|
| PendientePago | PendingPayment |
| Pagado | Paid |
| EnPreparación | InPreparation |
| Despachado | Dispatched |
| Entregado | Delivered |
| Cancelado | Cancelled |
| DevoluciónParcial | PartiallyReturned |
| Devuelto | Returned |

## Payment states

| Spanish | British English |
|---|---|
| Pendiente | Pending |
| EnRevisión | UnderReview |
| Aprobado | Approved |
| Rechazado | Rejected |
| Fallido | Failed |
| Expirado | Expired |
| Reembolsado | Refunded |
| Cancelado | Cancelled |

## Other state values

| Spanish | British English |
|---|---|
| Activo / Convertido / Descartado (cart) | Active / Converted / Discarded |
| Activa / Consumida / Liberada / Vencida (reservation) | Active / Consumed / Released / Expired |
| Porcentaje / MontoFijo (coupon type) | Percentage / FixedAmount |
| Monetaria / Ahorro (account type) | Checking / Savings |
| Entrada / Salida / Ajuste / Devolución (movement type) | Entry / Exit / Adjustment / Return |
| Cobro / Reembolso / Comisión (ledger type) | Charge / Refund / Fee |
| Total / Parcial (return type) | Full / Partial |

## Columns and keys

| Spanish | British English |
|---|---|
| IDUsuario, IDRol, IDCategoria, IDProducto, IDVariante | IDUser, IDRole, IDCategory, IDProduct, IDVariant |
| IDCarrito, IDPedido, IDPedidoDetalle, IDCupon, IDReserva | IDCart, IDOrder, IDOrderLine, IDCoupon, IDReservation |
| IDPago, IDMetodoPago, IDEstadoPago, IDEstadoPedido | IDPayment, IDPaymentMethod, IDPaymentStatus, IDOrderStatus |
| IDComprobante, IDCuentaBancaria, IDDevolucion, IDReembolso | IDPaymentProof, IDBankAccount, IDReturn, IDRefund |
| NumeroPedido | OrderNumber |
| FechaCreacion, FechaPago, FechaExpiracion | CreatedAt, PaidAt, ExpiresAt |
| Activo / Activa | IsActive |
| Precio, Cantidad, Motivo | Price, Quantity, Reason |
| Subtotal, Descuento, Envio, Total, BaseImponible, IVA | Subtotal, Discount, Shipping, Total, TaxableBase, Vat |
| LlaveIdempotencia | IdempotencyKey |
| TokenInvitado | GuestToken |
| IntentosFallidos, BloqueadoHasta | FailedAttempts, LockedUntil |
| NumeroReferencia, MontoDepositado | ReferenceNumber, DepositedAmount |
| Dedicatoria / FechaEntregaSolicitada | Inscription / RequestedDeliveryDate |

## Database objects

| Spanish | British English |
|---|---|
| `FU_Dinero_DivisionMitadPar` | `FU_Money_HalfEvenDivision` |
| `FU_Pagos_VentanaDeposito` | `FU_Payments_DepositWindow` |
| `FU_Catalogo_PrecioVigente` | `FU_Catalogue_CurrentPrice` |
| `FU_Cupones_CalculoDescuento` | `FU_Coupons_DiscountCalculation` |
| `FU_Pedidos_MontoReembolsable` | `FU_Orders_RefundableAmount` |
| `VW_Conciliacion_Montos` | `VW_Reconciliation_Amounts` |
| `VW_Inventario_Conciliacion` | `VW_Inventory_Reconciliation` |
| `SP_Pedidos_CrearPedido` | `SP_Orders_CreateOrder` |
| `SP_Pagos_ConfirmarPago` | `SP_Payments_ConfirmPayment` |
| `SP_Inventario_ReservarExistencia` | `SP_Inventory_ReserveStock` |
| `HistorialDDL`, `VersionesObjetos` | `DdlHistory`, `ObjectVersions` |

## Error codes

| Spanish | British English |
|---|---|
| `METODO_PAGO_NO_DISPONIBLE` | `PAYMENT_METHOD_UNAVAILABLE` |
| `DEPOSITO_NO_DISPONIBLE_PARA_FECHA` | `DEPOSIT_UNAVAILABLE_FOR_DATE` |
| `COMPROBANTE_REUTILIZADO` | `PAYMENT_PROOF_REUSED` |
| `MONTO_NO_COINCIDE` | `AMOUNT_MISMATCH` |
| `STOCK_INSUFICIENTE` | `INSUFFICIENT_STOCK` |
| `PASARELA_ERROR` | `GATEWAY_ERROR` |

The full error table is in [API conventions](api/conventions.md).
