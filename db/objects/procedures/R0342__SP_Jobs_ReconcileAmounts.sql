/* =====================================================================
   Objeto   : dbo.SP_Jobs_ReconcileAmounts
   Version  : 1.0.0
   Cambio   : Primera versión: conciliación diaria de importes e inventario con alerta en la bitácora
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Cuenta las filas de VW_Reconciliation_Amounts y VW_Inventory_Reconciliation, que deben ser cero. Si hay
              alguna, escribe una entrada en la bitácora con las primeras filas; la alerta la lee el panel del administrador
              (SP_Reconciliation_List) y el job la registra como error. @Outcome es Ran o Skipped.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Jobs_ReconcileAmounts
  @Now                    DATETIME2(3) = NULL,
  @Outcome                VARCHAR(10)  = NULL OUTPUT,
  @AmountDiscrepancies    INT          = NULL OUTPUT,
  @InventoryDiscrepancies INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SELECT @Outcome = 'Skipped', @AmountDiscrepancies = 0, @InventoryDiscrepancies = 0;
  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @Lock INT;
  EXEC @Lock = sys.sp_getapplock @Resource = N'Job:ReconcileAmounts', @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0;
  IF @Lock < 0 RETURN;

  BEGIN TRY
    SET @AmountDiscrepancies = (SELECT COUNT(*) FROM dbo.VW_Reconciliation_Amounts);
    SET @InventoryDiscrepancies = (SELECT COUNT(*) FROM dbo.VW_Inventory_Reconciliation);

    IF @AmountDiscrepancies > 0 OR @InventoryDiscrepancies > 0
    BEGIN
      -- Las primeras filas bastan para empezar a investigar; el listado completo lo da SP_Reconciliation_List
      DECLARE @Sample NVARCHAR(MAX) = (
        SELECT amounts = @AmountDiscrepancies, inventory = @InventoryDiscrepancies,
               amountRows = JSON_QUERY(ISNULL((SELECT TOP (20) [Check] AS [check], EntityKey AS entityKey,
                                                      CAST(Expected AS VARCHAR(25)) AS expected, CAST(Actual AS VARCHAR(25)) AS actual
                                               FROM dbo.VW_Reconciliation_Amounts FOR JSON PATH), N'[]')),
               inventoryRows = JSON_QUERY(ISNULL((SELECT TOP (20) SKU AS sku, Issue AS issue, Expected AS expected, Actual AS actual
                                                  FROM dbo.VW_Inventory_Reconciliation FOR JSON PATH), N'[]'))
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
      DECLARE @EntityKey NVARCHAR(40) = CONVERT(NVARCHAR(40), @Now, 126);
      EXEC dbo.SP_Audit_Record @Module = N'Reconciliation', @EntityName = N'Reconciliation', @EntityKey = @EntityKey,
           @Action = N'Create', @NewValue = @Sample;
    END;

    SET @Outcome = 'Ran';
  END TRY
  BEGIN CATCH
    EXEC sys.sp_releaseapplock @Resource = N'Job:ReconcileAmounts', @LockOwner = N'Session';
    THROW;
  END CATCH;

  EXEC sys.sp_releaseapplock @Resource = N'Job:ReconcileAmounts', @LockOwner = N'Session';
END;
GO
