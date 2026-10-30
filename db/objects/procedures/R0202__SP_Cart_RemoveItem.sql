/* =====================================================================
   Objeto   : dbo.SP_Cart_RemoveItem
   Version  : 1.0.0
   Cambio   : Primera versión: quita una variante del carrito; repetirlo no es un error
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Cart_RemoveItem
  @IDUser     INT              = NULL,
  @GuestToken UNIQUEIDENTIFIER = NULL,
  @IDVariant  INT,
  @Now        DATETIME2(3)     = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF (@IDUser IS NULL AND @GuestToken IS NULL) OR (@IDUser IS NOT NULL AND @GuestToken IS NOT NULL)
    THROW 50400, 'Provide either IDUser or GuestToken.', 1;
  IF @IDVariant IS NULL
    THROW 50400, 'IDVariant is required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  DECLARE @IDCart INT = (
    SELECT TOP (1) IDCart FROM dbo.Carts WITH (UPDLOCK, ROWLOCK)
    WHERE Status = N'Active' AND ((@IDUser IS NOT NULL AND IDUser = @IDUser) OR (@IDUser IS NULL AND GuestToken = @GuestToken))
  );

  -- Quitar algo que no está, o de un carrito que no existe, deja el mismo estado final: no es un error (ADR-0013)
  IF @IDCart IS NOT NULL
  BEGIN
    DELETE FROM dbo.CartItems WHERE IDCart = @IDCart AND IDVariant = @IDVariant;

    IF @@ROWCOUNT > 0
    BEGIN
      UPDATE dbo.Carts SET LastActivityAt = @Now WHERE IDCart = @IDCart;
      IF @IDUser IS NOT NULL
        EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @IDUser, @IDCart = @IDCart;
    END;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
