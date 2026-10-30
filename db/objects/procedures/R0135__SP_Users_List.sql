/* =====================================================================
   Objeto   : dbo.SP_Users_List
   Version  : 1.0.0
   Cambio   : Primera versión: listado paginado de cuentas para el panel de administración
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Nunca devuelve el hash de la contraseña. Errores: 50400 paginación inválida.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_List
  @Search     NVARCHAR(100) = NULL,
  @IDRole     TINYINT       = NULL,
  @IsActive   BIT           = NULL,
  @PageNumber INT           = 1,
  @PageSize   INT           = 20
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;

  SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');

  -- CHARINDEX y no LIKE: el texto buscado no se interpreta como patrón, así que un % o un _ del usuario no cambia la consulta
  SELECT u.IDUser, u.Email, u.FullName, u.Phone, u.IDRole, RoleName = r.Name, u.IsActive, u.LockedUntil, u.CreatedAt,
         TotalCount = COUNT(*) OVER ()
  FROM dbo.Users AS u
  JOIN dbo.Roles AS r ON r.IDRole = u.IDRole
  WHERE (@Search IS NULL OR CHARINDEX(@Search, u.Email) > 0 OR CHARINDEX(@Search, u.FullName) > 0)
    AND (@IDRole IS NULL OR u.IDRole = @IDRole)
    AND (@IsActive IS NULL OR u.IsActive = @IsActive)
  ORDER BY u.CreatedAt DESC, u.IDUser DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
