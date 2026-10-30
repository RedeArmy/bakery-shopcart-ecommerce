/* =====================================================================
   Objeto   : dbo.SP_Idempotency_Fail
   Version  : 1.0.0
   Cambio   : Primera versión: marca una solicitud como fallida para que la misma llave se pueda reintentar
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. No es un error que la llave no exista o que ya no esté en proceso. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Idempotency_Fail
  @Scope          NVARCHAR(64),
  @Method         NVARCHAR(7),
  @Route          NVARCHAR(200),
  @IdempotencyKey NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @Scope IS NULL OR @Method IS NULL OR @Route IS NULL OR @IdempotencyKey IS NULL
    THROW 50400, 'Scope, Method, Route and IdempotencyKey are required.', 1;

  -- Solo lo que sigue en proceso. Una solicitud ya completada conserva su respuesta: un fallo tardío de otra instancia que
  -- tomó la solicitud por abandonada no debe borrar lo que la primera ya dejó guardado. Repetir la llamada es inofensivo.
  UPDATE dbo.IdempotentRequests
  SET Status = N'Failed'
  WHERE Scope = @Scope AND Method = @Method AND Route = @Route AND IdempotencyKey = @IdempotencyKey AND Status = N'InProgress';
END;
GO
