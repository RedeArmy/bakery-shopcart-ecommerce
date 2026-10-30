/* =====================================================================
   Objeto   : dbo.SP_Cart_SetItemQuantity
   Version  : 1.1.0
   Cambio   : Rechaza una cantidad mayor que la existencia disponible (RF-04); antes solo lo detectaba la reserva del checkout
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Compatible: las llamadas con cantidad dentro de la existencia siguen igual. Errores: 50400, 50404 variante inexistente,
              50409 otra solicitud crea el carrito o INSUFFICIENT_STOCK (cantidad sobre la existencia, como en el checkout),
              50422 variante no disponible.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Cart_SetItemQuantity
  @IDUser      INT              = NULL,
  @GuestToken  UNIQUEIDENTIFIER = NULL,
  @IDVariant   INT,
  @Quantity    INT,
  @Inscription NVARCHAR(60)     = NULL,
  @Now         DATETIME2(3)     = NULL,
  @IDCart      INT              OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Inscription = NULLIF(LTRIM(RTRIM(@Inscription)), N'');

  IF (@IDUser IS NULL AND @GuestToken IS NULL) OR (@IDUser IS NOT NULL AND @GuestToken IS NOT NULL)
    THROW 50400, 'Provide either IDUser or GuestToken.', 1;
  IF @IDVariant IS NULL OR @Quantity IS NULL OR @Quantity < 1 OR @Quantity > 99
    THROW 50400, 'IDVariant and a Quantity between 1 and 99 are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  DECLARE @IsAvailable BIT = (SELECT IsAvailable FROM dbo.FU_Catalogue_CurrentPrice(@IDVariant));
  IF @IsAvailable IS NULL
    THROW 50404, 'Variant not found.', 1;
  IF @IsAvailable = 0
    THROW 50422, 'The variant is not available.', 1;

  SET @IDCart = (
    SELECT TOP (1) IDCart FROM dbo.Carts
    WHERE Status = N'Active' AND ((@IDUser IS NOT NULL AND IDUser = @IDUser) OR (@IDUser IS NULL AND GuestToken = @GuestToken))
  );

  -- La existencia disponible es lo que no está apartado más lo que la reserva vigente de este mismo carrito ya aparta para
  -- esta variante: sin sumarlo, quien reservó 3 de 3 no podría ni repetir la misma cantidad. Se comprueba antes de crear el
  -- carrito, para que un rechazo no deje un carrito vacío si quien llama ya abrió una transacción; la reserva del checkout
  -- sigue siendo la garantía final contra la sobreventa.
  DECLARE @Available INT = (
    SELECT v.OnHandStock - v.ReservedStock + ISNULL(
             (SELECT SUM(rl.Quantity)
              FROM dbo.Reservations AS r
              JOIN dbo.ReservationLines AS rl ON rl.IDReservation = r.IDReservation
              WHERE r.IDCart = @IDCart AND r.Status = N'Active' AND rl.IDVariant = v.IDVariant), 0)
    FROM dbo.Variants AS v WHERE v.IDVariant = @IDVariant
  );
  IF @Quantity > @Available
  BEGIN
    -- El código estable viaja en el mensaje para que la API lo exponga tal cual (el frontend lo traduce)
    DECLARE @Message NVARCHAR(200) = CONCAT(N'INSUFFICIENT_STOCK: Only ', IIF(@Available < 0, 0, @Available), N' units are available.');
    THROW 50409, @Message, 1;
  END;

  IF @IDCart IS NULL
  BEGIN
    -- Dos solicitudes simultáneas que crean el primer carrito chocarían con el índice único: un bloqueo de aplicación las
    -- serializa y la segunda encuentra el carrito de la primera. Un error 2627 dentro de la transacción la dejaría inservible.
    DECLARE @Resource NVARCHAR(100) = CASE WHEN @IDUser IS NOT NULL THEN CONCAT(N'Cart:User:', @IDUser) ELSE CONCAT(N'Cart:Guest:', CAST(@GuestToken AS NVARCHAR(36))) END;
    DECLARE @LockResult INT;
    EXEC @LockResult = sp_getapplock @Resource = @Resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 5000;
    IF @LockResult < 0
      THROW 50409, 'The cart is being created by another request; retry.', 1;

    SET @IDCart = (
      SELECT TOP (1) IDCart FROM dbo.Carts
      WHERE Status = N'Active' AND ((@IDUser IS NOT NULL AND IDUser = @IDUser) OR (@IDUser IS NULL AND GuestToken = @GuestToken))
    );
    IF @IDCart IS NULL
    BEGIN
      INSERT INTO dbo.Carts (IDUser, GuestToken, Status, CreatedAt, LastActivityAt) VALUES (@IDUser, @GuestToken, N'Active', @Now, @Now);
      SET @IDCart = SCOPE_IDENTITY();
    END;
  END;

  -- El mismo bloqueo de fila del carrito que toma SP_Inventory_ReserveStock: editar las líneas y reservar no se cruzan
  DECLARE @Locked INT = (SELECT IDCart FROM dbo.Carts WITH (UPDLOCK, ROWLOCK) WHERE IDCart = @IDCart);

  -- Cantidad absoluta: repetir la solicitud deja el mismo estado y no necesita llave de idempotencia (ADR-0013)
  UPDATE dbo.CartItems SET Quantity = @Quantity, Inscription = @Inscription WHERE IDCart = @IDCart AND IDVariant = @IDVariant;
  IF @@ROWCOUNT = 0
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity, Inscription) VALUES (@IDCart, @IDVariant, @Quantity, @Inscription);

  UPDATE dbo.Carts SET LastActivityAt = @Now WHERE IDCart = @IDCart;

  -- Una reserva activa describe el carrito tal como estaba: al cambiarlo deja de ser válida y se libera, para no retener
  -- unidades que el cliente ya no quiere ni dejar sin reservar las nuevas
  IF @IDUser IS NOT NULL
    EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @IDUser, @IDCart = @IDCart;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
