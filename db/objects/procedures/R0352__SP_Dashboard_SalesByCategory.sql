/* =====================================================================
   Objeto   : dbo.SP_Dashboard_SalesByCategory
   Version  : 1.0.0
   Cambio   : Primera versión: ventas por categoría en un rango de fechas, descontando devoluciones
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Mayor venta neta primero. La categoría es la congelada en cada línea del pedido; Units son las unidades
              vendidas menos las devueltas; Orders cuenta los pedidos distintos con alguna línea de esa categoría. La suma de las
              ventas netas de todas las categorías es la venta neta del periodo, porque el descuento de cada pedido ya está
              repartido entre sus líneas (no hay envío). Importes como texto con dos decimales. Errores: 50400 rango inválido.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Dashboard_SalesByCategory
  @From DATE         = NULL,
  @To   DATE         = NULL,
  @Now  DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT @From = FromDate, @To = ToDate FROM dbo.FU_Dashboard_Range(@From, @To, @Now);
  IF @From > @To OR DATEDIFF(DAY, @From, @To) > 3660
    THROW 50400, 'From must not be after To and the range cannot exceed ten years.', 1;

  SELECT c.IDCategory, CategoryName = c.Name, t.Orders, t.Units, Net = n.Text
  FROM (
    SELECT l.IDCategory, Orders = COUNT(DISTINCT l.IDOrder), Units = SUM(l.Quantity - l.ReturnedQuantity), NetCents = SUM(l.NetCents)
    FROM dbo.FU_Dashboard_Range(@From, @To, @Now) AS r
    JOIN dbo.VW_Dashboard_SoldLines AS l ON l.PaidAt >= r.FromUtc AND l.PaidAt < r.ToUtc
    GROUP BY l.IDCategory
  ) AS t
  JOIN dbo.Categories AS c ON c.IDCategory = t.IDCategory
  CROSS APPLY dbo.FU_Money_CentsToText(t.NetCents) AS n
  ORDER BY t.NetCents DESC, c.IDCategory;
END;
GO
