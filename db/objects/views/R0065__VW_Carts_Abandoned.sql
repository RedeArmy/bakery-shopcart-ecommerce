/* =====================================================================
   Objeto   : dbo.VW_Carts_Abandoned
   Version  : 1.0.0
   Cambio   : Primera versión: carritos activos con productos y el instante en que pasan a considerarse abandonados
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. AbandonedAt es la última actividad más AbandonedCartHours de Configuracion (24 si falta). La vista no usa el
              reloj: quien la consulta compara AbandonedAt con su propio "ahora", así el resultado es reproducible en las
              pruebas. Un carrito sin productos no aparece. EstimatedCents usa los precios vigentes, sin cupón.
   ===================================================================== */
CREATE OR ALTER VIEW dbo.VW_Carts_Abandoned
AS
  SELECT c.IDCart, c.IDUser, c.LastActivityAt, i.ItemCount, i.EstimatedCents,
         AbandonedAt = DATEADD(HOUR, t.Hours, c.LastActivityAt)
  FROM dbo.Carts AS c
  CROSS APPLY (
    SELECT Hours = ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.Configuration WHERE SettingKey = N'AbandonedCartHours') AS INT), 24)
  ) AS t
  CROSS APPLY (
    SELECT ItemCount = SUM(ci.Quantity), EstimatedCents = SUM(CAST(v.Price * 100 AS BIGINT) * ci.Quantity)
    FROM dbo.CartItems AS ci
    JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
    WHERE ci.IDCart = c.IDCart
    HAVING COUNT(*) > 0
  ) AS i
  WHERE c.Status = N'Active';
GO
