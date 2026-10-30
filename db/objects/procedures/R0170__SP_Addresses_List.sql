/* =====================================================================
   Objeto   : dbo.SP_Addresses_List
   Version  : 1.0.0
   Cambio   : Primera versión: libreta de direcciones de un cliente
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Solo devuelve direcciones del usuario indicado, que el backend toma del token. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Addresses_List
  @IDUser          INT,
  @IncludeInactive BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL
    THROW 50400, 'IDUser is required.', 1;

  -- La pertenencia es el propio filtro: las direcciones de otra persona no aparecen, no hay nada que adivinar por ID
  SELECT a.IDAddress, a.Label, a.Recipient, a.Phone, a.Line1, a.Line2, a.Municipality, a.Department, a.Reference, a.IsActive
  FROM dbo.Addresses AS a
  WHERE a.IDUser = @IDUser AND (a.IsActive = 1 OR ISNULL(@IncludeInactive, 0) = 1)
  ORDER BY a.Label, a.IDAddress;
END;
GO
