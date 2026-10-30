/* =====================================================================
   Objeto   : dbo.SP_Inventory_ReserveStock
   Version  : 1.0.0
   Cambio   : Primera versión: reserva atómica de todas las líneas de un carrito, sin sobreventa (ADR-0007)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400 parámetro inválido, 50404 carrito inexistente o ajeno, 50409 unidades agotadas,
              50422 carrito vacío o ventana de reserva sin configurar. Depende de R0110.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Inventory_ReserveStock
  @IDUser        INT,
  @IDCart        INT,
  -- El reloj entra como parámetro para que las pruebas sean deterministas; en producción lo envía el backend
  @Now           DATETIME2(3) = NULL,
  @IDReservation INT          OUTPUT,
  @ExpiresAt     DATETIME2(3) = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL OR @IDCart IS NULL
    THROW 50400, 'IDUser and IDCart are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @Minutes INT = (SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'ReservationMinutes');
  IF @Minutes IS NULL OR @Minutes <= 0
    THROW 50422, 'The reservation window is not configured.', 1;

  -- Si el llamador ya abrió una transacción (una prueba), esta forma parte de ella y no hace COMMIT propio
  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- 1. Pertenencia (anti-IDOR dentro de la base de datos). El bloqueo de la fila del carrito serializa las solicitudes
  --    del mismo carrito (doble clic, reintento): la segunda espera y ve la reserva de la primera. Los procedimientos
  --    que modifiquen las líneas del carrito deben tomar este mismo bloqueo para que el recuento de abajo sea estable.
  IF NOT EXISTS (
    SELECT 1 FROM dbo.Carts WITH (UPDLOCK, ROWLOCK)
    WHERE IDCart = @IDCart AND IDUser = @IDUser AND Status = N'Active'
  )
    THROW 50404, 'Cart not found.', 1;

  DECLARE @Lines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @IDCart);
  IF @Lines = 0
    THROW 50422, 'The cart is empty.', 1;

  -- 2. Bloqueo de las variantes SIEMPRE en orden ascendente de IDVariant: dos carritos con las mismas variantes en distinto
  --    orden no pueden esperarse en círculo, que era un deadlock real (60 carritos cruzados perdían 44). Incluye las de la
  --    reserva anterior del carrito, que se libera a continuación y tocaría variantes que quizá ya no están en el carrito.
  DECLARE @ToLock TABLE (IDVariant INT PRIMARY KEY);
  INSERT INTO @ToLock (IDVariant)
  SELECT IDVariant FROM dbo.CartItems WHERE IDCart = @IDCart
  UNION
  SELECT rl.IDVariant
  FROM dbo.ReservationLines AS rl
  JOIN dbo.Reservations AS r ON r.IDReservation = rl.IDReservation
  WHERE r.IDCart = @IDCart AND r.IDOrder IS NULL AND r.Status = N'Active';
  DECLARE @IDVariant INT = 0, @Locked INT;
  WHILE 1 = 1
  BEGIN
    SELECT TOP (1) @IDVariant = IDVariant FROM @ToLock WHERE IDVariant > @IDVariant ORDER BY IDVariant;
    IF @@ROWCOUNT = 0 BREAK;
    SELECT @Locked = IDVariant FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant;
  END;

  -- 3. Una reserva previa del mismo carrito (reintento del pago) se libera dentro de esta transacción
  EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @IDUser, @IDCart = @IDCart;

  -- 4. Un solo UPDATE condicional: o se aparta todo o no se aparta nada. UPDLOCK serializa a quienes compiten por la
  --    misma variante y el segundo evalúa la condición con el valor ya actualizado, así que no hay lectura obsoleta.
  --    CK_Variants_ReservedVsOnHand es la red de seguridad si algún procedimiento futuro se equivoca.
  UPDATE v
  SET ReservedStock = v.ReservedStock + ci.Quantity
  FROM dbo.Variants AS v WITH (UPDLOCK, ROWLOCK)
  JOIN dbo.CartItems AS ci ON ci.IDVariant = v.IDVariant
  WHERE ci.IDCart = @IDCart
    AND v.IsActive = 1
    AND v.OnHandStock - v.ReservedStock >= ci.Quantity;

  DECLARE @Reserved INT = @@ROWCOUNT;
  IF @Reserved <> @Lines
    THROW 50409, 'One or more units are no longer available.', 1;   -- XACT_ABORT deshace también las líneas ya apartadas

  SET @ExpiresAt = DATEADD(MINUTE, @Minutes, @Now);

  INSERT INTO dbo.Reservations (IDCart, IDUser, Status, CreatedAt, ExpiresAt)
  VALUES (@IDCart, @IDUser, N'Active', @Now, @ExpiresAt);
  SET @IDReservation = SCOPE_IDENTITY();

  INSERT INTO dbo.ReservationLines (IDReservation, IDVariant, Quantity)
  SELECT @IDReservation, IDVariant, Quantity FROM dbo.CartItems WHERE IDCart = @IDCart;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
