/* =====================================================================
   Objeto   : dbo.SP_Cart_RemoveCoupon
   Version  : 1.0.0
   Cambio   : Primera versión: quita el cupón del carrito del cliente; repetirlo no es un error
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Cart_RemoveCoupon
  @IDUser INT,
  @Now    DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL
    THROW 50400, 'IDUser is required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  -- Sin carrito o sin cupón el resultado final es el mismo que se pide: no es un error
  UPDATE dbo.Carts SET IDCoupon = NULL, LastActivityAt = @Now WHERE IDUser = @IDUser AND Status = N'Active' AND IDCoupon IS NOT NULL;
END;
GO
