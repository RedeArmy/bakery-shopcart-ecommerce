/* =====================================================================
   Objeto   : dbo.SP_Cart_ApplyCoupon
   Version  : 1.0.0
   Cambio   : Primera versión: aplica un cupón al carrito del cliente si hoy es válido para él
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un cupón por carrito: aplicar otro reemplaza al anterior. Errores: 50400, 50404 sin carrito o cupón
              inexistente, 50409 cupón agotado, 50422 el resto de motivos. El mensaje empieza por el código de la API.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Cart_ApplyCoupon
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

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- Los cupones son de clientes con sesión: el límite por cliente necesita saber quién es
  DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WITH (UPDLOCK, ROWLOCK) WHERE IDUser = @IDUser AND Status = N'Active');
  IF @IDCart IS NULL
    THROW 50404, 'Cart not found.', 1;
  IF NOT EXISTS (SELECT 1 FROM dbo.CartItems WHERE IDCart = @IDCart)
    THROW 50422, 'The cart is empty.', 1;

  DECLARE @IDCoupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = @Code);
  DECLARE @Eligible BIGINT = ISNULL((SELECT MAX(EligibleCents) FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @IDCoupon)), 0);
  DECLARE @Reason VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@IDCoupon, @IDUser, @Eligible, @Now));

  IF @Reason <> 'Valid'
  BEGIN
    DECLARE @ErrorNumber INT, @Message NVARCHAR(200);
    SELECT @ErrorNumber = ErrorNumber, @Message = Message FROM dbo.FU_Coupons_Rejection(@Reason);
    THROW @ErrorNumber, @Message, 1;
  END;

  UPDATE dbo.Carts SET IDCoupon = @IDCoupon, LastActivityAt = @Now WHERE IDCart = @IDCart;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
