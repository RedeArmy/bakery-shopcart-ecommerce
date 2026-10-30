/* =====================================================================
   Objeto   : dbo.SP_Cart_Get
   Version  : 1.0.0
   Cambio   : Primera versión: carrito activo con sus líneas, su disponibilidad y sus totales calculados
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una sola fila; IDCart es NULL si todavía no hay carrito. Lines es un arreglo JSON. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Cart_Get
  @IDUser     INT              = NULL,
  @GuestToken UNIQUEIDENTIFIER = NULL,
  @Now        DATETIME2(3)     = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  -- Un cliente con sesión se identifica por su cuenta y un visitante por su token; nunca por los dos a la vez
  IF (@IDUser IS NULL AND @GuestToken IS NULL) OR (@IDUser IS NOT NULL AND @GuestToken IS NOT NULL)
    THROW 50400, 'Provide either IDUser or GuestToken.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @IDCart INT = (
    SELECT TOP (1) IDCart FROM dbo.Carts
    WHERE Status = N'Active' AND ((@IDUser IS NOT NULL AND IDUser = @IDUser) OR (@IDUser IS NULL AND GuestToken = @GuestToken))
  );

  -- Sin carrito no se crea nada: una consulta no debe llenar la tabla de carritos vacíos de visitantes que solo miran.
  -- Se devuelve igual una fila, con IDCart NULL y los totales en cero, para que el backend no tenga un caso aparte.
  SELECT IDCart = @IDCart,
         CouponCode = cp.Code,
         CouponReason = t.CouponReason,
         Subtotal = ISNULL(st.Text, N'0.00'), Discount = ISNULL(dt.Text, N'0.00'), Shipping = ISNULL(sh.Text, N'0.00'),
         Total = ISNULL(tt.Text, N'0.00'), Vat = ISNULL(vt.Text, N'0.00'), TaxableBase = ISNULL(bt.Text, N'0.00'),
         ItemCount = ISNULL((SELECT SUM(Quantity) FROM dbo.CartItems WHERE IDCart = @IDCart), 0),
         -- Un carrito con una línea que ya no se puede comprar no puede pasar a la reserva: el panel lo avisa antes
         HasUnavailableLines = CAST(CASE WHEN EXISTS (
               SELECT 1 FROM dbo.CartItems AS ci
               JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
               JOIN dbo.Products AS p ON p.IDProduct = v.IDProduct
               WHERE ci.IDCart = @IDCart AND (v.IsActive = 0 OR p.IsActive = 0 OR v.OnHandStock - v.ReservedStock < ci.Quantity)
             ) THEN 1 ELSE 0 END AS BIT),
         Lines = ISNULL((
           SELECT ci.IDCartItem, ci.IDVariant, v.SKU, ProductName = p.Name, ci.Quantity, ci.Inscription,
                  UnitPrice = CAST(v.Price AS VARCHAR(25)), LineTotal = CAST(v.Price * ci.Quantity AS VARCHAR(25)),
                  Available = v.OnHandStock - v.ReservedStock,
                  IsAvailable = CAST(CASE WHEN v.IsActive = 1 AND p.IsActive = 1 THEN 1 ELSE 0 END AS BIT)
           FROM dbo.CartItems AS ci
           JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
           JOIN dbo.Products AS p ON p.IDProduct = v.IDProduct
           WHERE ci.IDCart = @IDCart
           ORDER BY ci.IDCartItem
           FOR JSON PATH), N'[]')
  FROM (SELECT One = 1) AS x
  LEFT JOIN dbo.Carts AS c ON c.IDCart = @IDCart
  LEFT JOIN dbo.Coupons AS cp ON cp.IDCoupon = c.IDCoupon
  OUTER APPLY dbo.FU_Cart_Totals(@IDCart, @Now) AS t
  OUTER APPLY dbo.FU_Money_CentsToText(t.SubtotalCents) AS st
  OUTER APPLY dbo.FU_Money_CentsToText(t.DiscountCents) AS dt
  OUTER APPLY dbo.FU_Money_CentsToText(t.ShippingCents) AS sh
  OUTER APPLY dbo.FU_Money_CentsToText(t.TotalCents) AS tt
  OUTER APPLY dbo.FU_Money_CentsToText(t.VatCents) AS vt
  OUTER APPLY dbo.FU_Money_CentsToText(t.BaseCents) AS bt;
END;
GO
