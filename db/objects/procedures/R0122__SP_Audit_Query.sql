/* =====================================================================
   Objeto   : dbo.SP_Audit_Query
   Version  : 1.1.0
   Cambio   : El total ya no se calcula con COUNT(*) OVER () (un Window Spool que escribía cada fila en tempdb); se cuenta aparte y solo se leen las filas de la página; OPTION (RECOMPILE) por los filtros opcionales
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Mismas columnas y mismo orden que 1.0.0. Solo lectura; la bitácora es inmutable. Errores: 50400 paginación o rango inválidos.
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
  ;WITH f AS (
    SELECT a.IDAuditLog
    FROM dbo.AuditLog AS a
    WHERE (@Module IS NULL OR a.Module = @Module)
      AND (@EntityKey IS NULL OR a.EntityKey = @EntityKey)
      AND (@From IS NULL OR a.CreatedAt >= @From)
      AND (@To IS NULL OR a.CreatedAt < @To)
  ), pg AS (
    SELECT IDAuditLog FROM f ORDER BY IDAuditLog DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
  )
  SELECT a.IDAuditLog, a.Module, a.EntityName, a.EntityKey, a.Action, a.PreviousValue, a.NewValue,
         a.IDUser, UserName = u.FullName, a.CreatedAt,
         TotalCount = (SELECT COUNT(*) FROM f)
  FROM pg
  JOIN dbo.AuditLog AS a ON a.IDAuditLog = pg.IDAuditLog
  LEFT JOIN dbo.Users AS u ON u.IDUser = a.IDUser
  ORDER BY a.IDAuditLog DESC
  OPTION (RECOMPILE);
END;
GO
