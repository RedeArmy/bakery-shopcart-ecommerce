/* =====================================================================
   Objeto   : dbo.SP_Inventory_GetLedger
   Version  : 1.0.0
   Cambio   : Primera versión: movimientos de inventario de una variante, del más reciente al más antiguo
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400 paginación o rango inválidos, 50404 variante inexistente.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Inventory_GetLedger
  @IDVariant  INT,
  @From       DATETIME2(3) = NULL,
  @To         DATETIME2(3) = NULL,
  @PageNumber INT          = 1,
  @PageSize   INT          = 20
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDVariant IS NULL
    THROW 50400, 'IDVariant is required.', 1;
  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;
  IF @From IS NOT NULL AND @To IS NOT NULL AND @From >= @To
    THROW 50400, 'From must be before To.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.Variants WHERE IDVariant = @IDVariant)
    THROW 50404, 'Variant not found.', 1;

  -- Se ordena por el identificador y no por la fecha: dos movimientos pueden compartir el mismo milisegundo, y el
  -- identificador crece en el orden en que se confirmaron bajo el bloqueo de la variante. @To es exclusivo.
  SELECT m.IDInventoryMovement, MovementType = t.Name, m.Quantity, m.ResultingBalance, m.Reason,
         m.IDUser, UserName = u.FullName, m.IDOrder, m.CreatedAt,
         TotalCount = COUNT(*) OVER ()
  FROM dbo.InventoryMovements AS m
  JOIN dbo.InventoryMovementTypes AS t ON t.IDInventoryMovementType = m.IDInventoryMovementType
  JOIN dbo.Users AS u ON u.IDUser = m.IDUser
  WHERE m.IDVariant = @IDVariant
    AND (@From IS NULL OR m.CreatedAt >= @From)
    AND (@To IS NULL OR m.CreatedAt < @To)
  ORDER BY m.IDInventoryMovement DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
