/* =====================================================================
   Objeto   : dbo.FU_Carts_AbandonmentCutoff
   Version  : 1.0.0
   Cambio   : Primera versión: instante anterior al cual la última actividad de un carrito lo hace abandonado
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un carrito está abandonado si LastActivityAt <= CutoffAt. Sin la clave AbandonedCartHours usa 24 horas.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Carts_AbandonmentCutoff (@Now DATETIME2(3))
RETURNS TABLE
AS
RETURN
  -- Se compara LastActivityAt con un valor fijo y no AbandonedAt = actividad + horas con @Now: la segunda forma obliga a
  -- calcular la expresión para cada carrito y no puede usar IX_Carts_LastActivity. Con 20 000 carritos eran 162 000 lecturas.
  SELECT CutoffAt = DATEADD(HOUR, -ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.Configuration WHERE SettingKey = N'AbandonedCartHours') AS INT), 24), @Now);
GO
