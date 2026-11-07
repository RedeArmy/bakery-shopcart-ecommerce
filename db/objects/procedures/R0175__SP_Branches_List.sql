/* =====================================================================
   Objeto   : dbo.SP_Branches_List
   Version  : 1.0.0
   Cambio   : Primera versión: sucursales activas para elegir en el checkout, o todas para la administración
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. Lectura pública de las activas; con @IncludeInactive = 1 (solo el panel del administrador) también las
              desactivadas, con el número de pedidos abiertos que tiene cada una.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Branches_List
  @IncludeInactive BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SELECT b.IDBranch, b.Name, b.Line1, b.Municipality, b.Department, b.Phone, b.OpeningHours, b.IsActive,
         -- Pendiente de pago, pagado, en preparación o despachado: todavía hay alguien esperando recoger o recibir
         OpenOrders = (SELECT COUNT(*) FROM dbo.Orders AS o WHERE o.IDBranch = b.IDBranch AND o.IDOrderStatus IN (1, 2, 3, 4))
  FROM dbo.Branches AS b
  WHERE b.IsActive = 1 OR ISNULL(@IncludeInactive, 0) = 1
  ORDER BY b.IsActive DESC, b.Name, b.IDBranch;
END;
GO
