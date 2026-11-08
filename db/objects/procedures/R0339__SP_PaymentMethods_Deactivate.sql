/* =====================================================================
   Objeto   : dbo.SP_PaymentMethods_Deactivate
   Version  : 1.0.0
   Cambio   : Primera versión: "elimina" un método de pago desactivándolo (nunca se borra: los pagos ya hechos lo citan)
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. Idempotente. Los pagos que ya existen con ese método siguen su curso; solo deja de ofrecerse a nuevos pedidos.
              Errores: 50400, 50404, 50422 actor sin permiso o método no administrable.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_PaymentMethods_Deactivate
  @IDActor         INT,
  @IDPaymentMethod TINYINT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDPaymentMethod IS NULL
    THROW 50400, 'IDActor and IDPaymentMethod are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the payment methods.', 1;

  DECLARE @Kind NVARCHAR(10), @IsActive BIT;
  SELECT @Kind = Kind, @IsActive = IsActive FROM dbo.PaymentMethods WITH (UPDLOCK, ROWLOCK) WHERE IDPaymentMethod = @IDPaymentMethod;
  IF @Kind IS NULL
    THROW 50404, 'Payment method not found.', 1;
  IF @Kind = N'Card'
    THROW 50422, 'PAYMENT_METHOD_NOT_MANAGED: The card payment is configured with the provider, not here.', 1;

  IF @IsActive = 1
  BEGIN
    UPDATE dbo.PaymentMethods SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE IDPaymentMethod = @IDPaymentMethod;

    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDPaymentMethod AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'PaymentMethods', @EntityName = N'PaymentMethod', @EntityKey = @EntityKey, @Action = N'Deactivate',
         @PreviousValue = N'{"IsActive":true}', @NewValue = N'{"IsActive":false}', @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
