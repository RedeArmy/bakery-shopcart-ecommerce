/* =====================================================================
   Objeto   : dbo.SP_PaymentMethods_Create
   Version  : 1.0.0
   Cambio   : Primera versión: alta de un método de pago de clase depósito o efectivo
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. El efectivo solo se ofrece para recogidas: se guarda así sin importar lo que se envíe. Errores: 50400,
              50409 PAYMENT_METHOD_TITLE_IN_USE, 50422 actor sin permiso o sin identificadores libres.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_PaymentMethods_Create
  @IDActor           INT,
  @Kind              NVARCHAR(10),
  @Title             NVARCHAR(80),
  @Description       NVARCHAR(300) = NULL,
  @AppliesToDelivery BIT           = 1,
  @AppliesToPickup   BIT           = 1,
  @IDPaymentMethod   TINYINT       = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Title = LTRIM(RTRIM(@Title));
  SET @Description = NULLIF(LTRIM(RTRIM(@Description)), N'');

  IF @IDActor IS NULL OR ISNULL(@Title, N'') = N'' OR @Kind IS NULL OR @Kind NOT IN (N'Deposit', N'Cash')
    THROW 50400, 'IDActor, a Title and a Kind of Deposit or Cash are required.', 1;
  IF @Kind = N'Cash'
  BEGIN
    SET @AppliesToDelivery = 0;
    SET @AppliesToPickup = 1;
  END;
  IF ISNULL(@AppliesToDelivery, 0) = 0 AND ISNULL(@AppliesToPickup, 0) = 0
    THROW 50400, 'The method must apply to a delivery, a pickup or both.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the payment methods.', 1;

  -- El identificador no es automático (los códigos viejos son fijos): dos altas simultáneas se serializan con este bloqueo
  DECLARE @LockResult INT;
  EXEC @LockResult = sp_getapplock @Resource = N'PaymentMethods:Create', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 5000;
  IF @LockResult < 0
    THROW 50409, 'Another payment method is being created; retry.', 1;

  IF EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE ISNULL(Title, Name) = @Title AND IsActive = 1)
    THROW 50409, 'PAYMENT_METHOD_TITLE_IN_USE: An active payment method with that title already exists.', 1;

  DECLARE @NextId INT = (SELECT ISNULL(MAX(IDPaymentMethod), 0) + 1 FROM dbo.PaymentMethods);
  IF @NextId > 255
    THROW 50422, 'There are no free payment method identifiers left.', 1;
  SET @IDPaymentMethod = CAST(@NextId AS TINYINT);

  INSERT INTO dbo.PaymentMethods (IDPaymentMethod, Code, Name, Kind, Title, Description, AppliesToDelivery, AppliesToPickup)
  VALUES (@IDPaymentMethod, CONCAT(UPPER(@Kind), N'_', @IDPaymentMethod), LEFT(@Title, 60), @Kind, @Title, @Description,
          @AppliesToDelivery, @AppliesToPickup);

  DECLARE @New NVARCHAR(MAX) = (SELECT m.IDPaymentMethod, m.Code, m.Kind, m.Title, m.Description, m.AppliesToDelivery, m.AppliesToPickup, m.IsActive
                                FROM dbo.PaymentMethods AS m WHERE m.IDPaymentMethod = @IDPaymentMethod
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDPaymentMethod AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'PaymentMethods', @EntityName = N'PaymentMethod', @EntityKey = @EntityKey, @Action = N'Create',
       @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
