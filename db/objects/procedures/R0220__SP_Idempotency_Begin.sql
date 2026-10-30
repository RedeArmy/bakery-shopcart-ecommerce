/* =====================================================================
   Objeto   : dbo.SP_Idempotency_Begin
   Version  : 1.0.0
   Cambio   : Primera versión: inicio atómico de una solicitud con llave de idempotencia (ADR-0004, primer nivel)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila: Outcome (New, TakenOver, Replay, InProgress, Mismatch), HttpStatus y ResponseBody de la
              respuesta guardada en un Replay, y RetryAfterSeconds en un InProgress. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Idempotency_Begin
  @Scope                NVARCHAR(64),
  @Method               NVARCHAR(7),
  @Route                NVARCHAR(200),
  @IdempotencyKey       NVARCHAR(64),
  @RequestHash          CHAR(64),
  @Now                  DATETIME2(3) = NULL,
  -- Una solicitud en proceso más antigua que esto se considera abandonada y otra instancia puede tomarla (ADR-0004)
  @AbandonedAfterSeconds INT         = 60
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  -- El alcance dice de quién es la llave: 'U:<IDUser>' o 'G:<GuestToken>'. Una llave de un cliente no choca con la de otro.
  IF @Scope IS NULL OR @Scope COLLATE Latin1_General_100_BIN2 NOT LIKE N'[UG]:_%' OR ISNULL(@Method, N'') NOT IN (N'POST', N'PATCH', N'PUT', N'DELETE')
     OR ISNULL(@Route, N'') = N'' OR ISNULL(@IdempotencyKey, N'') = N''
     OR @RequestHash IS NULL OR @RequestHash LIKE N'%[^0-9a-fA-F]%' OR @AbandonedAfterSeconds < 1
    THROW 50400, 'A Scope (U:<id> or G:<token>), a Method, a Route, an IdempotencyKey, a 64-character hexadecimal RequestHash and a positive AbandonedAfterSeconds are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @Hours INT = ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'IdempotencyKeyHours'), 24);
  DECLARE @ExpiresAt DATETIME2(3) = DATEADD(HOUR, @Hours, @Now);

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- UPDLOCK con HOLDLOCK toma un bloqueo de rango sobre la llave, exista o no la fila: dos solicitudes simultáneas con la
  -- misma llave no pueden pasar a la vez, la segunda espera a ver lo que dejó la primera. Es el INSERT atómico del diseño.
  DECLARE @ID BIGINT, @StoredHash CHAR(64), @Status NVARCHAR(12), @StoredHttpStatus SMALLINT, @StoredBody NVARCHAR(MAX),
          @StartedAt DATETIME2(3), @StoredExpiresAt DATETIME2(3);
  SELECT @ID = IDIdempotentRequest, @StoredHash = RequestHash, @Status = Status, @StoredHttpStatus = HttpStatus,
         @StoredBody = ResponseBody, @StartedAt = ProcessingStartedAt, @StoredExpiresAt = ExpiresAt
  FROM dbo.IdempotentRequests WITH (UPDLOCK, HOLDLOCK)
  WHERE Scope = @Scope AND Method = @Method AND Route = @Route AND IdempotencyKey = @IdempotencyKey;

  DECLARE @Outcome VARCHAR(12), @ReplayStatus SMALLINT = NULL, @ReplayBody NVARCHAR(MAX) = NULL, @RetryAfter INT = NULL;

  IF @ID IS NULL
  BEGIN
    INSERT INTO dbo.IdempotentRequests (Scope, Method, Route, IdempotencyKey, RequestHash, Status, CreatedAt, ProcessingStartedAt, ExpiresAt)
    VALUES (@Scope, @Method, @Route, @IdempotencyKey, @RequestHash, N'InProgress', @Now, @Now, @ExpiresAt);
    SET @Outcome = 'New';
  END
  ELSE IF @StoredExpiresAt <= @Now
  BEGIN
    -- La llave venció y el job de purga aún no la borró: vale como si no existiera, así que la fila se reutiliza
    UPDATE dbo.IdempotentRequests
    SET RequestHash = @RequestHash, Status = N'InProgress', HttpStatus = NULL, ResponseBody = NULL,
        CreatedAt = @Now, ProcessingStartedAt = @Now, ExpiresAt = @ExpiresAt
    WHERE IDIdempotentRequest = @ID;
    SET @Outcome = 'New';
  END
  ELSE IF @StoredHash <> @RequestHash
    -- La misma llave con otro cuerpo es un error del cliente en cualquier estado: no se ejecuta ni se reproduce nada
    SET @Outcome = 'Mismatch';
  ELSE IF @Status = N'Completed'
  BEGIN
    SET @Outcome = 'Replay';
    SET @ReplayStatus = @StoredHttpStatus;
    SET @ReplayBody = @StoredBody;
  END
  ELSE IF @Status = N'Failed'
  BEGIN
    -- La operación anterior terminó en un error del servidor y no se guardó respuesta: reintentar es lo esperado
    UPDATE dbo.IdempotentRequests SET Status = N'InProgress', ProcessingStartedAt = @Now WHERE IDIdempotentRequest = @ID;
    SET @Outcome = 'New';
  END
  ELSE IF DATEDIFF(SECOND, @StartedAt, @Now) >= @AbandonedAfterSeconds
  BEGIN
    -- En proceso desde hace demasiado: la instancia que la empezó probablemente murió
    UPDATE dbo.IdempotentRequests SET ProcessingStartedAt = @Now WHERE IDIdempotentRequest = @ID;
    SET @Outcome = 'TakenOver';
  END
  ELSE
  BEGIN
    SET @Outcome = 'InProgress';
    SET @RetryAfter = @AbandonedAfterSeconds - DATEDIFF(SECOND, @StartedAt, @Now);
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;

  SELECT Outcome = @Outcome, HttpStatus = @ReplayStatus, ResponseBody = @ReplayBody, RetryAfterSeconds = @RetryAfter;
END;
GO
