/* =====================================================================
   Objeto   : dbo.SP_Audit_Query
   Version  : 1.0.0
   Cambio   : Primera versión: consulta paginada de la bitácora de auditoría
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Solo lectura; la bitácora es inmutable. Errores: 50400 paginación o rango inválidos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Audit_Query
  @Module     NVARCHAR(30) = NULL,
  @EntityKey  NVARCHAR(40) = NULL,
  @From       DATETIME2(3) = NULL,
  @To         DATETIME2(3) = NULL,
  @PageNumber INT          = 1,
  @PageSize   INT          = 20
AS
BEGIN
  SET NOCOUNT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;
  IF @From IS NOT NULL AND @To IS NOT NULL AND @From >= @To
    THROW 50400, 'From must be before To.', 1;

  -- Lo más reciente primero; @To es exclusivo, igual que en el libro de inventario
  SELECT a.IDAuditLog, a.Module, a.EntityName, a.EntityKey, a.Action, a.PreviousValue, a.NewValue,
         a.IDUser, UserName = u.FullName, a.CreatedAt,
         TotalCount = COUNT(*) OVER ()
  FROM dbo.AuditLog AS a
  LEFT JOIN dbo.Users AS u ON u.IDUser = a.IDUser
  WHERE (@Module IS NULL OR a.Module = @Module)
    AND (@EntityKey IS NULL OR a.EntityKey = @EntityKey)
    AND (@From IS NULL OR a.CreatedAt >= @From)
    AND (@To IS NULL OR a.CreatedAt < @To)
  ORDER BY a.IDAuditLog DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
