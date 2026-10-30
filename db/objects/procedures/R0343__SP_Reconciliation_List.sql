/* =====================================================================
   Objeto   : dbo.SP_Reconciliation_List
   Version  : 1.0.0
   Cambio   : Primera versión: discrepancias actuales de importes e inventario para el panel del administrador
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Solo lectura; devuelve cero filas cuando todo cuadra. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Reconciliation_List
  @Limit INT = 100
AS
BEGIN
  SET NOCOUNT ON;

  IF @Limit < 1 OR @Limit > 500
    THROW 50400, 'Limit must be between 1 and 500.', 1;

  -- La aplicación no tiene SELECT sobre las vistas: las lee este procedimiento, con una forma común para los dos orígenes
  SELECT TOP (@Limit) Source, [Check], EntityKey, Expected, Actual
  FROM (
    SELECT Source = CAST(N'Amounts' AS NVARCHAR(10)), [Check], EntityKey,
           Expected = CAST(Expected AS VARCHAR(25)), Actual = CAST(Actual AS VARCHAR(25))
    FROM dbo.VW_Reconciliation_Amounts
    UNION ALL
    SELECT N'Inventory', Issue, SKU, CAST(Expected AS VARCHAR(25)), CAST(Actual AS VARCHAR(25))
    FROM dbo.VW_Inventory_Reconciliation
  ) AS d
  ORDER BY Source, [Check], EntityKey;
END;
GO
