/* =====================================================================
   Objeto   : dbo.SP_Variants_SetAttributes
   Version  : 1.0.0
   Cambio   : Primera versión: reemplaza los atributos de una variante (uso interno de Create y Update)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @Attributes es un arreglo JSON [{"name":"Size","value":"Large"}]; NULL no cambia nada y [] los borra.
              Errores: 50400. Debe llamarse dentro de la transacción de la variante.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Variants_SetAttributes
  @IDVariant  INT,
  @Attributes NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @Attributes IS NULL
    RETURN;

  IF ISJSON(@Attributes) = 0 OR LEFT(LTRIM(@Attributes), 1) <> N'['
    THROW 50400, 'Attributes must be a JSON array of name and value pairs.', 1;

  DECLARE @Parsed TABLE (Name NVARCHAR(40), Value NVARCHAR(60));
  INSERT INTO @Parsed (Name, Value)
  SELECT LTRIM(RTRIM(Name)), LTRIM(RTRIM(Value))
  FROM OPENJSON(@Attributes) WITH (Name NVARCHAR(40) '$.name', Value NVARCHAR(60) '$.value');

  -- Un valor más largo que la columna llega como NULL: se rechaza igual que uno vacío, en vez de guardarlo recortado
  IF EXISTS (SELECT 1 FROM @Parsed WHERE ISNULL(Name, N'') = N'' OR ISNULL(Value, N'') = N'')
    THROW 50400, 'Every attribute needs a name (up to 40 characters) and a value (up to 60).', 1;

  IF EXISTS (SELECT Name FROM @Parsed GROUP BY Name HAVING COUNT(*) > 1)
    THROW 50400, 'An attribute name cannot be repeated.', 1;

  DELETE FROM dbo.VariantAttributes WHERE IDVariant = @IDVariant;

  -- Los nombres de atributo se comparten entre variantes. HOLDLOCK evita que dos altas simultáneas del mismo nombre nuevo
  -- choquen con el índice único.
  INSERT INTO dbo.Attributes (Name)
  SELECT p.Name FROM @Parsed AS p
  WHERE NOT EXISTS (SELECT 1 FROM dbo.Attributes AS a WITH (UPDLOCK, HOLDLOCK) WHERE a.Name = p.Name);

  INSERT INTO dbo.VariantAttributes (IDVariant, IDAttribute, Value)
  SELECT @IDVariant, a.IDAttribute, p.Value FROM @Parsed AS p JOIN dbo.Attributes AS a ON a.Name = p.Name;
END;
GO
