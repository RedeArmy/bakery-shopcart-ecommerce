/* =====================================================================
   Objeto   : dbo.SP_Dashboard_AbandonedCarts
   Version  : 1.1.0
   Cambio   : Predicado sargable sobre LastActivityAt (FU_Carts_AbandonmentCutoff) y total contado aparte; antes recorría todos los carritos activos
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Mismas columnas y mismo orden que 1.0.0. Un carrito está abandonado cuando es activo, tiene productos y su última actividad es anterior a
              AbandonedCartHours (24). Mayor valor estimado primero (precios vigentes, sin cupón), que es lo que más conviene
              recuperar. Un visitante sin cuenta aparece sin nombre ni correo. Paginado con TotalCount. Errores: 50400 paginación
              inválida.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Dashboard_AbandonedCarts
  @Now        DATETIME2(3) = NULL,
  @PageNumber INT          = 1,
  @PageSize   INT          = 20
AS
BEGIN
  SET NOCOUNT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @Cutoff DATETIME2(3) = (SELECT CutoffAt FROM dbo.FU_Carts_AbandonmentCutoff(@Now));

  -- Solo los carritos activos con productos cuya última actividad es anterior al umbral. El valor estimado usa los precios
  -- vigentes, sin cupón. Una agregación por conjuntos y no un CROSS APPLY por carrito: este último buscaba en CartItems y en
  -- Variants una vez por carrito (164 000 lecturas con 20 000 carritos). Un carrito sin productos no aparece por el JOIN.
  -- RECOMPILE para que el umbral se conozca al planificar y IX_Carts_LastActivity se use bien.
  ;WITH f AS (
    SELECT c.IDCart, c.IDUser, c.LastActivityAt, ItemCount = SUM(ci.Quantity),
           EstimatedCents = SUM(CAST(v.Price * 100 AS BIGINT) * ci.Quantity)
    FROM dbo.Carts AS c
    JOIN dbo.CartItems AS ci ON ci.IDCart = c.IDCart
    JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
    WHERE c.Status = N'Active' AND c.LastActivityAt <= @Cutoff
    GROUP BY c.IDCart, c.IDUser, c.LastActivityAt
  )
  SELECT c.IDCart, c.IDUser, CustomerName = u.FullName, CustomerEmail = u.Email,
         c.ItemCount, Estimated = e.Text, c.LastActivityAt,
         IdleHours = DATEDIFF(HOUR, c.LastActivityAt, @Now),
         TotalCount = (SELECT COUNT(*) FROM f)
  FROM f AS c
  LEFT JOIN dbo.Users AS u ON u.IDUser = c.IDUser
  CROSS APPLY dbo.FU_Money_CentsToText(c.EstimatedCents) AS e
  ORDER BY c.EstimatedCents DESC, c.IDCart DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
  OPTION (RECOMPILE);
END;
GO
