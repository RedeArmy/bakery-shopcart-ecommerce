/* =====================================================================
   Objeto   : dbo.SP_Coupons_Validate
   Version  : 1.0.0
   Cambio   : Primera versión: dice si un código se puede aplicar al carrito del cliente y cuánto descontaría, sin aplicarlo
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila: Reason (Valid u otro motivo) y Discount como texto. No lanza error por un cupón inválido: el
              motivo es el resultado. Errores: 50400, 50404 sin carrito.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Coupons_Validate
  @IDUser INT,
  @Code   NVARCHAR(30),
  @Now    DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Code = UPPER(LTRIM(RTRIM(@Code)));

  IF @IDUser IS NULL OR ISNULL(@Code, N'') = N''
    THROW 50400, 'IDUser and Code are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser AND Status = N'Active');
  IF @IDCart IS NULL
    THROW 50404, 'Cart not found.', 1;

  DECLARE @IDCoupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = @Code);
  DECLARE @Eligible BIGINT = ISNULL((SELECT MAX(EligibleCents) FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @IDCoupon)), 0);
  DECLARE @Reason VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@IDCoupon, @IDUser, @Eligible, @Now));

  -- El motivo es el resultado y no un error: es la consulta que el panel hace mientras el cliente escribe el código, y
  -- un cupón inválido es lo habitual, no una excepción. El descuento solo se informa si el cupón es válido.
  SELECT IDCoupon = @IDCoupon, Code = @Code, Reason = @Reason,
         Discount = d.Text
  FROM (SELECT Cents = CASE WHEN @Reason = 'Valid' THEN ISNULL((SELECT MAX(TotalDiscountCents) FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @IDCoupon)), 0) ELSE 0 END) AS x
  CROSS APPLY dbo.FU_Money_CentsToText(x.Cents) AS d;
END;
GO
