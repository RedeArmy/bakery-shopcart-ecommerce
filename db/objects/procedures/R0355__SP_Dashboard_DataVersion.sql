/* =====================================================================
   Objeto   : dbo.SP_Dashboard_DataVersion
   Version  : 1.0.0
   Cambio   : Primera versión: una marca barata de lo que cambió en los datos de los reportes, para invalidar su caché
   Autor    : Equipo ShopCart   Fecha: 2026-11-10
   Compat   : Nueva. Una sola fila con Version, un texto que cambia cuando cambia algo de lo que leen los reportes del panel: un
              pedido pasa de estado (o se crea), un pago cambia de estado, se registra una devolución o se edita un producto o una
              categoría. Se arma con los últimos identificadores de las tablas de historia, que solo crecen, y con la marca de
              versión de las filas de Products: no recorre pedidos ni líneas. No cubre el paso del tiempo (carritos abandonados,
              el día que cambia): de eso se ocupa el tiempo de vida del caché. Sin parámetros y de solo lectura.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Dashboard_DataVersion
AS
BEGIN
  SET NOCOUNT ON;

  SELECT Version = CONCAT(
           (SELECT ISNULL(MAX(IDOrderStatusHistory), 0) FROM dbo.OrderStatusHistory), '.',
           (SELECT ISNULL(MAX(IDPaymentStatusHistory), 0) FROM dbo.PaymentStatusHistory), '.',
           (SELECT ISNULL(MAX(IDReturn), 0) FROM dbo.Returns), '.',
           (SELECT ISNULL(CAST(MAX(CAST(RowVer AS BINARY(8))) AS BIGINT), 0) FROM dbo.Products), '.',
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(IDCategory, IDParentCategory, Name, IsActive)), 0) FROM dbo.Categories));
END;
GO
