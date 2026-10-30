/* =====================================================================
   Objeto   : dbo.SP_Products_Get
   Version  : 1.0.0
   Cambio   : Primera versión: ficha de un producto con sus imágenes y variantes
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una sola fila; Images y Variants son arreglos JSON. Errores: 50400, 50404.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Products_Get
  @IDProduct       INT,
  @IncludeInactive BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDProduct IS NULL
    THROW 50400, 'IDProduct is required.', 1;

  SET @IncludeInactive = ISNULL(@IncludeInactive, 0);

  IF NOT EXISTS (SELECT 1 FROM dbo.Products WHERE IDProduct = @IDProduct AND (IsActive = 1 OR @IncludeInactive = 1))
    THROW 50404, 'Product not found.', 1;

  -- Una sola fila con las imágenes y las variantes como JSON: el backend recibe la ficha completa en un viaje y la prueba
  -- puede leerla sin varios conjuntos de resultados. Los precios viajan como texto con dos decimales (ADR-0020).
  SELECT p.IDProduct, p.IDCategory, CategoryName = c.Name, p.Name, p.Description, p.LeadTimeDays, p.IsActive,
         RowVer = CAST(p.RowVer AS BINARY(8)),
         Images = ISNULL((SELECT i.IDProductImage, i.Url, i.SortOrder, i.IsPrimary
                          FROM dbo.ProductImages AS i WHERE i.IDProduct = p.IDProduct
                          ORDER BY i.IsPrimary DESC, i.SortOrder, i.IDProductImage
                          FOR JSON PATH), N'[]'),
         Variants = ISNULL((SELECT v.IDVariant, v.SKU, Price = CAST(v.Price AS VARCHAR(20)), v.OnHandStock,
                                   Available = v.OnHandStock - v.ReservedStock, v.IsActive,
                                   Attributes = (SELECT Name = a.Name, va.Value
                                                 FROM dbo.VariantAttributes AS va JOIN dbo.Attributes AS a ON a.IDAttribute = va.IDAttribute
                                                 WHERE va.IDVariant = v.IDVariant ORDER BY a.Name FOR JSON PATH)
                            FROM dbo.Variants AS v
                            WHERE v.IDProduct = p.IDProduct AND (v.IsActive = 1 OR @IncludeInactive = 1)
                            ORDER BY v.IDVariant
                            FOR JSON PATH), N'[]')
  FROM dbo.Products AS p
  JOIN dbo.Categories AS c ON c.IDCategory = p.IDCategory
  WHERE p.IDProduct = @IDProduct;
END;
GO
