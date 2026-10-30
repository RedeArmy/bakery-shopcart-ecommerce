/* =====================================================================
   Objeto   : dbo.SP_System_ListObjectVersions
   Version  : 1.0.0
   Cambio   : Primera versión: versión vigente de cada objeto programable (panel del administrador)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Solo lectura de la tabla de control del ejecutor de migraciones.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_System_ListObjectVersions
AS
BEGIN
  SET NOCOUNT ON;

  SELECT ObjectName, ObjectType, Version, Change
  FROM dbo.ObjectVersions
  WHERE IsCurrent = 1
  ORDER BY ObjectName;
END;
GO
