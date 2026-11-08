/* =====================================================================
   Objeto   : dbo.SP_PaymentMethods_Update
   Version  : 1.0.0
   Cambio   : Primera versión: edita el texto de un método de pago, para qué forma de recibir se ofrece y si está activo
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. La clase no cambia. La tarjeta no se administra aquí. @IsActive NULL deja el estado como está (con 1 reactiva
              un método). Errores: 50400, 50404, 50409 PAYMENT_METHOD_TITLE_IN_USE, 50422 actor sin permiso o método no administrable.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_PaymentMethods_Update
  @IDActor           INT,
  @IDPaymentMethod   TINYINT,
  @Title             NVARCHAR(80),
  @Description       NVARCHAR(300) = NULL,
  @AppliesToDelivery BIT           = 1,
  @AppliesToPickup   BIT           = 1,
  @IsActive          BIT           = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Title = LTRIM(RTRIM(@Title));
  SET @Description = NULLIF(LTRIM(RTRIM(@Description)), N'');

  IF @IDActor IS NULL OR @IDPaymentMethod IS NULL OR ISNULL(@Title, N'') = N''
    THROW 50400, 'IDActor, IDPaymentMethod and a Title are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the payment methods.', 1;

  DECLARE @Kind NVARCHAR(10) = (SELECT Kind FROM dbo.PaymentMethods WITH (UPDLOCK, ROWLOCK) WHERE IDPaymentMethod = @IDPaymentMethod);
  IF @Kind IS NULL
    THROW 50404, 'Payment method not found.', 1;
  IF @Kind = N'Card'
    THROW 50422, 'PAYMENT_METHOD_NOT_MANAGED: The card payment is configured with the provider, not here.', 1;

  IF @Kind = N'Cash'
  BEGIN
    SET @AppliesToDelivery = 0;
    SET @AppliesToPickup = 1;
  END;
  IF ISNULL(@AppliesToDelivery, 0) = 0 AND ISNULL(@AppliesToPickup, 0) = 0
    THROW 50400, 'The method must apply to a delivery, a pickup or both.', 1;

  IF EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE ISNULL(Title, Name) = @Title AND IsActive = 1 AND IDPaymentMethod <> @IDPaymentMethod)
    THROW 50409, 'PAYMENT_METHOD_TITLE_IN_USE: An active payment method with that title already exists.', 1;

  DECLARE @Previous NVARCHAR(MAX) = (SELECT m.IDPaymentMethod, m.Title, m.Description, m.AppliesToDelivery, m.AppliesToPickup, m.IsActive
                                     FROM dbo.PaymentMethods AS m WHERE m.IDPaymentMethod = @IDPaymentMethod
                                     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

  UPDATE dbo.PaymentMethods
  SET Title = @Title, Name = LEFT(@Title, 60), Description = @Description, AppliesToDelivery = @AppliesToDelivery,
      AppliesToPickup = @AppliesToPickup, IsActive = ISNULL(@IsActive, IsActive), UpdatedAt = SYSUTCDATETIME()
  WHERE IDPaymentMethod = @IDPaymentMethod;

  DECLARE @New NVARCHAR(MAX) = (SELECT m.IDPaymentMethod, m.Title, m.Description, m.AppliesToDelivery, m.AppliesToPickup, m.IsActive
                                FROM dbo.PaymentMethods AS m WHERE m.IDPaymentMethod = @IDPaymentMethod
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDPaymentMethod AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'PaymentMethods', @EntityName = N'PaymentMethod', @EntityKey = @EntityKey, @Action = N'Update',
       @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
