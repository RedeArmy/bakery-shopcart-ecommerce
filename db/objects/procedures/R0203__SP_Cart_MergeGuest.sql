/* =====================================================================
   Objeto   : dbo.SP_Cart_MergeGuest
   Version  : 1.1.0
   Cambio   : La fusión respeta la existencia disponible (RF-04): ajusta las cantidades en lugar de superarla
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Compatible: con existencia suficiente el resultado es el de 1.0.0. Nunca lanza por falta de existencia, porque
              se ejecuta al iniciar sesión y no puede bloquearla. Es idempotente. Errores: 50400.
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

    -- La existencia pudo bajar desde que el visitante agregó: lo que ya no alcanza se ajusta y lo que se agotó se retira
    DELETE ci FROM dbo.CartItems AS ci CROSS APPLY dbo.FU_Cart_AvailableStock(ci.IDCart, ci.IDVariant) AS s
    WHERE ci.IDCart = @IDGuestCart AND s.Available < 1;
    UPDATE ci SET Quantity = s.Available FROM dbo.CartItems AS ci CROSS APPLY dbo.FU_Cart_AvailableStock(ci.IDCart, ci.IDVariant) AS s
    WHERE ci.IDCart = @IDGuestCart AND ci.Quantity > s.Available;
  END
  ELSE
  BEGIN
    -- Los dos carritos se bloquean en orden de identificador: dos fusiones cruzadas no pueden esperarse en círculo
    SELECT @Locked = IDCart FROM dbo.Carts WITH (UPDLOCK, ROWLOCK) WHERE IDCart = CASE WHEN @IDGuestCart < @IDUserCart THEN @IDGuestCart ELSE @IDUserCart END;
    SELECT @Locked = IDCart FROM dbo.Carts WITH (UPDLOCK, ROWLOCK) WHERE IDCart = CASE WHEN @IDGuestCart < @IDUserCart THEN @IDUserCart ELSE @IDGuestCart END;

    -- Las cantidades se suman con tope de 99 (el máximo de CK_CartItems_Quantity) y de la existencia disponible; la inscripción
    -- del cliente prevalece. Nunca se baja lo que el cliente ya tenía: si su cantidad ya superaba la existencia se conserva y
    -- el carrito la marca. Esto corre al iniciar sesión, así que ajusta en silencio en lugar de lanzar un error.
    UPDATE u
    SET Quantity = CASE WHEN m.Summed <= s.Available THEN m.Summed WHEN s.Available > u.Quantity THEN s.Available ELSE u.Quantity END,
        Inscription = ISNULL(u.Inscription, g.Inscription)
    FROM dbo.CartItems AS u
    JOIN dbo.CartItems AS g ON g.IDVariant = u.IDVariant
    CROSS APPLY dbo.FU_Cart_AvailableStock(u.IDCart, u.IDVariant) AS s
    CROSS APPLY (SELECT Summed = CASE WHEN u.Quantity + g.Quantity > 99 THEN 99 ELSE u.Quantity + g.Quantity END) AS m
    WHERE u.IDCart = @IDUserCart AND g.IDCart = @IDGuestCart;

    -- Una línea nueva entra con lo que alcance; si la variante se agotó, no entra (agregarla a mano también se rechazaría)
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity, Inscription)
    SELECT @IDUserCart, g.IDVariant, CASE WHEN g.Quantity > s.Available THEN s.Available ELSE g.Quantity END, g.Inscription
    FROM dbo.CartItems AS g
    CROSS APPLY dbo.FU_Cart_AvailableStock(@IDUserCart, g.IDVariant) AS s
    WHERE g.IDCart = @IDGuestCart AND s.Available >= 1
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
