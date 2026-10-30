/* =====================================================================
   Objeto   : dbo.SP_Payments_RegisterProof
   Version  : 1.0.0
   Cambio   : Primera versión: el cliente registra el comprobante de su depósito y el pago pasa a revisión
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400 datos inválidos, 50404 pago inexistente o ajeno, 50409 referencia bancaria ya usada o
              llave de archivo repetida, 50422 pago que no admite comprobante, intentos agotados o archivo ya usado
              (PAYMENT_PROOF_REUSED). El archivo se guarda fuera de la base de datos: aquí solo su clave y su huella.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_RegisterProof
  @IDUser           INT,
  @IDPayment        INT,
  @OriginalFileName NVARCHAR(255),
  -- UUID opaco: el nombre que eligió el cliente nunca llega al disco (ADR-0018)
  @StorageKey       NVARCHAR(100),
  @MimeType         NVARCHAR(50),
  @SizeBytes        INT,
  @Sha256Hash       CHAR(64),
  -- Número de boleta o de transacción que da el banco
  @ReferenceNumber  NVARCHAR(40),
  @DepositDate      DATE,
  @DepositedAmount  DECIMAL(18,2),
  @Now              DATETIME2(3) = NULL,
  @IDPaymentProof   INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @ReferenceNumber = LTRIM(RTRIM(@ReferenceNumber));

  IF @IDUser IS NULL OR @IDPayment IS NULL OR ISNULL(@OriginalFileName, N'') = N'' OR ISNULL(@StorageKey, N'') = N''
     OR @MimeType NOT IN (N'image/jpeg', N'image/png', N'application/pdf') OR @SizeBytes IS NULL OR @SizeBytes < 1 OR @SizeBytes > 5242880
     OR @Sha256Hash IS NULL OR @Sha256Hash LIKE N'%[^0-9a-fA-F]%' OR ISNULL(@ReferenceNumber, N'') = N''
     OR @DepositDate IS NULL OR @DepositedAmount IS NULL OR @DepositedAmount <= 0
    THROW 50400, 'The file data, a 64-character hexadecimal Sha256Hash, a MimeType of JPEG, PNG or PDF, a size up to 5 MB, a ReferenceNumber, a DepositDate and a DepositedAmount above zero are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- La pertenencia va en la misma consulta que bloquea el pago: el pago de otra persona responde igual que uno inexistente
  DECLARE @IDOrder INT, @PaymentStatus TINYINT, @Method TINYINT, @OrderStatus TINYINT;
  SELECT @IDOrder = p.IDOrder, @PaymentStatus = p.IDPaymentStatus, @Method = p.IDPaymentMethod, @OrderStatus = o.IDOrderStatus
  FROM dbo.Payments AS p WITH (UPDLOCK, ROWLOCK)
  JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
  WHERE p.IDPayment = @IDPayment AND o.IDUser = @IDUser;

  IF @IDOrder IS NULL
    THROW 50404, 'Payment not found.', 1;
  IF @Method <> 2
    THROW 50422, 'A proof applies to a bank deposit only.', 1;
  IF @PaymentStatus <> 1 OR @OrderStatus <> 1
    THROW 50422, 'A proof can only be registered for a pending deposit.', 1;

  -- Cada rechazo cuenta como un intento; al llegar al máximo el pedido ya se canceló, esto es solo una red de seguridad
  -- IX_Payments_Order fuerza buscar solo los pagos de este pedido: sin él el optimizador recorre el índice por estado y choca con las filas sin confirmar de otros pedidos (deadlock que mostró la prueba de concurrencia)
  IF (SELECT COUNT(*) FROM dbo.Payments WITH (INDEX(IX_Payments_Order)) WHERE IDOrder = @IDOrder AND IDPaymentStatus = 4)
       >= ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'MaxDepositAttempts'), 3)
    THROW 50422, 'DEPOSIT_ATTEMPTS_EXCEEDED: The maximum number of deposit attempts was reached.', 1;

  -- La misma boleta no puede respaldar dos pagos vigentes del mismo banco
  DECLARE @IDBankAccount INT = (SELECT IDBankAccount FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
  IF EXISTS (SELECT 1 FROM dbo.PaymentDeposits
             WHERE IDBankAccount = @IDBankAccount AND ReferenceNumber = @ReferenceNumber AND IsCurrent = 1 AND IDPayment <> @IDPayment)
    THROW 50409, 'REFERENCE_ALREADY_USED: The bank reference backs another payment.', 1;

  -- El mismo archivo no puede respaldar dos depósitos en revisión o aprobados. Uno rechazado sí se puede volver a subir.
  IF EXISTS (SELECT 1 FROM dbo.PaymentProofs AS pr JOIN dbo.Payments AS other ON other.IDPayment = pr.IDPayment
             WHERE pr.Sha256Hash = @Sha256Hash AND pr.IDPayment <> @IDPayment AND other.IDPaymentStatus IN (2, 3))
    THROW 50422, 'PAYMENT_PROOF_REUSED: The file already backs another payment.', 1;

  BEGIN TRY
    INSERT INTO dbo.PaymentProofs (IDPayment, OriginalFileName, StorageKey, MimeType, SizeBytes, Sha256Hash, IDUser, UploadedAt)
    VALUES (@IDPayment, @OriginalFileName, @StorageKey, @MimeType, @SizeBytes, @Sha256Hash, @IDUser, @Now);
    SET @IDPaymentProof = SCOPE_IDENTITY();

    UPDATE dbo.PaymentDeposits
    SET ReferenceNumber = @ReferenceNumber, DepositDate = @DepositDate, DepositedAmount = @DepositedAmount
    WHERE IDPayment = @IDPayment;
  END TRY
  BEGIN CATCH
    -- Dos comprobantes simultáneos con la misma boleta pasan la comprobación anterior; el índice único decide cuál gana
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'REFERENCE_ALREADY_USED: The bank reference or the stored file is already in use.', 1;
    THROW;
  END CATCH;

  -- El pago pasa a revisión. Un pago en revisión no vence: lo resuelve un operador (ver SP_Payments_ExpirePending).
  UPDATE dbo.Payments SET IDPaymentStatus = 2 WHERE IDPayment = @IDPayment;
  INSERT INTO dbo.PaymentStatusHistory (IDPayment, IDPreviousStatus, IDNewStatus, IDUser, Source, CreatedAt, Comment)
  VALUES (@IDPayment, 1, 2, @IDUser, N'Customer', @Now, N'Proof registered');

  DECLARE @New NVARCHAR(MAX) = (SELECT pr.IDPaymentProof, pr.IDPayment, pr.MimeType, pr.SizeBytes, pr.Sha256Hash, ReferenceNumber = @ReferenceNumber,
                                       DepositedAmount = CAST(@DepositedAmount AS VARCHAR(25))
                                FROM dbo.PaymentProofs AS pr WHERE pr.IDPaymentProof = @IDPaymentProof
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDPayment AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Payments', @EntityName = N'PaymentProof', @EntityKey = @EntityKey, @Action = N'Create',
       @NewValue = @New, @IDUser = @IDUser;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
