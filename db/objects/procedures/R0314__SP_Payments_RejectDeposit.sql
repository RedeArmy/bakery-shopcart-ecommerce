/* =====================================================================
   Objeto   : dbo.SP_Payments_RejectDeposit
   Version  : 1.0.0
   Cambio   : Primera versión: un operador rechaza un depósito en revisión, con motivo
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Resultados en @Outcome: Rejected, RejectedOrderCancelled (se alcanzó el máximo de intentos) o
              AlreadyRejected. Errores: 50400, 50404, 50422 actor sin permiso o pago que no está en revisión.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_RejectDeposit
  @IDActor   INT,
  @IDPayment INT,
  @Reason    NVARCHAR(250),
  @Now       DATETIME2(3) = NULL,
  @Outcome   VARCHAR(30)  = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Reason = LTRIM(RTRIM(@Reason));

  -- Rechazar sin decir por qué dejaría al cliente sin saber qué corregir
  IF @IDActor IS NULL OR @IDPayment IS NULL OR ISNULL(@Reason, N'') = N''
    THROW 50400, 'IDActor, IDPayment and a Reason are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @Outcome = NULL;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDActor AND IDRole IN (2, 3) AND IsActive = 1)
    THROW 50422, 'Only an active operator or administrator can review deposits.', 1;

  DECLARE @IDOrder INT, @PaymentStatus TINYINT;
  SELECT @IDOrder = IDOrder, @PaymentStatus = IDPaymentStatus
  FROM dbo.Payments WITH (UPDLOCK, ROWLOCK, INDEX(PK_Payments)) WHERE IDPayment = @IDPayment AND IDPaymentMethod = 2;
  IF @IDOrder IS NULL
    THROW 50404, 'Payment not found.', 1;

  -- Dos operadores rechazando a la vez: el segundo encuentra el pago ya rechazado y no hace nada
  IF @PaymentStatus = 4
  BEGIN
    SET @Outcome = 'AlreadyRejected';
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;
  IF @PaymentStatus <> 2
    THROW 50422, 'Only a deposit under review can be rejected.', 1;

  UPDATE dbo.Payments SET IDPaymentStatus = 4, ResolvedAt = @Now WHERE IDPayment = @IDPayment;

  -- IsCurrent = 0 libera la boleta para que el cliente pueda corregirla en otro intento
  UPDATE dbo.PaymentDeposits SET IsCurrent = 0, RejectionReason = LEFT(@Reason, 250), IDReviewerUser = @IDActor, ReviewedAt = @Now
  WHERE IDPayment = @IDPayment;

  INSERT INTO dbo.PaymentStatusHistory (IDPayment, IDPreviousStatus, IDNewStatus, IDUser, Source, CreatedAt, Comment)
  VALUES (@IDPayment, 2, 4, @IDActor, N'Operator', @Now, LEFT(@Reason, 250));

  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDPayment AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Payments', @EntityName = N'Payment', @EntityKey = @EntityKey, @Action = N'StatusChange',
       @PreviousValue = N'{"IDPaymentStatus":2}', @NewValue = N'{"IDPaymentStatus":4}', @IDUser = @IDActor;

  -- IX_Payments_Order fuerza buscar solo los pagos de este pedido: sin él el optimizador recorre el índice por estado y choca con las filas sin confirmar de otros pedidos (deadlock que mostró la prueba de concurrencia)
  IF (SELECT COUNT(*) FROM dbo.Payments WITH (INDEX(IX_Payments_Order)) WHERE IDOrder = @IDOrder AND IDPaymentStatus = 4)
       >= ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'MaxDepositAttempts'), 3)
  BEGIN
    -- Sin más intentos el pedido se cancela y se libera todo lo que retenía
    EXEC dbo.SP_Orders_CancelPending @IDOrder = @IDOrder, @OpenPaymentStatus = 8, @Reason = N'Maximum deposit attempts reached',
         @Source = N'Operator', @IDUser = @IDActor, @Now = @Now;
    SET @Outcome = 'RejectedOrderCancelled';
  END
  ELSE
  BEGIN
    -- Con intentos disponibles, la ventana de la reserva se reanuda con un margen para corregir y volver a subir el comprobante:
    -- la mayor entre lo que le quedaba y ahora más las horas de gracia
    DECLARE @GraceUntil DATETIME2(3) = DATEADD(HOUR, ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'RejectionGraceHours'), 12), @Now);
    UPDATE dbo.Reservations
    SET ExpiresAt = CASE WHEN ExpiresAt > @GraceUntil THEN ExpiresAt ELSE @GraceUntil END
    WHERE IDOrder = @IDOrder AND Status = N'Active';
    SET @Outcome = 'Rejected';
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
