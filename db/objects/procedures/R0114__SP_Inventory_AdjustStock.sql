/* =====================================================================
   Objeto   : dbo.SP_Inventory_AdjustStock
   Version  : 1.0.0
   Cambio   : Primera versión: ajuste de la existencia física al conteo real, con un movimiento compensatorio
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @NewOnHand es el conteo real, no un incremento. Errores: 50400, 50404 variante inexistente,
              50422 actor sin permiso o conteo por debajo de lo reservado.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Inventory_AdjustStock
  @IDActor    INT,
  @IDVariant  INT,
  @NewOnHand  INT,
  @Reason     NVARCHAR(250),
  @Now        DATETIME2(3) = NULL,
  -- NULL cuando el conteo coincide con la existencia y no hace falta ningún movimiento
  @IDMovement BIGINT       = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Reason = LTRIM(RTRIM(@Reason));

  IF @IDActor IS NULL OR @IDVariant IS NULL OR @NewOnHand IS NULL OR @NewOnHand < 0 OR ISNULL(@Reason, N'') = N''
    THROW 50400, 'IDActor, IDVariant, a NewOnHand of zero or more and a Reason are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @IDMovement = NULL;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can change the stock.', 1;

  DECLARE @OnHand INT, @Reserved INT;
  SELECT @OnHand = OnHandStock, @Reserved = ReservedStock FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant;
  IF @OnHand IS NULL
    THROW 50404, 'Variant not found.', 1;

  -- Bajar la existencia por debajo de lo ya reservado dejaría compromisos que no se pueden cumplir; hay que liberar las
  -- reservas o esperar a que se paguen. CK_Variants_ReservedVsOnHand lo impediría de todos modos, pero con un error 547.
  IF @NewOnHand < @Reserved
    THROW 50422, 'The stock cannot be set below the reserved units.', 1;

  DECLARE @Delta INT = @NewOnHand - @OnHand;

  -- Un conteo que coincide con la existencia no es un cambio: no deja movimiento ni entrada en la bitácora
  IF @Delta <> 0
  BEGIN
    UPDATE dbo.Variants SET OnHandStock = @NewOnHand WHERE IDVariant = @IDVariant;

    -- El ajuste lleva signo: positivo si el conteo encontró más de lo esperado, negativo si encontró menos
    INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser, CreatedAt)
    VALUES (@IDVariant, 3, @Delta, @NewOnHand, @Reason, @IDActor, @Now);
    SET @IDMovement = SCOPE_IDENTITY();

    DECLARE @Previous NVARCHAR(100) = CONCAT(N'{"OnHandStock":', @OnHand, N'}');
    DECLARE @New NVARCHAR(100) = CONCAT(N'{"OnHandStock":', @NewOnHand, N'}');
    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDVariant AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Stock', @EntityName = N'Variant', @EntityKey = @EntityKey, @Action = N'Update',
         @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
