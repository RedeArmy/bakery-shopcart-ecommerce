/* =====================================================================
   Objeto   : dbo.SP_Cart_MergeGuest
   Version  : 1.0.0
   Cambio   : Primera versión: al iniciar sesión, pasa el carrito de visitante al carrito del cliente
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Es idempotente: repetirla no cambia nada. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Cart_MergeGuest
  @IDUser     INT,
  @GuestToken UNIQUEIDENTIFIER,
  @Now        DATETIME2(3) = NULL,
  -- El carrito del cliente tras la fusión; NULL si ninguno de los dos existía
  @IDCart     INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL OR @GuestToken IS NULL
    THROW 50400, 'IDUser and GuestToken are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  DECLARE @IDGuestCart INT = (SELECT IDCart FROM dbo.Carts WHERE GuestToken = @GuestToken AND Status = N'Active');
  DECLARE @IDUserCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser AND Status = N'Active');

  DECLARE @Locked INT;

  IF @IDGuestCart IS NULL
    -- No hay carrito de visitante (ya se fusionó, o nunca existió): no hay nada que hacer
    SET @IDCart = @IDUserCart;
  ELSE IF @IDUserCart IS NULL
  BEGIN
    -- El cliente aún no tenía carrito: el del visitante pasa a ser suyo, con su token retirado
    SELECT @Locked = IDCart FROM dbo.Carts WITH (UPDLOCK, ROWLOCK) WHERE IDCart = @IDGuestCart;
    UPDATE dbo.Carts SET IDUser = @IDUser, GuestToken = NULL, LastActivityAt = @Now WHERE IDCart = @IDGuestCart;
    SET @IDCart = @IDGuestCart;
  END
  ELSE
  BEGIN
    -- Los dos carritos se bloquean en orden de identificador: dos fusiones cruzadas no pueden esperarse en círculo
    SELECT @Locked = IDCart FROM dbo.Carts WITH (UPDLOCK, ROWLOCK) WHERE IDCart = CASE WHEN @IDGuestCart < @IDUserCart THEN @IDGuestCart ELSE @IDUserCart END;
    SELECT @Locked = IDCart FROM dbo.Carts WITH (UPDLOCK, ROWLOCK) WHERE IDCart = CASE WHEN @IDGuestCart < @IDUserCart THEN @IDUserCart ELSE @IDGuestCart END;

    -- Las cantidades se suman con tope de 99 (el máximo de CK_CartItems_Quantity); la inscripción del cliente prevalece
    UPDATE u
    SET Quantity = CASE WHEN u.Quantity + g.Quantity > 99 THEN 99 ELSE u.Quantity + g.Quantity END,
        Inscription = ISNULL(u.Inscription, g.Inscription)
    FROM dbo.CartItems AS u
    JOIN dbo.CartItems AS g ON g.IDVariant = u.IDVariant
    WHERE u.IDCart = @IDUserCart AND g.IDCart = @IDGuestCart;

    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity, Inscription)
    SELECT @IDUserCart, g.IDVariant, g.Quantity, g.Inscription
    FROM dbo.CartItems AS g
    WHERE g.IDCart = @IDGuestCart
      AND NOT EXISTS (SELECT 1 FROM dbo.CartItems AS u WHERE u.IDCart = @IDUserCart AND u.IDVariant = g.IDVariant);

    -- El carrito del visitante se descarta, no se borra: conserva su token, así que ese token ya no se puede reutilizar
    DELETE FROM dbo.CartItems WHERE IDCart = @IDGuestCart;
    UPDATE dbo.Carts SET Status = N'Discarded', LastActivityAt = @Now WHERE IDCart = @IDGuestCart;
    UPDATE dbo.Carts SET LastActivityAt = @Now WHERE IDCart = @IDUserCart;

    -- La reserva activa del carrito del cliente describe un contenido que acaba de cambiar
    EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @IDUser, @IDCart = @IDUserCart;
    SET @IDCart = @IDUserCart;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
