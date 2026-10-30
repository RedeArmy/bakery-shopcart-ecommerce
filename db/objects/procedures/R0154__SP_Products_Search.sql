/* =====================================================================
   Objeto   : dbo.SP_Products_Search
   Version  : 1.0.0
   Cambio   : Primera versión: búsqueda paginada del catálogo con filtros y orden fijo
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400 paginación u orden inválidos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Products_Search
  @Query           NVARCHAR(100) = NULL,
  @IDCategory      INT           = NULL,
  @MinPrice        DECIMAL(18,2) = NULL,
  @MaxPrice        DECIMAL(18,2) = NULL,
  @InStockOnly     BIT           = 0,
  @IncludeInactive BIT           = 0,
  @SortBy          VARCHAR(20)   = 'name',
  @PageNumber      INT           = 1,
  @PageSize        INT           = 20
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;
  IF @SortBy NOT IN ('name', 'price_asc', 'price_desc', 'newest')
    THROW 50400, 'SortBy must be name, price_asc, price_desc or newest.', 1;

  SET @Query = NULLIF(LTRIM(RTRIM(@Query)), N'');
  SET @InStockOnly = ISNULL(@InStockOnly, 0);
  SET @IncludeInactive = ISNULL(@IncludeInactive, 0);

  -- Una categoría incluye a sus descendientes: quien busca "Tortas" espera ver también "Tortas de boda"
  DECLARE @Categories TABLE (IDCategory INT PRIMARY KEY);
  IF @IDCategory IS NOT NULL
  BEGIN
    WITH Tree AS (
      SELECT IDCategory FROM dbo.Categories WHERE IDCategory = @IDCategory
      UNION ALL
      SELECT c.IDCategory FROM dbo.Categories AS c JOIN Tree AS t ON c.IDParentCategory = t.IDCategory
    )
    INSERT INTO @Categories (IDCategory) SELECT IDCategory FROM Tree;
  END;

  -- Un producto sin variantes activas no se puede comprar: el catálogo público no lo muestra aunque el producto esté activo
  WITH Priced AS (
    SELECT p.IDProduct, p.IDCategory, p.Name, p.Description, p.LeadTimeDays, p.IsActive, p.RowVer, CategoryName = c.Name,
           MinPriceValue = MIN(v.Price), MaxPriceValue = MAX(v.Price), Available = SUM(v.OnHandStock - v.ReservedStock)
    FROM dbo.Products AS p
    JOIN dbo.Categories AS c ON c.IDCategory = p.IDCategory
    JOIN dbo.Variants AS v ON v.IDProduct = p.IDProduct AND (v.IsActive = 1 OR @IncludeInactive = 1)
    WHERE (p.IsActive = 1 OR @IncludeInactive = 1)
      AND (@IDCategory IS NULL OR p.IDCategory IN (SELECT IDCategory FROM @Categories))
      -- CHARINDEX y no LIKE: el texto del usuario no se interpreta como patrón
      AND (@Query IS NULL OR CHARINDEX(@Query, p.Name) > 0 OR CHARINDEX(@Query, ISNULL(p.Description, N'')) > 0 OR CHARINDEX(@Query, c.Name) > 0)
      AND (@MinPrice IS NULL OR v.Price >= @MinPrice)
      AND (@MaxPrice IS NULL OR v.Price <= @MaxPrice)
    GROUP BY p.IDProduct, p.IDCategory, p.Name, p.Description, p.LeadTimeDays, p.IsActive, p.RowVer, c.Name
  )
  SELECT pr.IDProduct, pr.IDCategory, pr.CategoryName, pr.Name, pr.Description, pr.LeadTimeDays, pr.IsActive,
         PrimaryImageUrl = (SELECT TOP (1) i.Url FROM dbo.ProductImages AS i WHERE i.IDProduct = pr.IDProduct
                            ORDER BY i.IsPrimary DESC, i.SortOrder, i.IDProductImage),
         MinPrice = CAST(pr.MinPriceValue AS VARCHAR(20)), MaxPrice = CAST(pr.MaxPriceValue AS VARCHAR(20)), pr.Available,
         TotalCount = COUNT(*) OVER ()
  FROM Priced AS pr
  WHERE @InStockOnly = 0 OR pr.Available > 0
  -- El orden se elige entre cuatro expresiones fijas: nada del usuario llega a un ORDER BY dinámico
  ORDER BY CASE WHEN @SortBy = 'price_asc' THEN pr.MinPriceValue END ASC,
           CASE WHEN @SortBy = 'price_desc' THEN pr.MaxPriceValue END DESC,
           CASE WHEN @SortBy = 'newest' THEN pr.IDProduct END DESC,
           pr.Name, pr.IDProduct
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
