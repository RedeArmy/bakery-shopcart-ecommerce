/* =====================================================================
   Objeto   : dbo.SP_Retention_Purge
   Version  : 1.0.0
   Cambio   : Primera versión: purga por lotes de las tablas que solo crecen (tokens de refresco, webhooks, carritos de
              visitante, reservas sin pedido e historial de DDL)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. La llama SP_Jobs_PurgeExpired, que ya toma el bloqueo de ejecución única. Los plazos salen de
              Configuration (S0006). No toca los libros inmutables (auditoría, inventario, dinero, historiales de estado):
              archivarlos es una decisión del negocio, no una purga. Errores: 50400 parámetros inválidos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Retention_Purge
  @Now                 DATETIME2(3) = NULL,
  @BatchSize           INT          = 1000,
  -- Tope de lotes por tabla y ejecución: con un atraso enorme el job termina y la siguiente ejecución continúa
  @MaxBatches          INT          = 50,
  @PurgedRefreshTokens INT          = NULL OUTPUT,
  @PurgedWebhooks      INT          = NULL OUTPUT,
  @PurgedGuestCarts    INT          = NULL OUTPUT,
  @PurgedReservations  INT          = NULL OUTPUT,
  @PurgedDdlHistory    INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @BatchSize < 1 OR @BatchSize > 10000 OR @MaxBatches < 1 OR @MaxBatches > 1000
    THROW 50400, 'BatchSize must be between 1 and 10000 and MaxBatches between 1 and 1000.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SELECT @PurgedRefreshTokens = 0, @PurgedWebhooks = 0, @PurgedGuestCarts = 0, @PurgedReservations = 0, @PurgedDdlHistory = 0;

  DECLARE @Deleted INT, @Batches INT;

  -- 1. Tokens de refresco, por familias enteras. Solo se borra una familia cuando TODOS sus tokens vencieron hace más de
  --    RetentionRefreshTokenDays: así nunca se pierde la detección de reutilización de un token todavía válido. Borrar tokens
  --    sueltos rompería la clave foránea IDReplacedBy, que apunta de cada token al que lo reemplazó. Dentro de una familia el
  --    reemplazante siempre tiene un identificador mayor, así que borrar en orden de identificador deja primero a quien
  --    referencia y después a quien es referenciado, también cuando una familia se reparte en varios lotes.
  DECLARE @TokenCutoff DATETIME2(3) = DATEADD(DAY, -(SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionRefreshTokenDays', 30)), @Now);
  DECLARE @Families TABLE (IDFamily UNIQUEIDENTIFIER NOT NULL PRIMARY KEY);
  INSERT INTO @Families (IDFamily)
  SELECT TOP (@BatchSize * @MaxBatches) IDFamily
  FROM dbo.RefreshTokens
  GROUP BY IDFamily
  HAVING MAX(ExpiresAt) < @TokenCutoff;

  SELECT @Deleted = 1, @Batches = 0;
  WHILE @Deleted > 0 AND @Batches < @MaxBatches
  BEGIN
    DELETE FROM dbo.RefreshTokens
    WHERE IDRefreshToken IN (
      SELECT TOP (@BatchSize) t.IDRefreshToken
      FROM dbo.RefreshTokens AS t
      WHERE t.IDFamily IN (SELECT IDFamily FROM @Families)
      ORDER BY t.IDRefreshToken);
    SELECT @Deleted = @@ROWCOUNT, @Batches += 1;
    SET @PurgedRefreshTokens += @Deleted;
  END;

  -- 2. Webhooks recibidos. La deduplicación solo necesita los recientes.
  DECLARE @WebhookCutoff DATETIME2(3) = DATEADD(DAY, -(SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionWebhookDays', 90)), @Now);
  SELECT @Deleted = 1, @Batches = 0;
  WHILE @Deleted > 0 AND @Batches < @MaxBatches
  BEGIN
    DELETE TOP (@BatchSize) FROM dbo.ReceivedWebhooks WHERE ReceivedAt < @WebhookCutoff;
    SELECT @Deleted = @@ROWCOUNT, @Batches += 1;
    SET @PurgedWebhooks += @Deleted;
  END;

  -- 3. Carritos de visitante sin actividad. Los carritos de clientes con cuenta no se purgan: tienen reservas y pedidos
  --    que los referencian. Un visitante no puede reservar, así que el carrito solo tiene líneas. La condición de fecha se
  --    repite al borrar: si el visitante volvió entre la selección y el borrado, su carrito se conserva.
  DECLARE @CartCutoff DATETIME2(3) = DATEADD(DAY, -(SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionGuestCartDays', 30)), @Now);
  DECLARE @Carts TABLE (IDCart INT NOT NULL PRIMARY KEY);
  SELECT @Deleted = 1, @Batches = 0;
  WHILE @Deleted > 0 AND @Batches < @MaxBatches
  BEGIN
    DELETE FROM @Carts;
    INSERT INTO @Carts (IDCart)
    SELECT TOP (@BatchSize) IDCart FROM dbo.Carts WHERE IDUser IS NULL AND LastActivityAt < @CartCutoff ORDER BY LastActivityAt;

    BEGIN TRANSACTION;
    DELETE ci FROM dbo.CartItems AS ci
    JOIN dbo.Carts AS c ON c.IDCart = ci.IDCart
    JOIN @Carts AS x ON x.IDCart = c.IDCart
    WHERE c.IDUser IS NULL AND c.LastActivityAt < @CartCutoff;
    DELETE c FROM dbo.Carts AS c
    JOIN @Carts AS x ON x.IDCart = c.IDCart
    WHERE c.IDUser IS NULL AND c.LastActivityAt < @CartCutoff;
    SELECT @Deleted = @@ROWCOUNT, @Batches += 1;
    COMMIT TRANSACTION;
    SET @PurgedGuestCarts += @Deleted;
  END;

  -- 4. Reservas liberadas o vencidas que nunca fueron un pedido. Las que tienen pedido se conservan: son parte de su historia.
  DECLARE @ReservationCutoff DATETIME2(3) = DATEADD(DAY, -(SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionReservationDays', 90)), @Now);
  DECLARE @Reservations TABLE (IDReservation INT NOT NULL PRIMARY KEY);
  SELECT @Deleted = 1, @Batches = 0;
  WHILE @Deleted > 0 AND @Batches < @MaxBatches
  BEGIN
    DELETE FROM @Reservations;
    INSERT INTO @Reservations (IDReservation)
    SELECT TOP (@BatchSize) IDReservation FROM dbo.Reservations
    WHERE Status IN (N'Released', N'Expired') AND IDOrder IS NULL AND ExpiresAt < @ReservationCutoff
    ORDER BY ExpiresAt;

    BEGIN TRANSACTION;
    DELETE rl FROM dbo.ReservationLines AS rl JOIN @Reservations AS x ON x.IDReservation = rl.IDReservation;
    DELETE r FROM dbo.Reservations AS r JOIN @Reservations AS x ON x.IDReservation = r.IDReservation
    WHERE r.Status IN (N'Released', N'Expired') AND r.IDOrder IS NULL;
    SELECT @Deleted = @@ROWCOUNT, @Batches += 1;
    COMMIT TRANSACTION;
    SET @PurgedReservations += @Deleted;
  END;

  -- 5. Historial de DDL, que se conserva más tiempo porque es la evidencia de los cambios de esquema.
  DECLARE @DdlCutoff DATETIME2(3) = DATEADD(DAY, -(SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionDdlHistoryDays', 365)), @Now);
  SELECT @Deleted = 1, @Batches = 0;
  WHILE @Deleted > 0 AND @Batches < @MaxBatches
  BEGIN
    DELETE TOP (@BatchSize) FROM dbo.DdlHistory WHERE CreatedAt < @DdlCutoff;
    SELECT @Deleted = @@ROWCOUNT, @Batches += 1;
    SET @PurgedDdlHistory += @Deleted;
  END;
END;
GO
