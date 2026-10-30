/* =====================================================================
   Objeto   : dbo.SP_Idempotency_Complete
   Version  : 1.0.0
   Cambio   : Primera versión: guarda la respuesta de una solicitud para reproducirla si la llave se repite
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @Stored es 1 si guardó la respuesta y 0 si la solicitud ya no estaba en proceso. Errores: 50400
              estado HTTP fuera de 200-499 o cuerpo que no es JSON, 50404 llave desconocida.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Idempotency_Complete
  @Scope          NVARCHAR(64),
  @Method         NVARCHAR(7),
  @Route          NVARCHAR(200),
  @IdempotencyKey NVARCHAR(64),
  @HttpStatus     SMALLINT,
  @ResponseBody   NVARCHAR(MAX) = NULL,
  @Stored         BIT           = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @Scope IS NULL OR @Method IS NULL OR @Route IS NULL OR @IdempotencyKey IS NULL OR @HttpStatus IS NULL
    THROW 50400, 'Scope, Method, Route, IdempotencyKey and HttpStatus are required.', 1;

  -- Las 5xx no se guardan: un fallo del servidor debe poder reintentarse (ADR-0004). Las 2xx y las 4xx deterministas sí.
  IF @HttpStatus < 200 OR @HttpStatus > 499
    THROW 50400, 'Only responses with an HTTP status from 200 to 499 are stored.', 1;

  IF @ResponseBody IS NOT NULL AND ISJSON(@ResponseBody) = 0
    THROW 50400, 'ResponseBody must be valid JSON.', 1;

  -- Solo se completa lo que sigue en proceso. Si otra instancia tomó la solicitud por abandonada y terminó primero, la
  -- respuesta que quedó guardada es la que cuenta: la segunda no la pisa, para que todas las reproducciones sean idénticas.
  UPDATE dbo.IdempotentRequests
  SET Status = N'Completed', HttpStatus = @HttpStatus, ResponseBody = @ResponseBody
  WHERE Scope = @Scope AND Method = @Method AND Route = @Route AND IdempotencyKey = @IdempotencyKey AND Status = N'InProgress';

  IF @@ROWCOUNT = 1
    SET @Stored = 1;
  ELSE IF EXISTS (SELECT 1 FROM dbo.IdempotentRequests WHERE Scope = @Scope AND Method = @Method AND Route = @Route AND IdempotencyKey = @IdempotencyKey)
    SET @Stored = 0;
  ELSE
    THROW 50404, 'Idempotency key not found.', 1;
END;
GO
