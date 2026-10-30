/* =====================================================================
   Objeto   : dbo.FU_Dashboard_Range
   Version  : 1.0.0
   Cambio   : Primera versión: rango de fechas de un reporte con sus valores por defecto y su equivalente en UTC
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Sin fechas, el reporte cubre los últimos 30 días hasta hoy en hora de Guatemala. Las fechas se leen como
              días de Guatemala (UTC-6): FromUtc es la medianoche local de FromDate y ToUtc la de ToDate + 1 (exclusivo), de
              modo que se filtra PaidAt directamente y se aprovecha IX_Orders_PaidAt. Una venta a las 23:30 de Guatemala
              pertenece a ese día aunque en UTC ya sea el siguiente.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Dashboard_Range (@From DATE, @To DATE, @Now DATETIME2(3))
RETURNS TABLE
AS
RETURN
  SELECT r.FromDate, r.ToDate,
         FromUtc = CAST(((CAST(r.FromDate AS DATETIME2(3)) AT TIME ZONE 'Central America Standard Time') AT TIME ZONE 'UTC') AS DATETIME2(3)),
         ToUtc   = CAST(((CAST(DATEADD(DAY, 1, r.ToDate) AS DATETIME2(3)) AT TIME ZONE 'Central America Standard Time') AT TIME ZONE 'UTC') AS DATETIME2(3))
  FROM (
    SELECT ToDate   = ISNULL(@To, t.Today),
           FromDate = ISNULL(@From, DATEADD(DAY, -29, ISNULL(@To, t.Today)))
    FROM (SELECT Today = CAST(((ISNULL(@Now, SYSUTCDATETIME()) AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') AS DATE)) AS t
  ) AS r;
GO
