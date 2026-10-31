/* =====================================================================
   Objeto   : dbo.FU_Configuration_PositiveInteger
   Version  : 1.0.0
   Cambio   : Primera versión: lee de Configuration un entero positivo con un valor por defecto
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila siempre. Una clave ausente, no numérica, cero o negativa devuelve el valor por defecto.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Configuration_PositiveInteger (@SettingKey NVARCHAR(50), @Default INT)
RETURNS TABLE
AS
RETURN
  -- Un valor mal escrito en la tabla (vacío, texto, 0) nunca debe convertir una purga en "conservar nada" ni en "borrar todo"
  SELECT Value = ISNULL((SELECT CASE WHEN TRY_CAST(SettingValue AS INT) >= 1 THEN TRY_CAST(SettingValue AS INT) END
                         FROM dbo.Configuration WHERE SettingKey = @SettingKey), @Default);
GO
