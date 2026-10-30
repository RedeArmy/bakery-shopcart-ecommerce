/* =====================================================================
   Objeto   : dbo.SP_Refunds_Mark
   Version  : 1.0.0
   Cambio   : Primera versión: el administrador marca un reembolso como procesado o fallido
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Procesado exige la referencia de la transferencia o del reembolso del proveedor y es lo que escribe el libro de
              dinero. Repetir el mismo resultado no hace nada; un fallido se puede volver a marcar como procesado.
              Errores: 50400, 50404, 50422 actor sin permiso o reembolso ya procesado.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Refunds_Mark
  @IDActor           INT,
  @IDRefund          INT,
  @Status            NVARCHAR(12),
  @ExternalReference NVARCHAR(80) = NULL,
  @Now               DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @ExternalReference = LTRIM(RTRIM(@ExternalReference));
  IF @IDActor IS NULL OR @IDRefund IS NULL OR @Status NOT IN (N'Processed', N'Failed')
    THROW 50400, 'IDActor, IDRefund and a Status of Processed or Failed are required.', 1;
  -- Sin la referencia no se puede demostrar adónde fue el dinero
  IF @Status = N'Processed' AND ISNULL(@ExternalReference, N'') = N''
    THROW 50400, 'A processed refund needs the ExternalReference of the transfer.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- Devolver dinero lo decide solo el administrador
  IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDActor AND IDRole = 3 AND IsActive = 1)
    THROW 50422, 'Only an active administrator can mark a refund.', 1;

  DECLARE @Current NVARCHAR(12), @IDPayment INT, @Amount DECIMAL(18,2);
  SELECT @Current = Status, @IDPayment = IDPayment, @Amount = Amount
  FROM dbo.Refunds WITH (UPDLOCK, ROWLOCK, INDEX(PK_Refunds)) WHERE IDRefund = @IDRefund;
  IF @Current IS NULL
    THROW 50404, 'Refund not found.', 1;

  -- El mismo resultado dos veces: el segundo administrador no duplica el asiento del libro
  IF @Current = @Status
  BEGIN
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;
  IF @Current = N'Processed'
    THROW 50422, 'A processed refund cannot change.', 1;

  UPDATE dbo.Refunds
  SET Status = @Status, ExternalReference = CASE WHEN @Status = N'Processed' THEN @ExternalReference ELSE ExternalReference END,
      ProcessedAt = @Now
  WHERE IDRefund = @IDRefund;

  IF @Status = N'Processed'
  BEGIN
    DECLARE @IDOrder INT, @PaymentStatus TINYINT, @PaymentAmount DECIMAL(18,2);
    SELECT @IDOrder = IDOrder, @PaymentStatus = IDPaymentStatus, @PaymentAmount = Amount
    FROM dbo.Payments WITH (UPDLOCK, ROWLOCK, INDEX(PK_Payments)) WHERE IDPayment = @IDPayment;

    -- Un pago tardío nunca se aprobó, así que su cobro no está en el libro: se anota aquí para que el reembolso tenga contra qué restar
    IF NOT EXISTS (SELECT 1 FROM dbo.FinancialMovements WHERE IDPayment = @IDPayment AND Type = N'Charge')
      INSERT INTO dbo.FinancialMovements (IDOrder, IDPayment, Type, Amount, IDUser, CreatedAt)
      VALUES (@IDOrder, @IDPayment, N'Charge', @Amount, @IDActor, @Now);

    INSERT INTO dbo.FinancialMovements (IDOrder, IDPayment, IDRefund, Type, Amount, IDUser, CreatedAt)
    VALUES (@IDOrder, @IDPayment, @IDRefund, N'Refund', -@Amount, @IDActor, @Now);

    -- Cuando lo devuelto iguala lo cobrado el pago pasa a Refunded; las devoluciones parciales lo dejan aprobado
    IF @PaymentStatus = 3
       AND (SELECT SUM(Amount) FROM dbo.Refunds WHERE IDPayment = @IDPayment AND Status = N'Processed') >= @PaymentAmount
    BEGIN
      UPDATE dbo.Payments SET IDPaymentStatus = 7 WHERE IDPayment = @IDPayment;
      INSERT INTO dbo.PaymentStatusHistory (IDPayment, IDPreviousStatus, IDNewStatus, IDUser, Source, CreatedAt, Comment)
      VALUES (@IDPayment, 3, 7, @IDActor, N'Operator', @Now, N'Refunded in full');
    END;
  END;

  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDRefund AS NVARCHAR(40));
  DECLARE @Previous NVARCHAR(MAX) = (SELECT Status = @Current FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
  DECLARE @New NVARCHAR(MAX) = (SELECT Status = @Status, ExternalReference = @ExternalReference FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
  EXEC dbo.SP_Audit_Record @Module = N'Payments', @EntityName = N'Refund', @EntityKey = @EntityKey, @Action = N'StatusChange',
       @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
