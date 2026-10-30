/* =====================================================================
   Objeto   : dbo.SP_Inventory_RegisterEntry
   Version  : 1.0.0
   Cambio   : Primera versión: entrada de mercadería, con su movimiento en el libro de inventario
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 variante inexistente, 50422 actor sin permiso o existencia fuera de rango.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Inventory_RegisterEntry
  @IDActor    INT,
  @IDVariant  INT,
  @Quantity   INT,
  @Reason     NVARCHAR(250),
  @Now        DATETIME2(3) = NULL,
  @IDMovement BIGINT       OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Reason = LTRIM(RTRIM(@Reason));

  IF @IDActor IS NULL OR @IDVariant IS NULL OR @Quantity IS NULL OR @Quantity <= 0 OR ISNULL(@Reason, N'') = N''
    THROW 50400, 'IDActor, IDVariant, a Quantity greater than zero and a Reason are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can change the stock.', 1;

  -- El bloqueo sobre la variante serializa las entradas simultáneas: cada una lee el saldo que dejó la anterior, así que
  -- el saldo resultante del libro es siempre consecutivo y nunca se pierde una unidad
  DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant);
  IF @OnHand IS NULL
    THROW 50404, 'Variant not found.', 1;

  IF CAST(@OnHand AS BIGINT) + @Quantity > 2147483647
    THROW 50422, 'The stock would exceed the maximum that can be stored.', 1;

  DECLARE @NewOnHand INT = @OnHand + @Quantity;

  UPDATE dbo.Variants SET OnHandStock = @NewOnHand WHERE IDVariant = @IDVariant;

  -- La existencia solo cambia junto con su movimiento, en la misma transacción: VW_Inventory_Reconciliation lo comprueba
  INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser, CreatedAt)
  VALUES (@IDVariant, 1, @Quantity, @NewOnHand, @Reason, @IDActor, @Now);
  SET @IDMovement = SCOPE_IDENTITY();

  DECLARE @Previous NVARCHAR(100) = CONCAT(N'{"OnHandStock":', @OnHand, N'}');
  DECLARE @New NVARCHAR(100) = CONCAT(N'{"OnHandStock":', @NewOnHand, N'}');
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDVariant AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Stock', @EntityName = N'Variant', @EntityKey = @EntityKey, @Action = N'Update',
       @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
