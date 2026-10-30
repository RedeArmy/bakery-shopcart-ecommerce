/* =====================================================================
   Objeto   : dbo.SP_Categories_List
   Version  : 1.0.0
   Cambio   : Primera versión: categorías con su padre y el número de productos activos
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Devuelve la lista plana; el backend arma el árbol con IDParentCategory.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Categories_List
  @IncludeInactive BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SELECT c.IDCategory, c.IDParentCategory, c.Name, c.Description, c.IsActive,
         ActiveProducts = (SELECT COUNT(*) FROM dbo.Products AS p WHERE p.IDCategory = c.IDCategory AND p.IsActive = 1)
  FROM dbo.Categories AS c
  WHERE c.IsActive = 1 OR ISNULL(@IncludeInactive, 0) = 1
  ORDER BY c.Name, c.IDCategory;
END;
GO
