/* =====================================================================
   Objeto   : dbo.SP_Dashboard_AbandonedCarts
   Version  : 1.0.0
   Cambio   : Primera versión: carritos abandonados, con lo que dejaron y quién es, para recuperarlos
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un carrito está abandonado cuando es activo, tiene productos y su última actividad es anterior a
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

  SELECT c.IDCart, c.IDUser, CustomerName = u.FullName, CustomerEmail = u.Email,
         c.ItemCount, Estimated = e.Text, c.LastActivityAt,
         IdleHours = DATEDIFF(HOUR, c.LastActivityAt, @Now),
         TotalCount = COUNT(*) OVER ()
  FROM dbo.VW_Carts_Abandoned AS c
  LEFT JOIN dbo.Users AS u ON u.IDUser = c.IDUser
  CROSS APPLY dbo.FU_Money_CentsToText(c.EstimatedCents) AS e
  WHERE c.AbandonedAt <= @Now
  ORDER BY c.EstimatedCents DESC, c.IDCart DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
